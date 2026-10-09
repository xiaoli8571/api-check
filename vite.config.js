import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const workerTarget = 'http://127.0.0.1:8787';

function configureWorkerProxy(proxy) {
    const rewriteOrigin = (proxyRequest) => proxyRequest.setHeader('Origin', workerTarget);
    proxy.on('proxyReq', rewriteOrigin);
    proxy.on('proxyReqWs', rewriteOrigin);
}

/**
 * @description Vite 配置文件。
 * @see https://vitejs.dev/config/
 */
export default defineConfig({
    // 指定前端项目的根目录为 'frontend'
    root: 'frontend',
    // 配置 Vite 插件
    plugins: [
        vue(), // 启用 Vue 3 单文件组件支持
    ],
    // 配置模块解析别名
    resolve: {
        alias: {
            // 设置 '@' 别名，指向 './frontend/src' 目录，方便导入模块
            '@': fileURLToPath(new URL('./frontend/src', import.meta.url))
        }
    },
    // 开发服务器配置
    server: {
        // 将前端实际使用的 HTTP 与 WebSocket 路径转发到本地 Wrangler。
        proxy: {
            '/models': {
                target: workerTarget,
                changeOrigin: true,
                configure: configureWorkerProxy,
            },
            '/check': {
                target: workerTarget,
                changeOrigin: true,
                ws: true,
                configure: configureWorkerProxy,
            },
        }
    }
});
