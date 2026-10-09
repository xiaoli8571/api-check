import * as checker from './checkers.js';
import providersData from '../config/providers.js';
import regionsData from '../config/regions.json' with { type: 'json' };
import { consumeCentralQuota } from './utils/quota.js';
import { isValidProviderTargetConfig, isValidToken } from './utils/validation.js';

const PROVIDERS = providersData;
const REGIONS = regionsData;

/**
 * @description 单个 WebSocket 会话允许处理的最大 Token 数量。
 * 防止客户端绕过前端限制发送过多 Key。
 */
const MAX_TOKENS_PER_SESSION = 50000;

/**
 * @description 单个批次允许的最大并发数。
 */
const MAX_CONCURRENCY = 20;
const MAX_MESSAGE_BYTES = 5 * 1024 * 1024;
const MAX_MODEL_LENGTH = 512;
const MAX_PROMPT_LENGTH = 4096;
const MAX_VALIDATION_TOKENS = 1024;
const DEFAULT_MAX_TOKENS_PER_IP_WINDOW = 60000;
const DEFAULT_TOKEN_RATE_WINDOW_MS = 60 * 60 * 1000;

function isValidOptionalTokenLimit(value) {
    return value === undefined || (
        Number.isSafeInteger(value) &&
        value >= 1 &&
        value <= MAX_VALIDATION_TOKENS
    );
}

/**
 * @description TaskManager 类负责处理单个批次的检测任务。
 * 支持在同一 WebSocket 会话中被多次重置和复用，以处理多个批次。
 */
export class TaskManager {
    /**
     * @param {object} env - Cloudflare Worker 的环境变量。
     * @param {object} callbacks - 包含 onResult, onError, onBatchDone 等回调函数。
     */
    constructor(env, { onResult, onError, onBatchDone }, clientIP = 'unknown') {
        this.env = env;
        this.clientIP = clientIP;
        this.callbacks = { onResult, onError, onBatchDone };
        this.isProcessing = false;
        this.isStarting = false;
        this.isTerminated = false;
        this.sessionTokenCount = 0;
        this.pauseResolvers = [];
        this._resetBatch();
    }

    /**
     * @description 重置内部状态，为处理新批次做准备。
     */
    _resetBatch() {
        this.queue = [];
        this.currentIndex = 0;
        this.isStopped = false;
        this.isPaused = false;
        this.concurrency = 5;
        this.providerMeta = null;
        this.providerConfig = null;
    }

    /**
     * @description 线程安全地获取下一个任务项。
     * @returns {object|null} - 下一个任务项，如果队列为空则返回 null。
     */
    getNextItem() {
        if (this.currentIndex >= this.queue.length) return null;
        return this.queue[this.currentIndex++];
    }

