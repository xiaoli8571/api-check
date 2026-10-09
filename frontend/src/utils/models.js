import { fetchModels } from '@/api';

/**
 * @description 获取并稳定排序指定 Key 可用的模型列表。
 */
export async function fetchAvailableModels(token, providerConfig) {
    const models = await fetchModels(token, providerConfig);
    if (!Array.isArray(models)) return [];
    return models
        .filter(model => typeof model === 'string' && model.length > 0)
        .sort((a, b) => a.localeCompare(b));
}
