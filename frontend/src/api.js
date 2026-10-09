import regionsData from '../../config/regions.json';
import providersData, {
    PRIMARY_PROVIDERS as primaryProvidersData,
    ADDITIONAL_PROVIDERS as additionalProvidersData,
} from '../../config/providers.js';

/**
 * @description 区域数据，从配置文件加载。
 */
export const REGIONS = regionsData;
/**
 * @description 一级、更多预置及合并后的全部提供商数据。
 */
export const PRIMARY_PROVIDERS = primaryProvidersData;
export const ADDITIONAL_PROVIDERS = additionalProvidersData;
export const PROVIDERS = providersData;

/**
 * @description 调用后端 /models 接口，获取指定提供商的可用模型列表。
 * @param {string} token - 用于认证的 API Key。
 * @param {{provider: string, baseUrl: string, region?: string}} providerConfig - 提供商配置快照。
 * @returns {Promise<string[]>} - 可用模型ID的数组。
 * @throws {Error} - 如果请求失败或返回无效数据。
 */
export async function fetchModels(token, providerConfig) {
    const body = {
        token,
        providerConfig: {
            provider: providerConfig.provider,
            baseUrl: providerConfig.baseUrl,
            region: providerConfig.region,
        },
    };
    const response = await fetch('/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'An unknown error occurred' }));
        throw new Error(err.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
}


/**
 * @description 旧数据兼容用的最小兜底文案归一化。
 * @param {object} res - API Key 检测的原始结果对象。
 * @returns {{category: string, simpleMessage: string}|null}
 */
function normalizeLegacyError(res) {
    const status = res.rawError?.status || 0;
    const lowerCaseMessage = (res.message || JSON.stringify(res.rawError) || '').toLowerCase();

    if (status === 429 || lowerCaseMessage.includes('rate limit') || lowerCaseMessage.includes('too many requests')) {
        return { category: 'rateLimit', simpleMessage: '请求频繁' };
    }
    if (lowerCaseMessage.includes("doesn't have a free quota tier")) {
        return { category: 'invalid', simpleMessage: '无免费额度' };
    }
    if (
        lowerCaseMessage.includes('insufficient') ||
        lowerCaseMessage.includes('quota') ||
        lowerCaseMessage.includes('balance') ||
        lowerCaseMessage.includes('billing') ||
        lowerCaseMessage.includes('paid') ||
        lowerCaseMessage.includes('top up') ||
        lowerCaseMessage.includes('recharge') ||
        lowerCaseMessage.includes('credit')
    ) {
        return { category: 'invalid', simpleMessage: '额度不足' };
    }
    if (lowerCaseMessage.includes('invalid_api_key') || lowerCaseMessage.includes('api key 无效') || status === 401) {
        return { category: 'invalid', simpleMessage: 'Key 无效' };
    }
    if (lowerCaseMessage.includes('terminated') || lowerCaseMessage.includes('banned')) {
        return { category: 'invalid', simpleMessage: '账号停用' };
    }
    if (lowerCaseMessage.includes('location') || lowerCaseMessage.includes('region') || lowerCaseMessage.includes('country')) {
        return { category: 'invalid', simpleMessage: '区域受限' };
    }
    if (lowerCaseMessage.includes('permission') || lowerCaseMessage.includes('forbidden')) {
        return { category: 'invalid', simpleMessage: '权限不足' };
    }
    if (lowerCaseMessage.includes('model') && (lowerCaseMessage.includes('not found') || lowerCaseMessage.includes('not supported') || lowerCaseMessage.includes('不可用'))) {
        return { category: 'invalid', simpleMessage: '模型不可用' };
    }

    return null;
}

/**
 * @description 根据 API Key 检测结果归类结果桶，并生成结果区短文案。
 * 优先使用后端返回的 errorCategory 和 message，前端仅保留最小兜底逻辑。
 * @param {object} res - API Key 检测的原始结果对象。
 * @returns {{category: string, simpleMessage: string}} - 包含分类和短文案的对象。
 */
export function categorizeTokenError(res) {
    if (!res || res.isValid) return { category: 'valid', simpleMessage: '有效' };

    if (res.errorCategory) {
        return {
            category: res.errorCategory === 'rate_limit' ? 'rateLimit' : 'invalid',
            simpleMessage: res.message || '验证失败'
        };
    }

    const legacyResult = normalizeLegacyError(res);
    if (legacyResult) {
        return legacyResult;
    }

    return { category: 'invalid', simpleMessage: res.message || '验证失败' };
}
