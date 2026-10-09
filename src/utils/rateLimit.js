/**
 * @description 基于滑动窗口的内存速率限制器。
 * 注意：在 Cloudflare Workers 中，每个 isolate 有独立的内存空间，
 * 因此这是一个尽力而为（best-effort）的限制器，无法跨 isolate 共享状态。
 * 对于严格的速率限制，建议配合 Cloudflare Rate Limiting Rules 使用。
 */

/** @type {Map<string, number[]>} 存储每个 key 的请求时间戳数组。*/
const requestLog = new Map();

/**
 * @description 检查指定 key 是否超过速率限制。
 * @param {string} key - 限制的唯一标识（通常是客户端 IP）。
 * @param {number} maxRequests - 时间窗口内允许的最大请求数。
 * @param {number} windowMs - 时间窗口（毫秒）。
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
 */
export function checkRateLimit(key, maxRequests, windowMs) {
    const now = Date.now();

    let timestamps = requestLog.get(key) || [];
    timestamps = timestamps.filter(t => now - t < windowMs);

    // 懒清理：1% 概率清理过期条目
    if (Math.random() < 0.01) {
        for (const [k, ts] of requestLog) {
            const valid = ts.filter(t => now - t < windowMs);
            if (valid.length === 0) {
                requestLog.delete(k);
            } else {
                requestLog.set(k, valid);
            }
        }
    }

    if (timestamps.length >= maxRequests) {
        const oldestInWindow = timestamps[0];
        const retryAfterMs = windowMs - (now - oldestInWindow);
        return { allowed: false, remaining: 0, retryAfterMs };
    }

    timestamps.push(now);
    requestLog.set(key, timestamps);

    return { allowed: true, remaining: maxRequests - timestamps.length, retryAfterMs: 0 };
}
