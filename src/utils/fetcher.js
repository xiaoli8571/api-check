import { validateTargetUrl } from './security.js';
import { UserAgentManager } from './userAgent.js';

/**
 * @description 单例 UserAgentManager 实例，避免每次请求都创建新实例。
 */
const uaManager = new UserAgentManager();
const REGIONAL_FETCHER_VERSION = 'v2';
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * @description 将响应体包装为受同一个 AbortController 控制的流，确保超时覆盖完整响应体。
 */
function wrapResponseWithTimeout(response, controller, timeoutId) {
    if (!response.body) {
        clearTimeout(timeoutId);
        return response;
    }

    const reader = response.body.getReader();
    let finished = false;
    let streamControllerRef = null;
    const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutId);
        controller.signal.removeEventListener('abort', abortHandler);
    };
    const abortHandler = () => {
        if (finished) return;
        const reason = controller.signal.reason || new DOMException('Request timeout', 'AbortError');
        finish();
        reader.cancel(reason).catch(() => {});
        streamControllerRef?.error(reason);
    };
    controller.signal.addEventListener('abort', abortHandler, { once: true });

    const body = new ReadableStream({
        async pull(streamController) {
            streamControllerRef = streamController;
            try {
                const { done, value } = await reader.read();
                if (finished) return;
                if (done) {
                    finish();
                    streamController.close();
                    return;
                }
                streamController.enqueue(value);
            } catch (error) {
                if (finished) return;
                finish();
                streamController.error(error);
            }
        },
        async cancel(reason) {
            finish();
            controller.abort(reason);
            try {
                await reader.cancel(reason);
            } catch (_) {
                // 原始流可能已经关闭。
            }
        },
    });

    return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}

/**
 * @description 安全地发起代理请求的通用函数。它会根据配置决定是否通过 Durable Object 进行区域代理。
 * @param {string} url - 目标 URL。
 * @param {RequestInit} options - fetch 请求的选项。
 * @param {string} region - 指定的区域名称，用于 Durable Object 代理。
 * @param {object} env - Cloudflare Worker 的环境变量。
 * @param {number} [timeout=30000] - 请求超时时间（毫秒），默认 30 秒。
 * @returns {Promise<Response>} - fetch 请求的响应。
 */
export async function secureProxiedFetch(url, options, region, env, timeout = 30000) {
    if (!validateTargetUrl(url)) {
        return new Response(JSON.stringify({ error: { message: 'Invalid or forbidden target URL' } }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const enableUaRandomization = env.ENABLE_UA_RANDOMIZATION !== 'false';
    const enableAcceptLanguageRandomization = env.ENABLE_ACCEPT_LANGUAGE_RANDOMIZATION !== 'false';

    const finalHeaders = { ...options.headers };

    if (enableUaRandomization) {
        const randomUA = uaManager.getRandomUserAgent();
        if (randomUA) finalHeaders['user-agent'] = randomUA;
    }

    if (enableAcceptLanguageRandomization) {
        const randomAcceptLanguage = uaManager.getRandomAcceptLanguage();
        if (randomAcceptLanguage) finalHeaders['accept-language'] = randomAcceptLanguage;
    }

    // 添加超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const finalOptions = {
        ...options,
        headers: finalHeaders,
        signal: controller.signal,
        redirect: 'manual',
    };

    try {
        const fetchOnce = async (targetUrl, requestOptions) => {
            // 如果没有指定区域或没有 Durable Object 绑定，则直接发起请求
            if (!region || !env.REGIONAL_FETCHER) {
                return fetch(targetUrl, requestOptions);
            }

            try {
                // 使用新名称避免复用在修复 locationHint 之前已经放置到错误区域的实例。
                const doId = env.REGIONAL_FETCHER.idFromName(`${REGIONAL_FETCHER_VERSION}:${region}`);
                const doStub = env.REGIONAL_FETCHER.get(doId, { locationHint: region });

                const payload = {
                    targetUrl,
                    method: requestOptions.method,
                    headers: requestOptions.headers,
                    body: requestOptions.body,
                };

                const targetHostname = new URL(targetUrl).hostname;
                const internalUrl = `http://do.internal/proxy/${targetHostname}`;

                const proxyRequestToDO = new Request(internalUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                return await doStub.fetch(proxyRequestToDO);
            } catch (error) {
                if (error?.name === 'AbortError') throw error;
                console.error(`Durable Object fetch failed for region ${region}:`, error);
                throw new Error(`Regional fetch failed for ${region}: ${error.message}`);
            }
        };

        let currentUrl = url;
        let currentOptions = finalOptions;

        for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
            const response = await fetchOnce(currentUrl, currentOptions);
            if (!REDIRECT_STATUSES.has(response.status)) {
                return wrapResponseWithTimeout(response, controller, timeoutId);
            }

            const location = response.headers.get('Location');
            if (!location) {
                return wrapResponseWithTimeout(response, controller, timeoutId);
            }

            try { await response.body?.cancel(); } catch (_) {}

            if (redirectCount === MAX_REDIRECTS) {
                clearTimeout(timeoutId);
                return new Response(JSON.stringify({ error: { message: 'Too many redirects' } }), {
                    status: 508,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            const nextUrl = new URL(location, currentUrl);
            const currentOrigin = new URL(currentUrl).origin;
            if (!validateTargetUrl(nextUrl.href) || nextUrl.origin !== currentOrigin) {
                clearTimeout(timeoutId);
                return new Response(JSON.stringify({ error: { message: 'Invalid or cross-origin redirect target' } }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            const shouldSwitchToGet = response.status === 303 || (
                [301, 302].includes(response.status) && currentOptions.method === 'POST'
            );
            if (shouldSwitchToGet) {
                const redirectedHeaders = { ...currentOptions.headers };
                for (const key of Object.keys(redirectedHeaders)) {
                    if (['content-length', 'content-type'].includes(key.toLowerCase())) {
                        delete redirectedHeaders[key];
                    }
                }
                currentOptions = {
                    ...currentOptions,
                    method: 'GET',
                    headers: redirectedHeaders,
                    body: undefined,
                };
            }
            currentUrl = nextUrl.href;
        }

        throw new Error('Unexpected redirect state');
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            return new Response(JSON.stringify({ error: { message: 'Request timeout' } }), {
                status: 408,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        throw error;
    }
}
