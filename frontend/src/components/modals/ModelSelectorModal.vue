<template>
    <div class="model-selector-content">
        <div class="model-selector-header">
            <h3 id="modelSelectorTitle">选择一个模型</h3>
            <button class="model-selector-close" @click="uiStore.closeModal()">&times;</button>
        </div>
        <div class="model-selector-search">
            <input type="search" v-model="uiStore.modelSearch" placeholder="🔍 搜索模型...">
        </div>
        <div class="model-selector-body">
            <ul class="model-list">
                <li v-for="model in filteredModels" :key="model" @click="selectModel(model)">{{ model }}</li>
            </ul>
        </div>
        <div class="model-selector-footer">
            <span id="modelCount">显示: {{ filteredModels.length }} / {{ uiStore.modalData.models?.length || 0 }}</span>
            <button class="copy-btn" @click="copyAllModels">📋 复制全部</button>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useUiStore } from '@/stores/ui';
import { useConfigStore } from '@/stores/config';

const uiStore = useUiStore();
const configStore = useConfigStore();

/**
 * @description 计算属性，根据搜索关键词过滤模型列表。
 * @returns {string[]} - 过滤后的模型 ID 数组。
 */
const filteredModels = computed(() => {
    if (!uiStore.modalData.models) return [];
    const searchTerm = uiStore.modelSearch.toLowerCase();
    return uiStore.modalData.models.filter(m => m.toLowerCase().includes(searchTerm));
});

/**
 * @description 选择一个模型并更新配置，然后关闭模态框。
 * @param {string} model - 选中的模型 ID。
 */
const selectModel = (model) => {
    configStore.getCurrentProviderConfig().model = model;
    uiStore.showToast(`已选择模型: ${model}`, "info", 2000);
    uiStore.closeModal();
};

/**
 * @description 复制所有可见的模型 ID 到剪贴板。
 */
const copyAllModels = () => {
    navigator.clipboard.writeText(filteredModels.value.join("\n")).then(() => {
        uiStore.showToast(`已复制 ${filteredModels.value.length} 个可见模型ID`, "success");
    });
};
</script>

<style scoped>
    /* 模型选择器特定样式 */
    .model-selector-content {
        max-width: 500px;
    }

    /* 搜索框 */
    .model-selector-search {
        padding: 8px 16px;
        border-bottom: 1px solid var(--border-color-light);
    }

    .model-selector-search input {
        height: 40px;
    }

    /* 复制按钮 */
    .copy-btn {
        padding: 0 16px;
        background: var(--accent-success);
        color: white;
        border: none;
        border-radius: var(--radius-sm);
        font-size: 0.85rem;
        font-weight: 600;
        font-family: var(--font-sans);
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        white-space: nowrap;
        height: 32px;
    }

    .copy-btn:hover {
        background: var(--accent-success-hover);
        transform: translateY(-1px);
    }
</style>