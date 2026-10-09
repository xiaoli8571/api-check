import { corsHeaders, handleOptions } from './utils/cors.js';
import { handleWebSocketSession } from './websocket_handler.js';
import * as modelFetcher from './model_fetchers.js';
import providersData from '../config/providers.js';
import regionsData from '../config/regions.json' with { type: 'json' };
import { checkRateLimit } from './utils/rateLimit.js';
import { getAllowedOrigins, validateOrigin, validateTargetUrl } from './utils/security.js';
import { consumeCentralQuota } from './utils/quota.js';
import { isValidProviderTargetConfig, isValidToken } from './utils/validation.js';
import {
    MAX_CENTRAL_QUOTA,
    MAX_RATE_WINDOW_MS,
    MIN_RATE_WINDOW_MS,
} from './utils/limits.js';

const PROVIDERS = providersData;
const REGIONS = regionsData;
const MAX_MODELS_REQUEST_BYTES = 64 * 1024;
const DEFAULT_MAX_MODELS_REQUESTS_PER_WINDOW = 30;
const DEFAULT_MODELS_RATE_WINDOW_MS = 60_000;

async function readRequestJsonWithLimit(request, maxBytes) {
    const declaredLength = Number.parseInt(request.headers.get('Content-Length') || '', 10);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw Object.assign(new Error('Request body is too large'), { status: 413 });
    }
    if (!request.body) throw new Error('Request body is required');

    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let totalBytes = 0;
    let text = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
                try { await reader.cancel('Request body is too large'); } catch (_) {}
                throw Object.assign(new Error('Request body is too large'), { status: 413 });
            }
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        return JSON.parse(text);
    } finally {
        try { reader.releaseLock(); } catch (_) {}
    }
}

/**
 * @description 使用 Durable Object 为单个客户端 IP 提供跨 isolate 的 Token 配额。
 */
export class RequestRateLimiter {
    constructor(state) {
        this.state = state;
    }

    async fetch(request) {
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let payload;
        try {
            payload = await request.json();
        } catch (_) {
            return new Response('Invalid request', { status: 400 });
        }

        const { amount, maxTokens, windowMs } = payload;
        if (
            !Number.isSafeInteger(amount) || amount < 1 ||
            !Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_CENTRAL_QUOTA ||
            !Number.isSafeInteger(windowMs) || windowMs < MIN_RATE_WINDOW_MS || windowMs > MAX_RATE_WINDOW_MS
        ) {
            return new Response('Invalid request', { status: 400 });
        }

        const now = Date.now();
        let result;
        await this.state.storage.transaction(async transaction => {
            const stored = await transaction.get('token-window');
            const bucket = !stored || now >= stored.resetAt
                ? { count: 0, resetAt: now + windowMs }
                : stored;

            if (bucket.count + amount > maxTokens) {
                result = {
                    allowed: false,
                    retryAfterMs: Math.max(bucket.resetAt - now, 1),
                    resetAt: bucket.resetAt,
                };
                return;
            }

            bucket.count += amount;
            await transaction.put('token-window', bucket);
            result = {
                allowed: true,
                remaining: maxTokens - bucket.count,
                retryAfterMs: 0,
                resetAt: bucket.resetAt,
            };
        });

        if (result.allowed) {
            await this.state.storage.setAlarm(result.resetAt);
        }

        return new Response(JSON.stringify(result), {
            status: result.allowed ? 200 : 429,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    async alarm() {
        await this.state.storage.deleteAll();
    }
}

/**
 * @description 速率限制配置。
 * WS_RATE: WebSocket 连接频率限制（每个 IP 每分钟最多 10 次连接）。
 * MODELS_RATE: /models 接口频率限制（每个 IP 每分钟最多 30 次请求）。
 */
const RATE_LIMITS = {
    WS: { maxRequests: 10, windowMs: 60_000 },
    MODELS: { maxRequests: 30, windowMs: 60_000 },
};

/**
 * @description Durable Object (DO) 用于从指定的 Cloudflare 区域发起网络请求。
 * 它接收一个内部请求，解析出真正的目标 URL 和参数，然后从该 DO 所在的区域发起 fetch。
 */
export class RegionalFetcher {
    async fetch(request) {
        const { targetUrl, method, headers, body } = await request.json();
        if (!['GET', 'POST'].includes(method) || !validateTargetUrl(targetUrl)) {
            return new Response('Invalid or forbidden target URL', { status: 400 });
        }
        const upstreamRequest = new Request(targetUrl, {
            method,
            headers,
            body: typeof body === 'object' ? JSON.stringify(body) : body,
            redirect: 'manual',
            signal: request.signal,
        });
        return fetch(upstreamRequest);
    }
}

/**
 * @description 敏感接口只接受同源请求或显式白名单中的跨源请求。
 */
function isRequestOriginAllowed(request, env) {
    const origin = request.headers.get('Origin');
    if (!origin) return false;

    const requestOrigin = new URL(request.url).origin;
    if (origin === requestOrigin) return true;

    return validateOrigin(origin, getAllowedOrigins(env)) !== null;
}

function originDeniedResponse(request, env) {
    const headers = corsHeaders(request, env);
    headers['Content-Type'] = 'application/json';
    return new Response(JSON.stringify({ error: 'Origin is not allowed' }), {
        status: 403,
        headers,
    });
}

/**
 * @description 处理 /models API 请求，用于获取指定提供商的可用模型列表。
 * @param {Request} request - 传入的请求对象。
 * @param {object} env - Cloudflare Worker 的环境变量。
 * @returns {Promise<Response>} - 包含模型列表或错误信息的响应。
 */
async function handleModelsRequest(request, env) {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    let requestBody;
    try {
        requestBody = await readRequestJsonWithLimit(request, MAX_MODELS_REQUEST_BYTES);
    } catch (e) {
        return new Response(
            e?.status === 413 ? 'Request body is too large' : 'Invalid JSON in request body',
            { status: e?.status === 413 ? 413 : 400 },
        );
    }

    const { token, providerConfig } = requestBody;
    if (
        !isValidToken(token) ||
        !isValidProviderTargetConfig(providerConfig, REGIONS)
    ) {
        return new Response('Invalid request body', { status: 400 });
    }

    const providerMeta = PROVIDERS[providerConfig.provider];
    if (!providerMeta) {
        return new Response(`Provider '${providerConfig.provider}' not found`, { status: 400 });
    }

    try {
        const models = await modelFetcher.getModels(providerMeta, token, providerConfig, env);
        const responseHeaders = corsHeaders(request, env);
        responseHeaders['Content-Type'] = 'application/json';
        return new Response(JSON.stringify(models), { headers: responseHeaders });
    } catch (error) {
        const responseHeaders = corsHeaders(request, env);
        responseHeaders['Content-Type'] = 'application/json';
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: responseHeaders,
        });
    }
}

/**
 * @description 获取客户端 IP 地址，优先使用 Cloudflare 提供的 CF-Connecting-IP。
 * @param {Request} request - 传入的请求对象。
 * @returns {string} - 客户端 IP 地址。
 */
function getClientIP(request) {
    return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown';
}

/**
 * @description 创建速率限制超限的响应。
 * @param {number} retryAfterMs - 建议客户端重试的等待时间（毫秒）。
 * @param {Request} request - 传入的请求对象。
 * @param {object} env - 环境变量。
 * @returns {Response} - 429 响应。
 */
function rateLimitResponse(retryAfterMs, request, env) {
    const headers = corsHeaders(request, env);
    headers['Retry-After'] = String(Math.ceil(retryAfterMs / 1000));
    headers['Content-Type'] = 'application/json';
    return new Response(JSON.stringify({ error: 'Too many requests, please try again later.' }), {
        status: 429,
        headers,
    });
}

function serviceUnavailableResponse(request, env) {
    const headers = corsHeaders(request, env);
    headers['Retry-After'] = '5';
    headers['Content-Type'] = 'application/json';
    return new Response(JSON.stringify({ error: 'Rate limit service is temporarily unavailable.' }), {
        status: 503,
        headers,
    });
}

async function consumeModelsQuota(env, clientIP) {
    return consumeCentralQuota(env, {
        bucketName: `models:${clientIP}`,
        amount: 1,
        maxValue: env.MAX_MODELS_REQUESTS_PER_IP_PER_WINDOW,
        windowValue: env.MODELS_RATE_WINDOW_MS,
        defaultMax: DEFAULT_MAX_MODELS_REQUESTS_PER_WINDOW,
        defaultWindowMs: DEFAULT_MODELS_RATE_WINDOW_MS,
        logLabel: 'Central models rate limiter failed',
    });
}

/**
 * @description Cloudflare Worker 的主入口点。
 * 它处理所有传入的 HTTP 请求，并根据路径路由到不同的处理器。
 */
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const pathname = url.pathname;