    /**
     * @description 开始处理接收到的一个批次任务。
     * @param {object} initialData - 包含 tokens, providerConfig, concurrency 的初始数据。
     */
    async start(initialData) {
        if (this.isTerminated) {
            this.callbacks.onError('WebSocket session is already closed');
            return;
        }
        if (this.isProcessing || this.isStarting) {
            this.callbacks.onError('A batch is already being processed');
            return;
        }

        if (!initialData || typeof initialData !== 'object') {
            this.callbacks.onError('Invalid initial data for a batch');
            return;
        }

        const { tokens, providerConfig, concurrency } = initialData;

        if (
            !Array.isArray(tokens) ||
            !isValidProviderTargetConfig(providerConfig, REGIONS) ||
            typeof providerConfig.model !== 'string' ||
            providerConfig.model.length > MAX_MODEL_LENGTH ||
            typeof providerConfig.enableStream !== 'boolean' ||
            (providerConfig.validationPrompt !== undefined && (
                typeof providerConfig.validationPrompt !== 'string' ||
                providerConfig.validationPrompt.length > MAX_PROMPT_LENGTH
            )) ||
            !isValidOptionalTokenLimit(providerConfig.validationMaxTokens) ||
            !isValidOptionalTokenLimit(providerConfig.validationMaxOutputTokens)
        ) {
            this.callbacks.onError('Invalid initial data for a batch');
            return;
        }

        if (
            tokens.length === 0 ||
            tokens.some(item =>
                !item ||
                typeof item !== 'object' ||
                !isValidToken(item.token) ||
                !Number.isSafeInteger(item.order)
            )
        ) {
            this.callbacks.onError('Invalid token data in batch');
            return;
        }

        const orders = new Set(tokens.map(item => item.order));
        if (orders.size !== tokens.length) {
            this.callbacks.onError('Duplicate token order in batch');
            return;
        }

        // 服务端校验：累计限制整个 WebSocket 会话处理的 Token 数量
        if (this.sessionTokenCount + tokens.length > MAX_TOKENS_PER_SESSION) {
            this.callbacks.onError(`Token count exceeds server limit (max ${MAX_TOKENS_PER_SESSION})`);
            return;
        }

        // 服务端校验：限制并发数
        const parsedConcurrency = Number.parseInt(concurrency, 10);
        const safeConcurrency = Number.isFinite(parsedConcurrency)
            ? Math.min(Math.max(parsedConcurrency, 1), MAX_CONCURRENCY)
            : 5;

        const providerMeta = PROVIDERS[providerConfig.provider];
        if (!providerMeta) {
            this.callbacks.onError(`Provider '${providerConfig.provider}' not found`);
            return;
        }

        this.isStarting = true;
        let quota;
        try {
            quota = await this.consumeGlobalQuota(tokens.length);
        } finally {
            this.isStarting = false;
        }
        if (this.isTerminated) return;
        if (quota.serviceUnavailable) {
            this.isPaused = false;
            this.isTerminated = true;
            this.callbacks.onError('Token rate limit service is temporarily unavailable; please retry shortly');
            return;
        }
        if (!quota.allowed) {
            const retrySeconds = Math.ceil((quota.retryAfterMs || 0) / 1000);
            this.isPaused = false;
            this.isTerminated = true;
            this.callbacks.onError(`Token rate limit exceeded; retry after ${retrySeconds} seconds`);
            return;
        }

        const startPaused = this.isPaused;
        this._resetBatch();
        this.isPaused = startPaused;
        this.queue = tokens;
        this.concurrency = safeConcurrency;
        this.providerConfig = providerConfig;
        this.providerMeta = providerMeta;

        this.sessionTokenCount += tokens.length;
        this.isProcessing = true;
        this.runWorkerPool();
    }

    async consumeGlobalQuota(amount) {
        return consumeCentralQuota(this.env, {
            bucketName: `tokens:${this.clientIP}`,
            amount,
            maxValue: this.env.MAX_TOKENS_PER_IP_PER_WINDOW,
            windowValue: this.env.TOKEN_RATE_WINDOW_MS,
            defaultMax: DEFAULT_MAX_TOKENS_PER_IP_WINDOW,
            defaultWindowMs: DEFAULT_TOKEN_RATE_WINDOW_MS,
            logLabel: 'Central token rate limiter failed',
        });
    }

    /**
     * @description 创建并运行一个并发工作池来处理当前批次的任务。
     */
    async runWorkerPool() {
        const workerPromises = [];
        for (let i = 0; i < this.concurrency; i++) {
            const worker = async () => {
                while (true) {
                    if (this.isStopped) break;

                    await this.waitWhilePaused();
                    if (this.isStopped) break;

                    const item = this.getNextItem();
                    if (!item) break;

                    await this.runCheck(item);

                    await new Promise(r => setTimeout(r, 0));
                }
            };
            workerPromises.push(worker());
        }

        await Promise.all(workerPromises);

        this.isProcessing = false;
        if (!this.isStopped) {
            this.callbacks.onBatchDone('Batch processing complete');
        }
    }

