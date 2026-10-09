<template>
    <div class="results-panel" :class="{ active: resultsStore.activeTab === category }">
        <div class="panel-header" v-show="results.length > 0">
            <span class="results-title">{{ title }} KEY</span>
            <div class="panel-actions">
                <div class="custom-select" v-if="sortable" :class="{ open: uiStore.sortDropdownOpen[category] }"
                    ref="sortSelectWrapper">
                    <div class="custom-select-trigger" @click="toggleSortDropdown"
                        role="combobox"
                        aria-haspopup="listbox"
                        :aria-expanded="uiStore.sortDropdownOpen[category]"
                        aria-label="排序方式">
                        <span>{{ currentSortOption.text }}</span>
                    </div>
                    <div class="custom-options" role="listbox" aria-label="排序选项">
                        <span v-for="option in sortOptions" :key="option.value" class="custom-option"
                            :class="{ selected: option.value === resultsStore.sortState[category] }"
                            @click="setSort(option.value)"
                            role="option"
                            :aria-selected="option.value === resultsStore.sortState[category]">{{ option.text }}</span>
                    </div>
                </div>
                <button class="copy-btn" @click="copyTokens(category, title)">📋 复制</button>
            </div>
        </div>
        <input type="search" class="search-input" v-model="searchTerm" placeholder="🔍 在结果中搜索..."
            v-show="results.length > 0"
            aria-label="在结果中搜索">
        <div class="results-content">
            <DynamicScroller
                v-if="sortedResultsForCategory && sortedResultsForCategory.length > 0"
                ref="scrollerRef"
                class="scroller"
                :items="sortedResultsForCategory"
                :min-item-size="34"
                key-field="id"
            >
                <template v-slot="{ item: result, index, active }">
                    <DynamicScrollerItem
                        :item="result"
                        :active="active"
                        :size-dependencies="[
                            result.displayText, // 依赖项：仅当 displayText 变化时才重新计算高度，提升性能
                        ]"
                        :data-index="index"
                    >
                        <div class="result-line" :data-token="result.token">
                            <span class="key-text" v-html="result.displayText"></span>
                            <div class="result-line-actions">
                                <button v-if="result.details" class="view-details-btn" title="查看接口返回详情"
                                    @click="uiStore.openModal('details', result.details)">ℹ️</button>
                                <button v-if="category === 'valid'" class="get-models-btn" title="获取可用模型"
                                    @click="handleFetchModelsForToken(result.token, $event)">🎛</button>
                                <button class="copy-key-btn" title="复制此KEY" @click="copySingleToken(result.token, $event)">📋</button>
                            </div>
                        </div>
                    </DynamicScrollerItem>
                </template>
            </DynamicScroller>
            
            <div v-else class="empty-state">
                <span class="empty-icon"></span>
                <p>检测结果将显示在这里</p>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
// 导入支持动态高度的虚拟滚动组件
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller';
import { useResultsStore } from '@/stores/results';
import { useUiStore } from '@/stores/ui';
import { useConfigStore } from '@/stores/config';
import { fetchAvailableModels } from '@/utils/models';

const props = defineProps({
    category: { type: String, required: true },
    title: { type: String, required: true },
    sortable: { type: Boolean, default: false },
});

const resultsStore = useResultsStore();
const uiStore = useUiStore();
const configStore = useConfigStore();

/** @type {Ref<HTMLElement|null>} 排序选择器包装元素的引用。*/
const sortSelectWrapper = ref(null);
/** @type {Ref<InstanceType<typeof DynamicScroller>|null>} 虚拟滚动组件的引用。*/
const scrollerRef = ref(null);
/** @type {ComputedRef<Array<object>>} 当前类别下的结果列表。*/
const results = computed(() => resultsStore.results[props.category]);

/**
 * @description 当前类别下已排序的结果列表。
 * 直接在组件中计算，确保响应式依赖正确追踪。
 */
const sortedResultsForCategory = computed(() => {
    const data = resultsStore.results[props.category] || [];
    const searchTerm = resultsStore.searchTerms[props.category]?.toLowerCase() || '';
    const sortKey = resultsStore.sortState[props.category];

    // 1. 过滤
    let filtered;
    if (!searchTerm) {
        filtered = data;
    } else {
        filtered = data.filter(r =>
            r.token.toLowerCase().includes(searchTerm) ||
            r.displayText.toLowerCase().includes(searchTerm)
        );
    }

    // 2. 排序
    if (!sortKey || sortKey === 'default') {
        return [...filtered].sort((a, b) => a.order - b.order);
    }

    // 余额排序
    return [...filtered].sort((a, b) => {
        const balanceA = a.balance ?? -Infinity;
        const balanceB = b.balance ?? -Infinity;
        return sortKey === 'balance-desc' ? balanceB - balanceA : balanceA - balanceB;
    });
});
/**
 * @description 计算属性，用于双向绑定搜索关键词。
 */
