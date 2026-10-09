<template>
    <teleport to="body">
        <div v-if="uiStore.activeModal" class="custom-modal show" @click.self="uiStore.closeModal()">
            <component :is="activeModalComponent" />
        </div>
    </teleport>
</template>

<script setup>
import { computed, defineAsyncComponent } from 'vue';
import { useUiStore } from '@/stores/ui';

const uiStore = useUiStore();

// 异步导入模态框组件，以优化初始加载性能
const DetailsModal = defineAsyncComponent(() => import('./modals/DetailsModal.vue'));
const ModelSelectorModal = defineAsyncComponent(() => import('./modals/ModelSelectorModal.vue'));
const SettingsModal = defineAsyncComponent(() => import('./modals/SettingsModal.vue'));

/**
 * @description 计算属性，根据 uiStore.activeModal 的值动态选择要渲染的模态框组件。
 */
const activeModalComponent = computed(() => {
    switch (uiStore.activeModal) {
        case 'details':
            return DetailsModal;
        case 'modelSelector':
            return ModelSelectorModal;
        case 'settings':
            return SettingsModal;
        default:
            return null;
    }
});
</script>

<style scoped>
    /* 模态框背景遮罩层 */
    .custom-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        height: 100dvh;
        background: rgba(45, 45, 45, 0.4);
        -webkit-backdrop-filter: blur(4px);
        backdrop-filter: blur(4px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
    }

    /* 模态框显示时的状态 */
    .custom-modal.show {
        opacity: 1;
        visibility: visible;
    }

    /* 模态框内容显示时的动画效果 */
    .custom-modal.show :deep(.modal-content),
    .custom-modal.show :deep(.model-selector-content) {
        transform: scale(1) translateY(0);
        max-height: 90vh;
        max-height: 90dvh;
    }

    /* 模态框内容的基础样式和隐藏时的动画起始状态 */
    :deep(.modal-content),
    :deep(.model-selector-content) {
        background: var(--bg-surface);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-medium);
        border: 1px solid var(--border-color-light);
        transform: scale(0.95) translateY(10px);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* 媒体查询：小屏幕设备上的背景模糊效果 */
    @media (max-width: 480px) {
        .custom-modal {
            -webkit-backdrop-filter: blur(2px);
            backdrop-filter: blur(2px);
        }
    }
</style>