    async waitWhilePaused() {
        if (!this.isPaused || this.isStopped) return;
        await new Promise(resolve => this.pauseResolvers.push(resolve));
    }

    pause() {
        if ((this.isProcessing || this.isStarting) && !this.isStopped) {
            this.isPaused = true;
        }
    }

    resume() {
        this.isPaused = false;
        const resolvers = this.pauseResolvers.splice(0);
        for (const resolve of resolvers) resolve();
    }

    /**
     * @description 运行单个 Key 的检测。
     * @param {object} item - 包含 token 和 order 的任务项。
     */
    async runCheck(item) {
        if (this.isStopped) return;
        try {
            // 从 item 对象中正确地取出 token 字符串进行检测
            const result = await checker.checkToken(item.token, this.providerMeta, this.providerConfig, this.env);
            this.callbacks.onResult({ ...result, order: item.order });
        } catch (e) {
            this.callbacks.onResult({ token: item.token, message: e.message, error: true, order: item.order });
        }
    }

    /**
     * @description 停止当前批次的任务。
     */
    stop() {
        this.isTerminated = true;
        this.isStopped = true;
        this.isProcessing = false;
        this.resume();
    }
}

/**
 * @description 处理 WebSocket 会话的入口函数。
 * 支持在同一连接上处理多个批次，客户端通过发送多个 'start' 命令来提交批次。
 * @param {WebSocket} ws - WebSocket 服务器端实例。
 * @param {object} env - Cloudflare Worker 的环境变量。
 * @returns {Promise<void>}
 */
export function handleWebSocketSession(ws, env, clientIP = 'unknown') {
    ws.accept();

    /**
     * @description 安全地向 WebSocket 发送消息，忽略已关闭连接的错误。
     */
    function safeSend(data) {
        try { ws.send(data); } catch (_) { /* 连接已关闭 */ }
    }

    const taskManager = new TaskManager(env, {
        onResult: (result) => safeSend(JSON.stringify({ type: 'result', data: result })),
        onError: (message) => {
            safeSend(JSON.stringify({ type: 'error', message }));
        },
        onBatchDone: (message) => {
            // 批次完成，发送 batch_done 但不关闭连接，等待下一个批次
            safeSend(JSON.stringify({ type: 'batch_done', message }));
        },
    }, clientIP);

    return new Promise((resolve, reject) => {
        ws.addEventListener('message', event => {
            try {
                if (
                    typeof event.data !== 'string' ||
                    new TextEncoder().encode(event.data).byteLength > MAX_MESSAGE_BYTES
                ) {
                    safeSend(JSON.stringify({ type: 'error', message: 'Message is too large or invalid' }));
                    taskManager.stop();
                    ws.close(1009, 'Message too large');
                    return;
                }

                const message = JSON.parse(event.data);
                if (message.command === 'start') {
                    void taskManager.start(message.data);
                } else if (message.command === 'pause') {
                    taskManager.pause();
                } else if (message.command === 'resume') {
                    taskManager.resume();
                } else if (message.command === 'stop') {
                    taskManager.stop();
                    ws.close(1000, 'Client requested stop');
                } else if (message.command === 'done') {
                    // 客户端通知所有批次已完成，关闭连接
                    taskManager.stop();
                    ws.close(1000, 'All batches complete');
                } else {
                    safeSend(JSON.stringify({ type: 'error', message: 'Unknown command' }));
                }
            } catch (e) {
                safeSend(JSON.stringify({ type: 'error', message: 'Invalid JSON message' }));
            }
        });

        let settled = false;
        const closeOrErrorHandler = (err) => {
            if (settled) return;
            settled = true;
            taskManager.stop();
            if (err) {
                console.error('WebSocket error:', err);
                reject(err);
            } else {
                resolve();
            }
        };

        ws.addEventListener('close', () => closeOrErrorHandler());
        ws.addEventListener('error', (err) => closeOrErrorHandler(err));
    });
}
