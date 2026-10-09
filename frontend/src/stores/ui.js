import { defineStore } from 'pinia';

/** @type {number} Toast ID 自增计数器 */
let toastIdCounter = 0;

/**
 * @description ui Store 用于管理应用程序的用户界面状态，如模态框、Toast 提示、加载状态等。
 */
export const useUiStore = defineStore('ui', {
    state: () => ({
        /** @type {boolean} 提供商下拉菜单是否打开。*/
        providerDropdownOpen: false,
        /** @type {boolean} 是否正在获取模型列表。*/
        isFetchingModels: false,
        /** @type {object} 结果面板的排序下拉菜单状态。*/
        sortDropdownOpen: { valid: false, lowBalance: false },
        /** @type {Array<object>} 当前显示的 Toast 消息列表。*/
        toasts: [],
        /** @type {string|null} 当前激活的模态框名称。*/
        activeModal: null,
        /** @type {object} 传递给模态框的数据。*/
        modalData: {},
        /** @type {string} 模型选择器中的搜索关键词。*/
        modelSearch: '',
    }),
    getters: {
        /**
         * @description 判断是否有模态框处于激活状态。
         * @param {object} state - UI Store 的状态。
         * @returns {boolean} - 如果有模态框激活则返回 true。
         */
        isModalActive: (state) => !!state.activeModal,
    },
    actions: {
        /**
         * @description 显示一个 Toast 提示消息。
         * @param {string} message - 消息文本。
         * @param {string} [type='success'] - 消息类型（'success', 'error', 'warning', 'info'）。
         * @param {number} [duration=3500] - 消息显示时长（毫秒）。
         */
        showToast(message, type = 'success', duration = 3500) {
            const icons = { success: "✓", error: "✕", warning: "⚠", info: "ℹ" };
            const titles = { success: "成功", error: "错误", warning: "警告", info: "提示" };
            const id = ++toastIdCounter;

            const toast = { id, message, type, icon: icons[type], title: titles[type], show: false };

            // 限制最大 Toast 数量为 5 个，超出时移除最旧的
            const MAX_TOASTS = 5;
            if (this.toasts.length >= MAX_TOASTS) {
                const oldestToast = this.toasts[0];
                this.removeToast(oldestToast.id);
            }

            this.toasts.push(toast);

            // 短暂延迟后显示 Toast，以便触发 CSS 过渡效果
            setTimeout(() => {
                const addedToast = this.toasts.find(t => t.id === id);
                if (addedToast) addedToast.show = true;
            }, 10);

            // 在指定时长后移除 Toast
            setTimeout(() => this.removeToast(id), duration);
        },
        /**
         * @description 根据 ID 移除一个 Toast 提示消息。
         * @param {number} id - Toast 消息的唯一 ID。
         */
        removeToast(id) {
            const index = this.toasts.findIndex(t => t.id === id);
            if (index > -1) {
                // 先隐藏 Toast，再延迟移除 DOM 元素，以便触发 CSS 过渡效果
                this.toasts[index].show = false;
                setTimeout(() => {
                    const currentIndex = this.toasts.findIndex(t => t.id === id);
                    if (currentIndex > -1) this.toasts.splice(currentIndex, 1);
                }, 300);
            }
        },
        /**
         * @description 打开一个指定名称的模态框。
         * @param {string} modalName - 要打开的模态框的名称。
         * @param {object} [data={}] - 传递给模态框的数据。
         */
        openModal(modalName, data = {}) {
            this.modalData = data;
            this.activeModal = modalName;
        },
        /**
         * @description 关闭当前激活的模态框。
         */
        closeModal() {
            this.activeModal = null;
            this.modalData = {};
            this.modelSearch = '';
        }
    }
});