const searchTerm = computed({
    get: () => resultsStore.searchTerms[props.category],
    set: (value) => { resultsStore.searchTerms[props.category] = value; }
});
/** @type {Array<object>} 排序选项的配置。*/
const sortOptions = [
    { value: 'default', text: '默认排序' },
    { value: 'balance-desc', text: '余额 ▾' },
    { value: 'balance-asc', text: '余额 ▴' },
];
/** @type {ComputedRef<object>} 当前选中的排序选项。*/
const currentSortOption = computed(() => {
    return sortOptions.find(opt => opt.value === resultsStore.sortState[props.category]) || sortOptions[0];
});

/**
 * @description 切换排序下拉菜单的显示状态。
 */
const toggleSortDropdown = () => {
    uiStore.sortDropdownOpen[props.category] = !uiStore.sortDropdownOpen[props.category];
};

/**
 * @description 设置当前类别的排序方式。
 * @param {string} value - 排序值。
 */
const setSort = (value) => {
    resultsStore.setSort(props.category, value);
    uiStore.sortDropdownOpen[props.category] = false;
};

/**
 * @description 点击外部时关闭排序下拉菜单。
 * @param {Event} e - 点击事件对象。
 */
const closeDropdown = (e) => {
    if (sortSelectWrapper.value && !sortSelectWrapper.value.contains(e.target)) {
        uiStore.sortDropdownOpen[props.category] = false;
    }
};

/**
 * @description 复制当前类别下所有 Key 到剪贴板。
 * @param {string} category - 结果类别。
 * @param {string} title - 类别标题。
 */
const copyTokens = (category, title) => {
    const tokensToCopy = sortedResultsForCategory.value.map(r => r.token);
    if (tokensToCopy.length === 0) {
        uiStore.showToast(`没有可复制的 ${title}`, "warning");
        return;
    }
    navigator.clipboard.writeText(tokensToCopy.join("\n")).then(() => {
        uiStore.showToast(`${title} 已复制到剪贴板 (共 ${tokensToCopy.length} 个)`, "success");
    }).catch((err) => {
        console.error('复制失败:', err);
        uiStore.showToast("复制失败，请检查浏览器权限", "error");
    });
};

/**
 * @description 复制单个 Key 到剪贴板，并提供视觉反馈。
 * @param {string} token - 要复制的 Key。
 * @param {Event} event - 点击事件对象。
 */
const copySingleToken = (token, event) => {
    const btn = event.target.closest('button');
    const originalContent = btn.innerHTML;
    navigator.clipboard.writeText(token).then(() => {
        btn.innerHTML = '✓';
        setTimeout(() => { btn.innerHTML = originalContent; }, 1500);
    }).catch((err) => {
        console.error('复制失败:', err);
        btn.innerHTML = '✕';
        setTimeout(() => { btn.innerHTML = originalContent; }, 1500);
    });
};

/**
 * @description 为单个 Key 获取可用模型列表。
 * @param {string} token - 要获取模型的 Key。
 * @param {Event} event - 点击事件对象。
 */
const handleFetchModelsForToken = async (token, event) => {
    const button = event.target.closest('button');
    const originalContent = button.innerHTML;
    button.innerHTML = '<span class="loader"></span>'; // 显示加载动画
    button.disabled = true; // 禁用按钮
    try {
        const models = await fetchAvailableModels(token, configStore.getModelFetchConfig());
        
        if (models && models.length > 0) {
            uiStore.openModal('modelSelector', { models });
        } else {
            uiStore.showToast("未能获取到模型列表", "warning");
        }
    } catch (error) {
        uiStore.showToast(`获取模型失败: ${error.message}`, "error");
    } finally {
        button.innerHTML = originalContent; // 恢复按钮文本
        button.disabled = false; // 启用按钮
    }
};

/**
 * @description 组件挂载时添加点击事件监听器。
 */
onMounted(() => {
    document.addEventListener('click', closeDropdown);
});

/**
 * @description 组件卸载前移除点击事件监听器。
 */
onBeforeUnmount(() => {
    document.removeEventListener('click', closeDropdown);
});

/**
 * @description 监听面板激活状态变化。
 * 当面板从隐藏变为显示时，刷新虚拟滚动组件以修复尺寸计算问题。
 */
watch(
    () => resultsStore.activeTab,
    (newTab) => {
        if (newTab === props.category && scrollerRef.value) {
            nextTick(() => {
                // 强制刷新虚拟滚动组件
                scrollerRef.value.forceUpdate && scrollerRef.value.forceUpdate();
            });
        }
    }
);
</script>