        // 处理 CORS 预检请求
        if (request.method === 'OPTIONS') {
            return handleOptions(request, env);
        }

        // /check 路径用于 WebSocket 连接，处理实时检测任务
        if (pathname === '/check') {
            if (!isRequestOriginAllowed(request, env)) {
                return originDeniedResponse(request, env);
            }

            const upgradeHeader = request.headers.get('Upgrade');
            if (upgradeHeader?.toLowerCase() !== 'websocket') {
                return new Response('Expected a WebSocket upgrade request', { status: 426 });
            }

            // WebSocket 连接速率限制
            const clientIP = getClientIP(request);
            const wsLimit = checkRateLimit(`ws:${clientIP}`, RATE_LIMITS.WS.maxRequests, RATE_LIMITS.WS.windowMs);
            if (!wsLimit.allowed) {
                return rateLimitResponse(wsLimit.retryAfterMs, request, env);
            }

            const [client, server] = Object.values(new WebSocketPair());
            
            // 将 WebSocket 会话处理委托给 handler，并确保 Worker 在会话期间保持活动状态
            ctx.waitUntil(handleWebSocketSession(server, env, clientIP));

            const responseHeaders = corsHeaders(request, env);

            // 返回 101 响应，升级连接到 WebSocket
            return new Response(null, {
                status: 101,
                webSocket: client,
                headers: responseHeaders,
            });
        }

        // /models 路径用于获取模型列表
        if (pathname === '/models') {
            if (!isRequestOriginAllowed(request, env)) {
                return originDeniedResponse(request, env);
            }

            // /models 接口速率限制
            const clientIP = getClientIP(request);
            const modelsLimit = checkRateLimit(`models:${clientIP}`, RATE_LIMITS.MODELS.maxRequests, RATE_LIMITS.MODELS.windowMs);
            if (!modelsLimit.allowed) {
                return rateLimitResponse(modelsLimit.retryAfterMs, request, env);
            }

            const centralModelsLimit = await consumeModelsQuota(env, clientIP);
            if (centralModelsLimit.serviceUnavailable) {
                return serviceUnavailableResponse(request, env);
            }
            if (!centralModelsLimit.allowed) {
                return rateLimitResponse(centralModelsLimit.retryAfterMs, request, env);
            }
            return handleModelsRequest(request, env);
        }

        // 默认情况下，尝试提供静态资源（前端应用）
        try {
            return await env.ASSETS.fetch(request);
        } catch (e) {
            return new Response("静态资源服务配置错误，请检查 wrangler.toml。", { status: 500 });
        }
    },
};
