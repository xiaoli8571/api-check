/**
 * @description 在固定字节预算内读取 Fetch API Request/Response 的文本正文。
 * @param {{body: ReadableStream<Uint8Array>|null}} source
 * @param {{maxBytes: number, label?: string, budget?: {usedBytes: number, maxBytes: number}|null, totalLimitMessage?: string}} options
 * @returns {Promise<string>}
 */
export async function readBodyTextWithLimit(source, {
    maxBytes,
    label = 'Response',
    budget = null,
    totalLimitMessage = '',
}) {
    if (!source.body) return '';

    const reader = source.body.getReader();
    const decoder = new TextDecoder();
    let totalBytes = 0;
    let text = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            totalBytes += value.byteLength;
            if (budget) budget.usedBytes += value.byteLength;

            const exceedsTotalBudget = budget && budget.usedBytes > budget.maxBytes;
            if (totalBytes > maxBytes || exceedsTotalBudget) {
                try { await reader.cancel(`${label} is too large`); } catch (_) {}
                if (exceedsTotalBudget) {
                    throw new Error(totalLimitMessage || `${label} exceeds total response limit (${budget.maxBytes} bytes)`);
                }
                throw new Error(`${label} exceeds ${maxBytes} bytes`);
            }

            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        return text;
    } finally {
        try { reader.releaseLock(); } catch (_) {}
    }
}

/**
 * @description 在固定字节预算内读取并解析 JSON 正文。
 */
export async function readBodyJsonWithLimit(source, options) {
    return JSON.parse(await readBodyTextWithLimit(source, options));
}