<style scoped>
    /* 结果面板基础样式 */
    .results-panel {
        display: none;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }

    .results-panel.active {
        display: flex;
    }

    /* 面板头部样式 */
    .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        padding: 8px;
        flex-wrap: wrap;
    }

    .results-title {
        font-size: 1rem;
        font-weight: 600;
        font-family: var(--font-serif);
        color: var(--text-primary);
        white-space: nowrap;
    }

    .panel-actions {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
        margin-left: auto;
    }

    /* 搜索输入框样式 */
    .search-input {
        width: calc(100% - 16px);
        margin: 4px 8px 8px 8px;
        height: 40px;
        border-radius: var(--radius-sm);
    }

    /* 结果内容区域 */
    .results-content {
        background: var(--bg-surface);
        border-radius: var(--radius-sm);
        overflow-y: auto;
        flex: 1;
        margin: 0 8px 8px 8px;
        border: 1px solid var(--border-color-light);
    }

    /* 确保 scroller 本身填满其容器 */
    .scroller {
        height: 100%;
        width: 100%;
    }

    /* 单个结果行样式 */
    .result-line {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 8px;
        min-height: 34px;
        width: 100%;
        box-sizing: border-box;
        border-radius: var(--radius-sm);
        transition: background-color 0.2s ease;
        font-family: var(--font-mono);
        font-size: 0.85rem;
    }

    .result-line:hover {
        background-color: var(--bg-selected);
    }

    .key-text {
        word-break: break-all;
        padding-right: 16px;
        white-space: normal;
        line-height: 1.4;
    }

    /* 深度选择器，用于样式化 v-html 渲染的内容 */
    :deep(.key-text .message) {
        color: var(--text-secondary);
        margin-left: 4px;
    }

    :deep(.key-text .balance-high) {
        color: var(--accent-success);
        font-weight: 600;
    }

    :deep(.key-text .balance-medium) {
        color: var(--accent-warning);
        font-weight: 600;
    }

    :deep(.key-text .balance-low) {
        color: var(--accent-error);
        font-weight: 600;
    }

    .result-line-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        align-self: center;
        flex-shrink: 0;
    }

    /* 结果行操作按钮 */
    .copy-key-btn,
    .get-models-btn,
    .view-details-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 1rem;
        padding: 4px;
        border-radius: var(--radius-sm);
        flex-shrink: 0;
        opacity: 0.4;
        transition: all 0.2s;
        line-height: 1;
    }

    .result-line:hover .copy-key-btn,
    .result-line:hover .get-models-btn,
    .result-line:hover .view-details-btn {
        opacity: 1;
    }

    .copy-key-btn:hover,
    .get-models-btn:hover,
    .view-details-btn:hover {
        color: var(--accent-primary);
        transform: scale(1.1);
    }

    .view-details-btn:hover {
        color: var(--accent-info) !important;
    }

    /* 空状态提示 */
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
        color: var(--text-tertiary);
    }

    .empty-state .empty-icon {
        font-size: 48px;
        line-height: 1;
        margin-bottom: 16px;
        opacity: 0.5;
    }

    .empty-state .empty-icon::before {
        content: '📭';
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

    /* 自定义选择器（排序） */
    .custom-select {
        position: relative;
        width: 120px;
        font-size: 0.85rem;
        height: 32px;
    }

    .custom-select-trigger {
        height: 100%;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 12px;
        background: var(--bg-surface);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: var(--font-sans);
    }

    .custom-select-trigger:hover {
        border-color: var(--border-color-focus);
    }

    .custom-select.open .custom-select-trigger {
        border-color: var(--border-color-focus);
        box-shadow: var(--shadow-focus);
    }

    .custom-select-trigger .arrow {
        width: 8px;
        height: 8px;
        border-left: 2px solid var(--text-tertiary);
        border-bottom: 2px solid var(--text-tertiary);
        transform: rotate(-45deg);
        transition: transform 0.2s ease;
    }

    .custom-select.open .arrow {
        transform: rotate(135deg);
    }

    .custom-options {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        background: var(--bg-surface);
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-color-light);
        box-shadow: var(--shadow-medium);
        z-index: 10;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-10px);
        transition: all 0.2s ease;
    }

    .custom-select.open .custom-options {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
    }

    .custom-option {
        padding: 8px 12px;
        cursor: pointer;
        transition: background-color 0.2s ease;
        display: block;
        font-family: var(--font-sans);
    }

    .custom-option:hover {
        background-color: var(--bg-tertiary);
    }

    .custom-option.selected {
        background-color: var(--bg-selected);
        color: var(--accent-primary);
        font-weight: 600;
    }

    @media (max-width: 768px) {
        .result-line-actions button {
            padding: 10px;
            min-width: 44px;
            min-height: 44px;
        }
    }
</style>
