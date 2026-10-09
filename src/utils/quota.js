import {
    MAX_CENTRAL_QUOTA,
    MAX_RATE_WINDOW_MS,
    MIN_RATE_WINDOW_MS,
} from './limits.js';

function parseBoundedInteger(value, fallback, min, max) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
        ? parsed
        : fallback;
}

/**
 * @description 调用集中式 Durable Object 固定窗口配额。
 */
export async function consumeCentralQuota(env, {
    bucketName,
    amount,
    maxValue,
    windowValue,
    defaultMax,
    defaultWindowMs,
    logLabel,
}) {
    if (!env.REQUEST_RATE_LIMITER) {
        return { allowed: true, retryAfterMs: 0 };
    }

    const maxTokens = parseBoundedInteger(maxValue, defaultMax, 1, MAX_CENTRAL_QUOTA);
    const windowMs = parseBoundedInteger(
        windowValue,
        defaultWindowMs,
        MIN_RATE_WINDOW_MS,
        MAX_RATE_WINDOW_MS,
    );

    try {
        const id = env.REQUEST_RATE_LIMITER.idFromName(bucketName);
        const stub = env.REQUEST_RATE_LIMITER.get(id);
        const response = await stub.fetch(new Request('http://rate-limiter.internal/consume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, maxTokens, windowMs }),
        }));

        if (response.status === 429) {
            const result = await response.json();
            return {
                allowed: false,
                retryAfterMs: Number.isFinite(result?.retryAfterMs) && result.retryAfterMs > 0
                    ? result.retryAfterMs
                    : windowMs,
            };
        }
        if (!response.ok) {
            throw new Error(`Rate limiter returned HTTP ${response.status}`);
        }

        const result = await response.json();
        if (result?.allowed !== true) throw new Error('Rate limiter returned an invalid response');
        return result;
    } catch (error) {
        console.error(`${logLabel}:`, error);
        return { allowed: false, serviceUnavailable: true };
    }
}
