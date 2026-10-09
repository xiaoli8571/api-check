import './assets/main.css';
import './assets/modal.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

// 引入 vue-virtual-scroller 的 CSS
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';

/**
 * @description 创建 Vue 应用实例。
 */
const app = createApp(App);

/**
 * @description 全局错误处理器，捕获未处理的 Vue 组件错误。
 * 防止单个组件错误导致整个应用崩溃。
 */
app.config.errorHandler = (err, instance, info) => {
    console.error('Vue Error:', err);
    console.error('Error Info:', info);
    // 可以在这里添加错误上报逻辑
};

/**
 * @description 全局警告处理器（仅在开发模式下有效）。
 */
app.config.warnHandler = (msg, instance, trace) => {
    console.warn('Vue Warning:', msg);
};

/**
 * @description 使用 Pinia 作为状态管理库。
 */
app.use(createPinia());

/**
 * @description 将 Vue 应用挂载到 DOM 元素上。
 */
app.mount('#app');

/**
 * @description 全局未捕获 Promise 错误处理。
 */
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled Promise Rejection:', event.reason);
    // 防止控制台显示默认错误
    event.preventDefault();
});
