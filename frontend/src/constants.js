/**
 * @description 应用程序的全局常量配置。
 */

/**
 * @description 单次检测支持的最大 Key 数量。
 * 超过此限制会提示用户分批处理。
 */
export const MAX_KEYS_LIMIT = 50000;

/**
 * @description 文件导入的最大大小（字节）。
 * 10MB 足以容纳 5 万个 Key。
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * @description 每个批次发送到后端的 Key 的数量。
 * 批次处理可以避免单次传输过大导致的内存问题。
 */
export const BATCH_SIZE = 500;

/**
 * @description WebSocket 连接失败时的最大重连尝试次数。
 */
export const MAX_RECONNECT_ATTEMPTS = 3;

/**
 * @description 结果缓冲区刷新间隔（毫秒）。
 * 批量更新 UI 以提升性能。
 */
export const BUFFER_FLUSH_INTERVAL = 100;

/**
 * @description 结果缓冲区最大容量。
 * 超过此值立即刷新，避免内存占用过高。
 */
export const BUFFER_MAX_SIZE = 50;

/**
 * @description 所有结果类别的枚举。
 * 用于统一管理结果分类，避免字符串重复。
 */
export const RESULT_CATEGORIES = ['valid', 'lowBalance', 'zeroBalance', 'rateLimit', 'invalid', 'duplicate'];

/**
 * @description 结果标签页配置。
 * balanceOnly 为 true 时，仅在支持余额的 provider 下显示。
 */
export const RESULT_TAB_CONFIG = [
    { id: 'valid', name: '有效', sortable: true, balanceOnly: false },
    { id: 'lowBalance', name: '低额', sortable: true, balanceOnly: true },
    { id: 'zeroBalance', name: '零额', sortable: false, balanceOnly: true },
    { id: 'rateLimit', name: '限流', sortable: false, balanceOnly: false },
    { id: 'invalid', name: '无效', sortable: false, balanceOnly: false },
    { id: 'duplicate', name: '重复', sortable: false, balanceOnly: false },
];
