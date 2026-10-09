<template>
    <div class="modal-content">
        <div class="modal-header">
            <div class="modal-icon info">ℹ</div>
            <h3 class="modal-title">接口返回详情</h3>
        </div>
        <div class="modal-message raw-data">
            <div v-for="(value, key) in uiStore.modalData" :key="key">
                <strong class="detail-key">{{ key }}:</strong>
                <pre>{{ formatValue(value) }}</pre>
            </div>
        </div>
        <div class="modal-actions">
            <button class="modal-btn copy-btn" @click="copyDetails">📋 复制详情</button>
            <button class="modal-btn primary" @click="uiStore.closeModal()">确定</button>
        </div>
    </div>
</template>

<script setup>
import { useUiStore } from '@/stores/ui';
const uiStore = useUiStore();

/**
 * @description 格式化任意值以便显示。
 * 如果是对象/数组，则格式化为 JSON 字符串；如果是字符串，则原样返回。
 * @param {any} value - 待格式化的值。
 * @returns {string} - 格式化后的字符串。
 */
const formatValue = (value) => {
    if (value === null || value === undefined) {
        return 'N/A';
    }
    if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
    }
    return String(value);
};

/**
 * @description 将所有模态框数据以可读文本格式复制到剪贴板。
 */
const copyDetails = () => {
    let textToCopy = '';
    for (const [key, value] of Object.entries(uiStore.modalData)) {
        // 添加分隔符，用于区分不同的详情类别
        if (textToCopy) {
            textToCopy += '\n\n---\n\n';
        }
        textToCopy += `${key.toUpperCase()}:\n${formatValue(value)}`;
    }

    navigator.clipboard.writeText(textToCopy.trim()).then(() => {
        uiStore.showToast("详情已复制到剪贴板", "success");
    });
};
</script>

<style scoped>
    /* 原始数据显示样式 */
    .modal-message.raw-data {
        text-align: left;
        background-color: var(--bg-secondary);
        padding: 12px;
        border-radius: var(--radius-sm);
        font-family: var(--font-mono);
        font-size: 0.85rem;
        max-height: 400px;
        overflow-y: auto;
    }

    /* 详情键名样式 */
    .detail-key {
        display: block;
        margin-top: 10px;
        margin-bottom: 4px;
        color: var(--text-primary);
        font-weight: bold;
    }

    .detail-key:first-of-type {
        margin-top: 0;
    }

    /* 预格式化文本样式 */
    pre {
        margin: 0;
        padding: 0;
        white-space: pre-wrap;
        word-break: break-all;
    }
</style>