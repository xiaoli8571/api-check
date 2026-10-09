<template>
    <div class="provider-header">
        <label id="providerSelectLabel">API 提供商</label>
        <div class="header-actions">
            <label class="switch-label" title="启用流式检测 (Stream Mode)">
                <span class="switch-title">流式检测</span>
                <input type="checkbox" v-model="currentConfig.enableStream" :disabled="checkerStore.isChecking">
                <span class="slider"></span>
            </label>
            <button @click="uiStore.openModal('settings')" class="region-btn" title="检测设置"
                :disabled="checkerStore.isChecking">⚙️</button>
        </div>
    </div>

    <div class="provider-picker" :class="{ disabled: checkerStore.isChecking }" ref="providerSelectWrapper"
        aria-labelledby="providerSelectLabel">
        <div class="provider-preset-grid">
            <button v-for="provider in primaryProviders" :key="provider.key" type="button"
                class="provider-preset-button" :class="{ active: provider.key === configStore.currentProvider }"
                :disabled="checkerStore.isChecking" :aria-pressed="provider.key === configStore.currentProvider"
                :aria-label="provider.ariaLabel" @click="handleProviderSelect(provider.key)">
                <span v-if="provider.key === configStore.currentProvider" class="selected-check" aria-hidden="true">✓</span>
                <span class="provider-button-label">
                    <span>{{ provider.name }}</span>
                    <small>{{ provider.protocol }}</small>
                </span>
            </button>

            <button type="button" class="provider-preset-button more-providers-button"
                :class="{ active: selectedAdditionalProvider, open: uiStore.providerDropdownOpen }"
                :disabled="checkerStore.isChecking" aria-haspopup="listbox"
                :aria-expanded="uiStore.providerDropdownOpen" @click="toggleDropdown">
                <span>更多</span>
                <span class="dropdown-chevron" aria-hidden="true"></span>
            </button>
        </div>

        <div class="custom-provider-dropdown" :class="{ open: uiStore.providerDropdownOpen }"
            ref="dropdownContainer" role="listbox" aria-label="更多 API 提供商预置">
            <input type="search" v-model="providerSearchTerm" placeholder="🔍 搜索更多预置..."
                class="provider-search-input" ref="searchInputElement" aria-label="搜索更多 API 提供商预置"
                :disabled="checkerStore.isChecking">
            <button v-for="([key, provider]) in filteredAdditionalProviders" :key="key" type="button"
                class="provider-option"
                :class="{ selected: key === configStore.currentProvider, highlighted: providerKeys[highlightedIndex] === key }"
                :disabled="checkerStore.isChecking" @click="handleProviderSelect(key)" role="option"
                :aria-selected="key === configStore.currentProvider">
                <span class="provider-icon" aria-hidden="true">{{ provider.icon }}</span>
                <span>{{ provider.label }}</span>
            </button>
            <p v-if="filteredAdditionalProviders.length === 0" class="provider-empty">没有匹配的预置</p>
        </div>

        <div v-if="selectedAdditionalProvider" class="selected-additional" aria-live="polite">
            <span class="selected-status-dot" aria-hidden="true"></span>
            <span class="selected-caption">当前已选择：</span>
            <span class="selected-provider-chip">
                {{ selectedAdditionalProvider.label }}
                <button type="button" class="chip-clear" title="清除选择并恢复 OpenAI Responses"
                    aria-label="清除当前提供商选择并恢复 OpenAI Responses" :disabled="checkerStore.isChecking"
                    @click="clearAdditionalProvider">×</button>
            </span>
            <button type="button" class="clear-provider-button" :disabled="checkerStore.isChecking"
                @click="clearAdditionalProvider">清除选择</button>
        </div>
    </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, computed, watch, nextTick } from 'vue';
import { useConfigStore } from '@/stores/config';
import { useUiStore } from '@/stores/ui';
import { useResultsStore } from '@/stores/results';
import { useCheckerStore } from '@/stores/checker';

const configStore = useConfigStore();
const uiStore = useUiStore();
const resultsStore = useResultsStore();
const checkerStore = useCheckerStore();

const primaryProviders = computed(() => Object.entries(configStore.primaryProviders).map(([key, provider]) => ({
    key,
    name: provider.selector.label,
    protocol: provider.selector.detail,
    ariaLabel: `${provider.selector.label} ${provider.selector.detail}`,
})));
const primaryProviderKeys = computed(() => new Set(Object.keys(configStore.primaryProviders)));

const providerSelectWrapper = ref(null);
const providerSearchTerm = ref('');
const searchInputElement = ref(null);
const dropdownContainer = ref(null);
const highlightedIndex = ref(-1);

