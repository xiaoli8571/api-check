import { getAllowedOrigins, validateOrigin } from "./security.js";

/**
 * @description 基于请求和环境配置生成 CORS Header。
 * @param {Request} request - 传入的请求对象。
 * @param {object} env - Cloudflare Worker 的环境变量。
 * @returns {object} - 包含 CORS 头的对象。
 */
export function corsHeaders(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = getAllowedOrigins(env);
    const validOrigin = validateOrigin(origin, allowedOrigins);

    const headers = {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, x-goog-api-key, anthropic-version, anthropic-dangerous-direct-browser-access",
        "Access-Control-Max-Age": "86400",
        "X-Robots-Tag": "noindex, nofollow",
        "Vary": "Origin",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';"
    };

    if (validOrigin) {
        headers["Access-Control-Allow-Origin"] = validOrigin;
    }

    return headers;
}

/**
 * @description 处理 CORS 预检请求（OPTIONS 方法）。
 * @param {Request} request - 传入的请求对象。
 * @param {object} env - Cloudflare Worker 的环境变量。
 * @returns {Response} - 预检请求的响应。
 */
export function handleOptions(request, env) {
    const headers = corsHeaders(request, env);
    return new Response(null, {
        status: headers["Access-Control-Allow-Origin"] ? 204 : 403,
        headers,
    });
}
