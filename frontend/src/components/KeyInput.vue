<template>
    <div class="input-header">
        <label for="tokens">API KEYS</label>
        <div class="input-header-actions">
            <button type="button" class="import-btn" @click="triggerFileInput" :disabled="checkerStore.isChecking || isImporting">
                <span v-if="isImporting" class="import-spinner"></span>
                {{ isImporting ? '导入中...' : '导入文件' }}
            </button>
            <button type="button" class="clear-btn" @click="configStore.clearTokens"
                :disabled="checkerStore.isChecking || isImporting">清空输入</button>
        </div>
        <input type="file" ref="fileInput" @change="handleFileImport" accept=".txt" style="display: none;">
    </div>

    <!-- 导入进度条 -->
    <div v-if="isImporting" class="import-progress">
        <div class="import-progress-bar">
            <div class="import-progress-fill" :style="{ width: importProgress + '%' }"></div>
        </div>
        <span class="import-progress-text">{{ importProgressText }}</span>
    </div>

    <textarea id="tokens" v-model="tokensInputValue"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="handleFileDrop"
        :class="{ 'drag-over': isDragOver, 'importing': isImporting }"
        placeholder="输入或拖拽.txt文件到此处&#10;多个KEY以英文逗号、分号或换行分隔" :disabled="checkerStore.isChecking || isImporting"></textarea>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useConfigStore } from '@/stores/config';
import { useUiStore } from '@/stores/ui';
import { useCheckerStore } from '@/stores/checker';
import { MAX_KEYS_LIMIT, MAX_FILE_SIZE } from '@/constants';

const configStore = useConfigStore();
const uiStore = useUiStore();
const checkerStore = useCheckerStore();

const fileInput = ref(null);
const isDragOver = ref(false);

// 导入状态
const isImporting = ref(false);
const importProgress = ref(0);
const importProgressText = ref('');

/**
 * @description 计算属性，用于双向绑定 textarea 的值到 configStore.tokensInput。
 */
const tokensInputValue = computed({
    get: () => configStore.tokensInput,
    set: (value) => {
        configStore.tokensInput = value;
    }
});

/**
 * @description 触发隐藏的文件输入框的点击事件，打开文件选择对话框。
 */
const triggerFileInput = () => {
    fileInput.value.click();
};

const importTextFile = (file) => {
    if (!file.name.endsWith('.txt') && file.type !== 'text/plain') {
        uiStore.showToast("仅支持 .txt 文本文件", "warning");
        return;
    }
    readFile(file);
};

/**
 * @description 处理文件导入事件（通过文件选择对话框）。
 * @param {Event} event - 文件输入框的 change 事件。
 */
const handleFileImport = (event) => {
    const file = event.target.files[0];
    if (file) importTextFile(file);
    event.target.value = ''; // 重置文件输入框
};

/**
 * @description 处理文件拖放事件。
 * @param {Event} event - 拖放事件。
 */
const handleFileDrop = (event) => {
    isDragOver.value = false;
    const file = event.dataTransfer.files[0];
    if (file) importTextFile(file);
};

/**
 * @description 格式化文件大小显示
 * @param {number} bytes - 字节数
 * @returns {string} - 格式化后的大小字符串
 */
const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

/**
 * @description 读取文件内容并更新 tokensInput。
 * 支持大文件分片读取，显示进度。
 * @param {File} file - 要读取的文件对象。
 */
const readFile = (file) => {
    // 文件大小限制检查
    if (file.size > MAX_FILE_SIZE) {
        const maxSizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
        uiStore.showToast(`文件过大（最大 ${maxSizeMB}MB），当前 ${formatFileSize(file.size)}`, "error");
        return;
    }

    isImporting.value = true;
    importProgress.value = 0;
    importProgressText.value = `正在读取 ${file.name} (${formatFileSize(file.size)})...`;

    const reader = new FileReader();

    reader.onprogress = (event) => {
        if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 50); // 读取占 50%
            importProgress.value = percent;
            importProgressText.value = `正在读取... ${formatFileSize(event.loaded)} / ${formatFileSize(event.total)}`;
        }
    };

    reader.onload = (e) => {
        importProgress.value = 50;
        importProgressText.value = '正在解析内容...';

        // 使用 setTimeout 让 UI 有机会更新
        setTimeout(() => {
            processFileContent(e.target.result, file.name);
        }, 50);
    };

    reader.onerror = () => {
        isImporting.value = false;
        importProgress.value = 0;
        uiStore.showToast("文件读取失败", "error");
    };

    reader.readAsText(file);
};

/**
 * @description 处理文件内容，解析并验证 Key 数量
 * @param {string} content - 文件内容
 * @param {string} fileName - 文件名
 */