const currentConfig = computed(() => configStore.getCurrentProviderConfig());
const selectedAdditionalProvider = computed(() => {
    if (primaryProviderKeys.value.has(configStore.currentProvider)) return null;
    return configStore.additionalProviders[configStore.currentProvider] || null;
});

const filteredAdditionalProviders = computed(() => {
    const searchTerm = providerSearchTerm.value.trim().toLowerCase();
    const entries = Object.entries(configStore.additionalProviders);
    if (!searchTerm) return entries;
    return entries.filter(([key, provider]) =>
        key.toLowerCase().includes(searchTerm) || provider.label.toLowerCase().includes(searchTerm)
    );
});
const providerKeys = computed(() => filteredAdditionalProviders.value.map(([key]) => key));

const handleProviderSelect = (key) => {
    if (checkerStore.isChecking) return;
    if (key === configStore.currentProvider) {
        uiStore.providerDropdownOpen = false;
        providerSearchTerm.value = '';
        return;
    }
    configStore.selectProvider(key);
    resultsStore.clearResults();
    if (resultsStore.activeTab !== 'valid') resultsStore.activeTab = 'valid';
    providerSearchTerm.value = '';
};

const clearAdditionalProvider = () => handleProviderSelect('openai_responses');

const toggleDropdown = () => {
    if (checkerStore.isChecking) return;
    uiStore.providerDropdownOpen = !uiStore.providerDropdownOpen;
};

const closeDropdown = (event) => {
    if (providerSelectWrapper.value && !providerSelectWrapper.value.contains(event.target)) {
        uiStore.providerDropdownOpen = false;
        providerSearchTerm.value = '';
    }
};

const scrollHighlightedIntoView = () => {
    nextTick(() => {
        const options = dropdownContainer.value?.querySelectorAll('.provider-option');
        const option = options?.[highlightedIndex.value];
        option?.scrollIntoView({ block: 'nearest' });
    });
};

const handleKeyDown = (event) => {
    if (!uiStore.providerDropdownOpen) return;
    if (checkerStore.isChecking) {
        uiStore.providerDropdownOpen = false;
        providerSearchTerm.value = '';
        return;
    }
    if (event.key === 'Escape') {
        uiStore.providerDropdownOpen = false;
        providerSearchTerm.value = '';
        return;
    }

    const keys = providerKeys.value;
    if (!keys.length) return;
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        highlightedIndex.value = (highlightedIndex.value + 1) % keys.length;
        scrollHighlightedIntoView();
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        highlightedIndex.value = (highlightedIndex.value - 1 + keys.length) % keys.length;
        scrollHighlightedIntoView();
    } else if (event.key === 'Enter') {
        const key = keys[highlightedIndex.value];
        if (key) {
            event.preventDefault();
            handleProviderSelect(key);
        }
    }
};

onMounted(() => {
    document.addEventListener('click', closeDropdown);
    document.addEventListener('keydown', handleKeyDown);
});

onBeforeUnmount(() => {
    document.removeEventListener('click', closeDropdown);
    document.removeEventListener('keydown', handleKeyDown);
});

watch(() => uiStore.providerDropdownOpen, (isOpen) => {
    if (!isOpen) return;
    highlightedIndex.value = -1;
    nextTick(() => searchInputElement.value?.focus());
});

watch(() => checkerStore.isChecking, (isChecking) => {
    if (!isChecking) return;
    uiStore.providerDropdownOpen = false;
    providerSearchTerm.value = '';
});

watch(providerKeys, (keys) => {
    if (highlightedIndex.value >= keys.length) highlightedIndex.value = keys.length - 1;
});
</script>

<style scoped>
.provider-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.provider-header > label {
    margin-bottom: 0;
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 16px;
}

.region-btn {
    background: transparent;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    opacity: 0.6;
    transition: all 0.2s ease;
}

.region-btn:hover {
    opacity: 1;
    transform: rotate(15deg);
}

.region-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
}

.provider-picker {
    position: relative;
}

.provider-picker.disabled {
    opacity: 0.6;
    pointer-events: none;
}

.provider-preset-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(72px, auto);
    gap: 8px;
}

.provider-preset-button {
    min-width: 0;
    height: 58px;
    padding: 6px 8px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-surface);
    color: var(--text-primary);
    font-family: var(--font-sans);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.provider-preset-button:hover:not(:disabled) {
    border-color: var(--border-color-focus);
    transform: translateY(-1px);
}

.provider-preset-button:focus-visible {
    outline: none;
    border-color: var(--border-color-focus);
    box-shadow: var(--shadow-focus);
}

.provider-preset-button.active {
    background: var(--accent-dark);
    border-color: var(--accent-dark);
    color: white;
}

