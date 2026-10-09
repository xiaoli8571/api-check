<template>
    <div class="results-tabs">
        <button v-for="tab in resultTabs" :key="tab.id" class="tab-btn" :class="{ active: resultsStore.activeTab === tab.id }"
            @click="resultsStore.activeTab = tab.id" v-show="tab.visible">
            {{ tab.name }}
            <span class="counter">{{ resultsStore.results[tab.id].length }}</span>
        </button>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useResultsStore } from '@/stores/results';
import { useConfigStore } from '@/stores/config';
import { RESULT_TAB_CONFIG } from '@/constants';

const resultsStore = useResultsStore();
const configStore = useConfigStore();

/**
 * @description 计算属性，根据当前提供商是否支持余额，动态显示结果标签页。
 * @returns {Array<object>} - 标签页配置数组。
 */
const resultTabs = computed(() => {
    const hasBalance = configStore.providers[configStore.currentProvider].hasBalance;
    return RESULT_TAB_CONFIG.map(tab => ({
        id: tab.id,
        name: tab.name,
        visible: hasBalance || !tab.balanceOnly,
    }));
});
</script>

<style scoped>
    /* 结果标签页容器 */
    .results-tabs {
        display: flex;
        background-color: transparent;
        border-bottom: 1px solid var(--border-color-light);
        overflow-x: auto;
        padding: 0 8px;
    }

    /* 标签按钮 */
    .tab-btn {
        padding: 12px 16px;
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 600;
        font-family: var(--font-sans);
        color: var(--text-secondary);
        transition: all 0.2s ease;
        border-bottom: 2px solid transparent;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .tab-btn:hover {
        color: var(--accent-primary);
    }

    .tab-btn.active {
        color: var(--accent-primary);
        border-bottom-color: var(--accent-primary);
    }

    /* 计数器 */
    .tab-btn .counter {
        background: var(--border-color);
        color: var(--text-secondary);
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 0.8rem;
        transition: all 0.2s ease;
    }

    .tab-btn.active .counter {
        background-color: var(--accent-primary);
        color: white;
    }
</style>