const processFileContent = (content, fileName) => {
    try {
        importProgressText.value = '正在清洗数据...';
        importProgress.value = 60;

        // 分批处理大文件，避免阻塞 UI
        const lines = content.split(/[\n\r]+/);
        const totalLines = lines.length;
        const cleanLines = [];
        const batchSize = 10000;
        let currentIndex = 0;

        const processBatch = () => {
            const endIndex = Math.min(currentIndex + batchSize, totalLines);

            for (let i = currentIndex; i < endIndex; i++) {
                const line = lines[i].trim();
                if (line) {
                    cleanLines.push(line);
                }
            }

            currentIndex = endIndex;
            const parseProgress = Math.round((currentIndex / totalLines) * 30) + 60; // 解析占 60-90%
            importProgress.value = parseProgress;
            importProgressText.value = `正在解析... ${currentIndex.toLocaleString()} / ${totalLines.toLocaleString()} 行`;

            if (currentIndex < totalLines) {
                // 还有更多行要处理
                setTimeout(processBatch, 0);
            } else {
                // 处理完成
                finishImport(cleanLines, fileName);
            }
        };

        processBatch();

    } catch (error) {
        isImporting.value = false;
        importProgress.value = 0;
        uiStore.showToast("文件解析失败: " + error.message, "error");
    }
};

/**
 * @description 完成导入，验证数量并更新输入
 * @param {string[]} cleanLines - 清洗后的行数组
 * @param {string} fileName - 文件名
 */
const finishImport = (cleanLines, fileName) => {
    importProgress.value = 95;
    importProgressText.value = '正在验证...';

    const keyCount = cleanLines.length;

    if (keyCount === 0) {
        isImporting.value = false;
        importProgress.value = 0;
        uiStore.showToast("文件内容为空", "warning");
        return;
    }

    // 检查数量限制
    if (keyCount > MAX_KEYS_LIMIT) {
        isImporting.value = false;
        importProgress.value = 0;
        uiStore.showToast(
            `Key 数量超过限制！文件包含 ${keyCount.toLocaleString()} 个 Key，最多支持 ${MAX_KEYS_LIMIT.toLocaleString()} 个`,
            "error",
            6000
        );
        return;
    }

    // 更新输入
    importProgress.value = 100;
    importProgressText.value = '导入完成！';

    configStore.tokensInput = cleanLines.join("\n");

    // 延迟隐藏进度条，让用户看到 100%
    setTimeout(() => {
        isImporting.value = false;
        importProgress.value = 0;

        // 根据数量给出不同提示
        if (keyCount > 10000) {
            uiStore.showToast(
                `导入成功！共 ${keyCount.toLocaleString()} 个 Key，数量较多，检测可能需要较长时间`,
                "success",
                5000
            );
        } else {
            uiStore.showToast(`文件导入成功！共导入 ${keyCount.toLocaleString()} 个 Key`, "success");
        }
    }, 300);
};
</script>

<style scoped>
    .input-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
    }

    .input-header-actions {
        display: flex;
        gap: 8px;
    }

    .import-btn, .clear-btn {
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
        gap: 6px;
        height: auto;
        padding: 8px 16px;
    }

    .import-btn {
        background: var(--accent-dark);
    }

    .import-btn:hover:not(:disabled) {
        background: var(--accent-dark-hover);
        transform: translateY(-1px);
    }

    .clear-btn {
        background: var(--text-secondary);
    }

    .clear-btn:hover:not(:disabled) {
        background: var(--text-secondary-hover);
        transform: translateY(-1px);
    }

    textarea:disabled {
        background-color: var(--bg-secondary);
        cursor: not-allowed;
    }

    .import-btn:disabled, .clear-btn:disabled {
        cursor: not-allowed;
        transform: none;
        opacity: 0.5;
    }

    /* 拖放悬停状态样式 */
    textarea.drag-over {
        border-color: var(--accent-primary);
        box-shadow: var(--shadow-focus);
        background-color: var(--bg-selected);
    }

    /* 导入中状态 */
    textarea.importing {
        opacity: 0.7;
    }

    /* 导入进度条 */
    .import-progress {
        margin-bottom: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .import-progress-bar {
        height: 4px;
        background-color: var(--border-color);
        border-radius: 2px;
        overflow: hidden;
    }

    .import-progress-fill {
        height: 100%;
        background: var(--accent-primary);
        border-radius: 2px;
        transition: width 0.2s ease;
    }

    .import-progress-text {
        font-size: 0.85rem;
        color: var(--text-secondary);
        text-align: center;
    }

    /* 导入按钮加载动画 */
    .import-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
