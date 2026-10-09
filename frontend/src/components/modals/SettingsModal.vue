<template>
    <div class="model-selector-content">
        <div class="model-selector-header">
            <h3 id="settingsTitle">检测设置</h3>
            <button class="model-selector-close" @click="uiStore.closeModal()">&times;</button>
        </div>
        <div class="model-selector-body">
            <div class="settings-section">
                <h4 class="settings-title">检测区域</h4>
                <ul class="model-list region-list">
                    <li v-for="(label, key) in configStore.regions" :key="key"
                        :class="{ selected: key === configStore.currentRegion }" @click="configStore.selectRegion(key)">
                        {{ label }}
                    </li>
                </ul>
            </div>
            <div class="settings-section">
                <h4 class="settings-title">高级配置</h4>
                <div class="advanced-settings-grid">
                    <div class="config-item">
                        <label for="threshold">最低余额阈值</label>
                        <input id="threshold" type="number" v-model.number="configStore.threshold" min="0" step="0.1">
                    </div>
                    <div class="config-item">
                        <div class="label-with-hint">
                            <label for="concurrency">并发请求数</label>
                            <span class="config-hint">(1-20)</span>
                        </div>
                        <input id="concurrency" type="number" :value="configStore.concurrency"
                            @input="handleConcurrencyInput" min="1" max="20">
                    </div>

                    <div class="config-item">
                        <label for="max-tokens">max_tokens</label>
                        <input id="max-tokens" type="number" v-model.number="configStore.validationMaxTokens"
                            @change="clampTokenSetting('validationMaxTokens')" min="1" max="1024">
                    </div>
                    
                    <div class="config-item">
                        <label for="max-output-tokens">max_output_tokens</label>
                        <input id="max-output-tokens" type="number" v-model.number="configStore.validationMaxOutputTokens"
                            @change="clampTokenSetting('validationMaxOutputTokens')" min="1" max="1024">
                    </div>

                    <div class="config-item prompt-item">
                        <label for="prompt">验证提示词 (Prompt)</label>
                        <input id="prompt" type="text" v-model="configStore.validationPrompt" maxlength="4096">
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { onBeforeUnmount } from 'vue';
import { useUiStore } from '@/stores/ui';
import { useConfigStore } from '@/stores/config';
const uiStore = useUiStore();
const configStore = useConfigStore();

const clampTokenSetting = (key) => {
    const value = Number.parseInt(configStore[key], 10);
    configStore[key] = Number.isFinite(value) ? Math.min(Math.max(value, 1), 1024) : 16;
};

/**
 * @description 存储 onblur 事件处理器引用，用于组件卸载时清理。
 */
let currentBlurHandler = null;
let currentInputElement = null;

/**
 * @description 处理并发请求数的输入，确保其在有效范围内（1-20）。
 * @param {Event} event - 输入事件对象。
 */
const handleConcurrencyInput = (event) => {
    let value = parseInt(event.target.value, 10);

    // 如果输入不是有效数字，则不进行处理
    if (isNaN(value)) {
        return;
    }

    // 清理之前的 blur 事件监听器
    if (currentInputElement && currentBlurHandler) {
        currentInputElement.removeEventListener('blur', currentBlurHandler);
    }

    // 创建新的 blur 事件处理器
    currentBlurHandler = () => {
        if (event.target.value === '' || parseInt(event.target.value, 10) < 1) {
            configStore.concurrency = 1;
        }
    };
    currentInputElement = event.target;
    event.target.addEventListener('blur', currentBlurHandler, { once: true });

    // 限制范围 1-20
    if (value < 1) {
        value = 1;
    } else if (value > 20) {
        value = 20;
    }

    configStore.concurrency = value;
};

/**
 * @description 组件卸载前清理事件监听器。
 */
onBeforeUnmount(() => {
    if (currentInputElement && currentBlurHandler) {
        currentInputElement.removeEventListener('blur', currentBlurHandler);
    }
});
</script>

<style scoped>
    /* 设置部分 */
    .settings-section {
        margin-bottom: 24px;
    }

    .settings-section:last-child {
        margin-bottom: 8px;
    }

    /* 设置标题 */
    .settings-title {
        font-size: 1rem;
        font-weight: 600;
        font-family: var(--font-serif);
        color: var(--text-primary);
        margin-bottom: 16px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border-color-light);
    }

    /* 区域列表 */
    .region-list {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        list-style: none;
    }

    .region-list li {
        font-family: var(--font-sans);
        font-size: 0.9rem;
        padding: 10px 14px;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        text-align: center;
        cursor: pointer;
        transition: all 0.2s ease;
        background-color: var(--bg-surface);
    }

    .region-list li:hover {
        border-color: var(--accent-primary);
        color: var(--accent-primary);
    }

    .region-list li.selected {
        border-color: var(--accent-primary);
        background-color: var(--bg-selected);
        color: var(--accent-primary);
        font-weight: 600;
    }

    /* 高级设置网格布局 */
    .advanced-settings-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        padding: 0 8px;
    }

    .prompt-item {
        grid-column: 1 / -1;
    }

    .config-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    /* 带有提示的标签 */
    .label-with-hint {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .config-item label {
        font-size: 0.9rem;
        margin-bottom: 0;
        font-weight: 500;
        color: var(--text-secondary);
    }

    .config-hint {
        font-size: 0.8rem;
        color: var(--text-tertiary);
    }

    .config-item input {
        height: 40px;
    }

    /* 媒体查询：小屏幕设备 */
    @media (max-width: 768px) {
        .advanced-settings-grid {
            grid-template-columns: 1fr;
        }
    }

    @media (max-width: 480px) {
        .region-list {
            grid-template-columns: 1fr;
        }
    }
</style>