.provider-preset-button:disabled {
    cursor: not-allowed;
}

.provider-button-label {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.2;
    font-size: 0.82rem;
    font-weight: 600;
}

.provider-button-label small {
    max-width: 100%;
    margin-top: 3px;
    color: var(--text-tertiary);
    font-size: 0.64rem;
    font-weight: 500;
    line-height: 1.15;
    overflow-wrap: anywhere;
}

.provider-preset-button.active small {
    color: rgba(255, 255, 255, 0.72);
}

.selected-check {
    width: 17px;
    height: 17px;
    border-radius: 50%;
    background: white;
    color: var(--accent-dark);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    font-size: 0.7rem;
    font-weight: 800;
}

.more-providers-button {
    white-space: nowrap;
    font-size: 0.82rem;
    font-weight: 600;
}

.dropdown-chevron {
    width: 8px;
    height: 8px;
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: translateY(-2px) rotate(45deg);
    transition: transform 0.2s ease;
}

.more-providers-button.open .dropdown-chevron {
    transform: translateY(2px) rotate(225deg);
}

.custom-provider-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    z-index: 100;
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid var(--border-color-light);
    border-radius: var(--radius-md);
    background: var(--bg-surface);
    box-shadow: var(--shadow-medium);
    opacity: 0;
    visibility: hidden;
    transform: translateY(-8px);
    transition: opacity 0.2s ease, visibility 0.2s ease, transform 0.2s ease;
}

.custom-provider-dropdown.open {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
}

.provider-search-input {
    position: sticky;
    top: 0;
    z-index: 1;
    width: calc(100% - 24px);
    height: 40px;
    margin: 10px 12px;
    padding: 0 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-surface);
    font-size: 15px;
    font-family: var(--font-sans);
}

.provider-option {
    width: 100%;
    padding: 11px 16px;
    border: 0;
    border-top: 1px solid var(--border-color-light);
    background: var(--bg-surface);
    color: var(--text-primary);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    font-family: var(--font-sans);
    text-align: left;
    transition: background-color 0.2s ease, color 0.2s ease;
}

.provider-option:hover,
.provider-option.highlighted {
    background: var(--bg-tertiary);
}

.provider-option.highlighted {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
}

.provider-option.selected {
    background: var(--bg-selected);
    color: var(--accent-primary);
    font-weight: 600;
}

.provider-icon {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border-radius: 5px;
    background: var(--accent-dark);
    color: white;
    font-size: 0.78rem;
}

.provider-empty {
    padding: 22px 16px;
    color: var(--text-tertiary);
    font-size: 0.88rem;
    text-align: center;
}

.selected-additional {
    min-height: 34px;
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.78rem;
    color: var(--text-secondary);
}

.selected-status-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #16a05d;
    flex: 0 0 auto;
}

.selected-provider-chip {
    min-width: 0;
    padding: 4px 5px 4px 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
}

.chip-clear,
.clear-provider-button {
    border: 0;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    font-family: var(--font-sans);
}

.chip-clear {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    font-size: 1rem;
    line-height: 1;
}

.chip-clear:hover,
.clear-provider-button:hover {
    color: var(--text-primary);
    background: var(--bg-secondary);
}

.clear-provider-button {
    margin-left: auto;
    padding: 5px 2px;
    color: var(--accent-info);
    font-size: 0.76rem;
    white-space: nowrap;
}

.switch-label {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    gap: 8px;
    margin-bottom: 0;
    user-select: none;
}

.switch-label input[type="checkbox"] {
    display: none;
}

.slider {
    position: relative;
    width: 44px;
    height: 24px;
    background-color: var(--bg-tertiary);
    border-radius: 12px;
    transition: background-color 0.2s;
    flex-shrink: 0;
    border: 1px solid var(--border-color);
}

.slider::before {
    content: '';
    position: absolute;
    width: 20px;
    height: 20px;
    left: 2px;
    bottom: 1px;
    background-color: white;
    border-radius: 50%;
    transition: transform 0.2s;
}

.switch-label input:checked + .slider {
    background-color: var(--accent-primary);
    border-color: var(--accent-primary);
}

.switch-label input:checked + .slider::before {
    transform: translateX(20px);
}

.switch-title {
    font-weight: 600;
    color: var(--text-secondary);
    font-size: 0.9rem;
}

.switch-label:has(input:disabled) {
    cursor: not-allowed;
    opacity: 0.6;
}

@media (max-width: 540px) {
    .provider-preset-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .more-providers-button {
        grid-column: 1 / -1;
        height: 48px;
    }

    .selected-caption {
        display: none;
    }
}
</style>
