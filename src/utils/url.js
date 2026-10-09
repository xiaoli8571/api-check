/**
 * @description 规范化 baseUrl，移除尾部的斜杠。
 * @param {string} url - 需要规范化的 URL。
 * @returns {string} - 规范化后的 URL。
 */
export function normalizeBaseUrl(url) {
    return url.replace(/\/+$/, "");
}
