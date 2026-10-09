/**
 * @description 缓存解析后的允许来源列表，避免重复解析。
 */
let cachedAllowedOrigins = null;
let cachedEnvKey = null;

/**
 * @description 从环境变量中解析允许的 CORS 来源白名单。
 * 预期环境变量 `ALLOWED_ORIGINS` 为 JSON 字符串数组，例如 `'["https://example.com","https://*.example.com"]''`。
 * @param {object} env - Cloudflare Worker 的环境变量。
 * @returns {string[]} - 解析后的允许来源数组，如果解析失败则返回空数组。
 */
export function getAllowedOrigins(env) {
    const envValue = env.ALLOWED_ORIGINS || "[]";
    if (cachedEnvKey === envValue) {
        return cachedAllowedOrigins;
    }
    try {
        const parsed = JSON.parse(envValue);
        cachedAllowedOrigins = Array.isArray(parsed)
            ? parsed.filter(rule => typeof rule === 'string' && rule.length > 0)
            : [];
        cachedEnvKey = envValue;
        return cachedAllowedOrigins;
    } catch (e) {
        cachedAllowedOrigins = [];
        cachedEnvKey = envValue;
        return [];
    }
}

/**
 * @description 缓存编译后的通配符正则表达式。
 */
const regexCache = new Map();

/**
 * @description 校验请求的 Origin 是否在允许的白名单范围内。
 * 支持子域通配符（例如 `https://*.example.com`）。
 * @param {string} origin - 请求头中的 Origin 字符串。
 * @param {string[]} allowedOrigins - 允许的 Origin 白名单数组。
 * @returns {string|null} - 如果 Origin 合法，则返回实际的 Origin 字符串；否则返回 `null`。
 */
export function validateOrigin(origin, allowedOrigins) {
    if (!origin) return null;

    for (const rule of allowedOrigins) {
        if (rule === origin) return origin;

        if (rule.includes("*")) {
            let regex = regexCache.get(rule);
            if (!regex) {
                const pattern = rule
                    .split('*')
                    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                    .join('[^.]+');
                regex = new RegExp(`^${pattern}$`);
                regexCache.set(rule, regex);
            }
            if (regex.test(origin)) return origin;
        }
    }
    return null;
}

/**
 * @description 检查 IPv4 地址是否属于私有/保留网段。
 * @param {string} hostname - 待检查的主机名。
 * @returns {boolean} - 如果是私有/保留地址则返回 true。
 */
function isPrivateIPv4(hostname) {
    const parts = hostname.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return false;

    const [a, b] = parts;

    // 0.0.0.0/8 - 当前网络
    if (a === 0) return true;
    // 10.0.0.0/8 - RFC1918 私有地址
    if (a === 10) return true;
    // 100.64.0.0/10 - CGNAT 共享地址空间 (RFC6598)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 127.0.0.0/8 - 回环地址
    if (a === 127) return true;
    // 169.254.0.0/16 - 链路本地 / 云元数据端点
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 - RFC1918 私有地址
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 - RFC1918 私有地址
    if (a === 192 && b === 168) return true;
    // 192.0.0.0/24 - IETF 协议保留地址
    if (a === 192 && b === 0 && parts[2] === 0) return true;
    // 文档、测试和已弃用的中继地址
    if (a === 192 && b === 0 && parts[2] === 2) return true;
    if (a === 192 && b === 88 && parts[2] === 99) return true;
    if (a === 198 && b === 51 && parts[2] === 100) return true;
    if (a === 203 && b === 0 && parts[2] === 113) return true;
    // 198.18.0.0/15 - 基准测试地址 (RFC2544)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 224.0.0.0/4 与 240.0.0.0/4 - 组播和保留地址
    if (a >= 224) return true;
    // 255.255.255.255 - 广播地址
    if (parts.every(p => p === 255)) return true;

    return false;
}

/**
 * @description 检查 IPv6 地址是否属于私有/保留网段。
 * @param {string} raw - 去除方括号后的 IPv6 地址字符串。
 * @returns {boolean} - 如果是私有/保留地址则返回 true。
 */
