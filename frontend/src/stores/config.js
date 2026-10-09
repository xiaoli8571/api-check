import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import { PROVIDERS, PRIMARY_PROVIDERS, ADDITIONAL_PROVIDERS, REGIONS } from '@/api';
import { useUiStore } from './ui';

/**
 * @description config Store 用于管理应用程序的全局配置，包括提供商、区域、输入 Key 等。
 */
export const useConfigStore = defineStore('config', () => {
    // --- 状态 (State) ---
    /** @type {object} 所有支持的 API 提供商数据。*/
    const providers = PROVIDERS;
    /** @type {object} 首页直接展示的一级 API 提供商数据。*/
    const primaryProviders = PRIMARY_PROVIDERS;
    /** @type {object} 收纳在“更多预置”中的 API 提供商数据。*/
    const additionalProviders = ADDITIONAL_PROVIDERS;
    /** @type {object} 所有支持的检测区域数据。*/
    const regions = REGIONS;
    /** @type {Ref<string>} 当前选中的 API 提供商 Key。*/
    const currentProvider = ref('openai_responses');
    /** @type {Ref<string>} 当前选中的检测区域 Key。*/
    const currentRegion = ref('wnam');
    /** @type {object} 各个提供商的详细配置，如 baseUrl, model, enableStream。*/
    const providerConfigs = reactive({});
    /** @type {Ref<string>} 用户在输入框中输入的 API Keys 文本。*/
    const tokensInput = ref('');
    /** @type {Ref<number>} 余额低于此值时被标记为”低额”。*/
    const threshold = ref(1);
    /** @type {Ref<number>} 并发检测请求的数量。*/
    const concurrency = ref(10);
    /** @type {Ref<string>} 用于 API 请求验证的提示词内容。*/
    const validationPrompt = ref('You just need to reply Hi.');
    /** @type {Ref<number>} 用于 API 请求验证的 max_tokens (例如 /v1/chat/completions)。*/
    const validationMaxTokens = ref(16);
    /** @type {Ref<number>} 用于 API 请求验证的 max_output_tokens (例如 /v1/responses)。*/
    const validationMaxOutputTokens = ref(16);

    // --- 动作 (Actions) ---
    /**
     * @description 懒加载提供商配置，仅在首次访问时初始化。
     * @param {string} key - 提供商的唯一标识 Key。
     */
    function ensureProviderConfig(key) {
        if (!providerConfigs[key] && providers[key]) {
            providerConfigs[key] = {
                baseUrl: providers[key].defaultBase,
                model: providers[key].defaultModel,
                enableStream: false,
            };
        }
    }

    /**
     * @description 选择当前 API 提供商。
     * @param {string} key - 提供商的唯一标识 Key。
     */
    function selectProvider(key) {
        ensureProviderConfig(key);
        currentProvider.value = key;
        const uiStore = useUiStore();
        uiStore.providerDropdownOpen = false;
    }

    /**
     * @description 选择当前检测区域。
     * @param {string} key - 区域的唯一标识 Key。
     */
    function selectRegion(key) {
        currentRegion.value = key;
        const uiStore = useUiStore();
        uiStore.showToast(`检测区域已切换至: ${regions[key]}`, "info");
    }

    /**
     * @description 清空输入框中的所有 API Keys。
     */
    function clearTokens() {
        tokensInput.value = '';
        const uiStore = useUiStore();
        uiStore.showToast("输入内容已清除", "info", 2000);
    }

    /**
     * @description 获取当前提供商配置的计算属性，确保配置已初始化。
     */
    function getCurrentProviderConfig() {
        ensureProviderConfig(currentProvider.value);
        return providerConfigs[currentProvider.value];
    }

    /**
     * @description 生成模型列表接口使用的不可变配置快照。
     */
    function getModelFetchConfig() {
        const currentConfig = getCurrentProviderConfig();
        return {
            provider: currentProvider.value,
            baseUrl: currentConfig.baseUrl,
            region: currentRegion.value,
        };
    }

    // 初始化默认提供商配置
    ensureProviderConfig(currentProvider.value);

    return {
        providers,
        primaryProviders,
        additionalProviders,
        regions,
        currentProvider,
        currentRegion,
        providerConfigs,
        tokensInput,
        threshold,
        concurrency,
        validationPrompt,
        validationMaxTokens,
        validationMaxOutputTokens,
        selectProvider,
        selectRegion,
        clearTokens,
        getCurrentProviderConfig,
        getModelFetchConfig
    };
});
