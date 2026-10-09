import { secureProxiedFetch } from './utils/fetcher.js';
import { normalizeBaseUrl } from './utils/url.js';
import { readBodyJsonWithLimit, readBodyTextWithLimit } from './utils/body.js';
import providersData from '../config/providers.js';

const PROVIDERS = providersData;
const MAX_MODEL_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_MODEL_TOTAL_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_MODEL_TOTAL_TIME_MS = 120_000;
const MAX_MODEL_PAGES = 20;
const MAX_MODELS = 10000;
const MAX_PAGE_TOKEN_LENGTH = 4096;

function readModelText(response, totalBudget = null) {
    return readBodyTextWithLimit(response, {
        maxBytes: MAX_MODEL_RESPONSE_BYTES,
        label: 'Model response',
        budget: totalBudget,
        totalLimitMessage: totalBudget
            ? `Model pagination exceeds total response limit (${totalBudget.maxBytes} bytes)`
            : '',
    });
}

function readModelJson(response, totalBudget = null) {
    return readBodyJsonWithLimit(response, {
        maxBytes: MAX_MODEL_RESPONSE_BYTES,
        label: 'Model response',
        budget: totalBudget,
        totalLimitMessage: totalBudget
            ? `Model pagination exceeds total response limit (${totalBudget.maxBytes} bytes)`
            : '',
    });
}

function normalizeModelIds(models) {
    if (!Array.isArray(models)) return [];
    const ids = models.map(model => model?.id).filter(id => typeof id === 'string' && id.length > 0);
    if (ids.length > MAX_MODELS) throw new Error(`Model count exceeds limit (${MAX_MODELS})`);
    return ids;
}

/**
 * @description 从 OpenAI 兼容 API 获取模型列表。
 * @param {string} token - API Key。
 * @param {string} baseUrl - API 基础 URL。
 * @param {string} region - 区域信息。
 * @param {object} env - 环境变量。
 * @returns {Promise<string[]>} - 模型 ID 数组。
 */
async function fetchOpenAIModels(token, baseUrl, region, env) {
    const apiUrl = normalizeBaseUrl(baseUrl) + "/models";
    const response = await secureProxiedFetch(apiUrl, { method: "GET", headers: { Authorization: "Bearer " + token } }, region, env);
    if (!response.ok) throw new Error("HTTP " + response.status + ": " + (await readModelText(response)));
    const data = await readModelJson(response);
    if (Array.isArray(data)) return normalizeModelIds(data);
    if (data && Array.isArray(data.data)) return normalizeModelIds(data.data);
    return [];
}

/**
 * @description 从 GitHub Models API 获取模型列表，包含回退逻辑。
 * @param {string} token - API Key。
 * @param {string} baseUrl - API 基础 URL。
 * @param {string} region - 区域信息。
 * @param {object} env - 环境变量。
 * @returns {Promise<string[]>} - 模型 ID 数组。
 */
async function fetchGitHubModels(token, baseUrl, region, env) {
    try {
        const models = await fetchOpenAIModels(token, baseUrl, region, env);
        if (models && models.length > 0) return models;
    } catch (error) {
        console.warn("GitHub /models endpoint failed, trying fallback...", error.message);
    }
    const apiUrl = normalizeBaseUrl(baseUrl || PROVIDERS.github.defaultBase).replace("/inference", "") + "/catalog/models";
    const response = await secureProxiedFetch(apiUrl, { method: "GET", headers: { Authorization: "Bearer " + token } }, region, env);
    if (!response.ok) throw new Error("Fallback /catalog/models failed with HTTP " + response.status + ": " + (await readModelText(response)));
    const data = await readModelJson(response);
    if (data && Array.isArray(data.data) && data.data.length > 0) return normalizeModelIds(data.data);
    if (Array.isArray(data) && data.length > 0) return normalizeModelIds(data);
    throw new Error("Fallback /catalog/models returned no models.");
}

/**
 * @description 从 Google Gemini API 获取模型列表，支持分页。
 * @param {string} token - API Key。
 * @param {string} baseUrl - API 基础 URL。
 * @param {string} region - 区域信息。
 * @param {object} env - 环境变量。
 * @returns {Promise<string[]>} - 模型 ID 数组。
 */