function parseIPv6(raw) {
    let value = raw.toLowerCase().split('%')[0];

    if (value.includes('.')) {
        const lastColon = value.lastIndexOf(':');
        if (lastColon === -1) return null;
        const v4 = value.slice(lastColon + 1);
        const parts = v4.split('.').map(Number);
        if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
            return null;
        }
        const high = ((parts[0] << 8) | parts[1]).toString(16);
        const low = ((parts[2] << 8) | parts[3]).toString(16);
        value = `${value.slice(0, lastColon)}:${high}:${low}`;
    }

    const halves = value.split('::');
    if (halves.length > 2) return null;
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;

    const parts = [...left, ...Array(missing).fill('0'), ...right];
    if (parts.length !== 8 || parts.some(part => !/^[0-9a-f]{1,4}$/.test(part))) return null;
    return parts.map(part => Number.parseInt(part, 16));
}

function isPrivateIPv6(raw) {
    const words = parseIPv6(raw);
    if (!words) return true;

    const allZeroPrefix = words.slice(0, 6).every(word => word === 0);
    // 未指定、回环与已弃用的 IPv4-compatible 地址。
    if (words.every(word => word === 0)) return true;
    if (words.slice(0, 7).every(word => word === 0) && words[7] === 1) return true;
    if (allZeroPrefix) {
        const mappedIPv4 = `${words[6] >> 8}.${words[6] & 0xff}.${words[7] >> 8}.${words[7] & 0xff}`;
        if (isPrivateIPv4(mappedIPv4)) return true;
    }

    // ::ffff:0:0/96 - IPv4 映射地址。
    if (words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff) {
        const mappedIPv4 = `${words[6] >> 8}.${words[6] & 0xff}.${words[7] >> 8}.${words[7] & 0xff}`;
        if (isPrivateIPv4(mappedIPv4)) return true;
    }

    // fc00::/7 - 唯一本地地址。
    if ((words[0] & 0xfe00) === 0xfc00) return true;
    // fe80::/10 - 链路本地地址，覆盖 fe80:: 到 febf::。
    if ((words[0] & 0xffc0) === 0xfe80) return true;
    // ff00::/8 - IPv6 组播地址。
    if ((words[0] & 0xff00) === 0xff00) return true;
    // 文档和基准测试前缀。
    if (words[0] === 0x2001 && words[1] === 0x0db8) return true;
    if (words[0] === 0x2001 && words[1] === 0x0002) return true;
    if (words[0] === 0x3fff && (words[1] & 0xf000) === 0) return true;

    return false;
}

/**
 * @description 校验目标 URL 的安全性，防止 SSRF（Server-Side Request Forgery）攻击。
 * 允许 HTTP/HTTPS 协议，并禁止访问内网地址、保留地址和云元数据端点。
 * @param {string} targetUrl - 待校验的目标 URL 字符串。
 * @returns {boolean} - 如果 URL 安全则返回 `true`，否则返回 `false`。
 */
export function validateTargetUrl(targetUrl) {
    try {
        const url = new URL(targetUrl);

        // 只允许 HTTP/HTTPS 协议
        if (!["http:", "https:"].includes(url.protocol)) return false;
        if (url.username || url.password) return false;

        const hostname = url.hostname.toLowerCase().replace(/\.+$/, '');

        // 禁止 localhost 及内网域名后缀
        const forbiddenHosts = ['localhost', 'localhost.localdomain'];
        if (forbiddenHosts.includes(hostname)) return false;

        const forbiddenSuffixes = ['.local', '.internal', '.localhost', '.example', '.invalid', '.test', '.lan', '.home'];
        if (forbiddenSuffixes.some(s => hostname.endsWith(s))) return false;

        // 检查 IPv6 地址（URL 中以方括号包裹）
        if (hostname.startsWith('[') && hostname.endsWith(']')) {
            const ipv6 = hostname.slice(1, -1);
            if (isPrivateIPv6(ipv6)) return false;
        }
        // 检查纯 IPv6（URL 解析后可能去掉方括号）
        else if (hostname.includes(':')) {
            if (isPrivateIPv6(hostname)) return false;
        }
        // 检查 IPv4 地址
        else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
            if (isPrivateIPv4(hostname)) return false;
        }

        return true;
    } catch (err) {
        return false;
    }
}
