<template>
    <div class="toast-container">
        <div v-for="toast in uiStore.toasts" :key="toast.id" class="toast" :class="[toast.type, { show: toast.show }]">
            <div class="toast-icon">{{ toast.icon }}</div>
            <div class="toast-content">
                <div class="toast-title">{{ toast.title }}</div>
                <div class="toast-message">{{ toast.message }}</div>
            </div>
            <button class="toast-close" @click="uiStore.removeToast(toast.id)">×</button>
        </div>
    </div>
</template>

<script setup>
import { useUiStore } from '@/stores/ui';
const uiStore = useUiStore();
</script>

<style scoped>
    /* Toast 容器 */
    .toast-container {
        position: fixed;
        top: calc(20px + env(safe-area-inset-top, 0px));
        right: calc(20px + env(safe-area-inset-right, 0px));
        z-index: 10001;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
        max-width: calc(100vw - 40px);
    }

    /* 单个 Toast 消息样式 */
    .toast {
        background: var(--bg-surface);
        border-radius: var(--radius-md);
        padding: 16px 20px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        min-width: 280px;
        max-width: 420px;
        box-shadow: var(--shadow-medium);
        transform: translateX(120%);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: auto;
        border: 1px solid var(--border-color-light);
    }

    .toast.show {
        transform: translateX(0);
    }

    /* Toast 图标 */
    .toast-icon {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        color: white;
        flex-shrink: 0;
    }

    /* 不同类型 Toast 的图标背景色 */
    .toast.success .toast-icon {
        background: var(--accent-success);
    }

    .toast.error .toast-icon {
        background: var(--accent-error);
    }

    .toast.warning .toast-icon {
        background: var(--accent-warning);
    }

    .toast.info .toast-icon {
        background: var(--text-secondary);
    }

    /* Toast 内容区域 */
    .toast-content {
        flex: 1;
        min-width: 0;
    }

    .toast-title {
        font-weight: 600;
        font-family: var(--font-sans);
        color: var(--text-primary);
        margin-bottom: 2px;
        font-size: 0.95rem;
    }

    .toast-message {
        color: var(--text-secondary);
        font-size: 0.9rem;
        line-height: 1.4;
        overflow-wrap: break-word;
        word-break: break-word;
    }

    /* 关闭按钮 */
    .toast-close {
        background: transparent;
        border: none;
        color: var(--text-tertiary);
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-sm);
        transition: all 0.2s;
    }

    .toast-close:hover {
        background: var(--bg-tertiary);
        color: var(--text-primary);
    }

    /* 媒体查询：移动端优化 */
    @media (max-width: 768px) {
        .toast-container {
            right: 12px;
            left: 12px;
            max-width: none;
        }

        .toast {
            min-width: 0;
            max-width: none;
            width: 100%;
        }
    }
</style>