async function fetchGoogleModels(token, baseUrl, region, env) {
    const allModels = [];
    let pageToken = null;
    let pageCount = 0;
    const seenPageTokens = new Set();
    const totalBudget = { usedBytes: 0, maxBytes: MAX_MODEL_TOTAL_RESPONSE_BYTES };
    const deadline = Date.now() + MAX_MODEL_TOTAL_TIME_MS;

    while (true) {
        pageCount++;
        if (pageCount > MAX_MODEL_PAGES) {
            throw new Error(`Model pagination exceeds limit (${MAX_MODEL_PAGES} pages)`);
        }
        const remainingTimeMs = deadline - Date.now();
        if (remainingTimeMs <= 0) {
            throw new Error(`Model pagination exceeds total time limit (${MAX_MODEL_TOTAL_TIME_MS} ms)`);
        }

        const apiUrl = new URL(`${normalizeBaseUrl(baseUrl)}/v1beta/models`);
        if (pageToken) apiUrl.searchParams.set('pageToken', pageToken);
        const response = await secureProxiedFetch(
            apiUrl.href,
            {
                method: "GET",
                headers: { "x-goog-api-key": token }
            },
            region,
            env,
            Math.min(30_000, remainingTimeMs),
        );

        if (!response.ok) {
            const err = await readModelJson(response, totalBudget).catch(() => null);
            throw new Error(err?.error?.message || `HTTP ${response.status}`);
        }

        const data = await readModelJson(response, totalBudget);
        const models = Array.isArray(data.models) ? data.models : [];

        // 过滤支持 generateContent 且非 embedding 模型
        const validModels = models
            .filter((m) =>
                typeof m?.name === 'string' &&
                m.supportedGenerationMethods?.includes("generateContent") &&
                !m.name.includes("embedding")
            )
            .map((m) => m.name.replace("models/", ""));

        allModels.push(...validModels);
        if (allModels.length > MAX_MODELS) {
            throw new Error(`Model count exceeds limit (${MAX_MODELS})`);
        }

        const nextPageToken = data.nextPageToken;
        if (!nextPageToken) break;
        if (typeof nextPageToken !== 'string') throw new Error('Invalid model page token');
        if (nextPageToken.length > MAX_PAGE_TOKEN_LENGTH) {
            throw new Error(`Model page token exceeds limit (${MAX_PAGE_TOKEN_LENGTH} characters)`);
        }
        if (seenPageTokens.has(nextPageToken)) throw new Error('Repeated model page token');
        seenPageTokens.add(nextPageToken);
        pageToken = nextPageToken;
    }

    return allModels;
}

/**
 * @description 从 Anthropic API 获取模型列表。
 * @param {string} token - API Key。
 * @param {string} baseUrl - API 基础 URL。
 * @param {string} region - 区域信息。
 * @param {object} env - 环境变量。
 * @returns {Promise<string[]>} - 模型 ID 数组。
 */
async function fetchAnthropicModels(token, baseUrl, region, env) {
    const apiUrl = normalizeBaseUrl(baseUrl) + "/models";
    const response = await secureProxiedFetch(apiUrl, {
        method: "GET",
        headers: { "x-api-key": token, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    }, region, env);
    if (!response.ok) {
        const err = await readModelJson(response).catch(() => null);
        throw new Error(err?.error?.message || `HTTP ${response.status}`);
    }
    const data = await readModelJson(response);
    return normalizeModelIds(data.data);
}

/**
 * @description 映射不同提供商的模型获取函数。
 */
const fetcherMap = {
    fetchOpenAIModels,
    fetchGitHubModels,
    fetchGoogleModels,
    fetchAnthropicModels
};

/**
 * @description 根据提供商元数据获取模型列表。
 * @param {object} providerMeta - 提供商的元数据。
 * @param {string} token - API Key。
 * @param {object} providerConfig - 提供商配置。
 * @param {object} env - 环境变量。
 * @returns {Promise<string[]>} - 模型 ID 数组。
 * @throws {Error} 如果提供商不支持模型获取。
 */
export async function getModels(providerMeta, token, providerConfig, env) {
    const fetcherName = providerMeta.fetchModels;
    if (!fetcherName || !fetcherMap[fetcherName]) {
        throw new Error(`Model fetching is not supported for provider: ${providerConfig.provider}`);
    }
    return await fetcherMap[fetcherName](token, providerConfig.baseUrl, providerConfig.region, env);
}
