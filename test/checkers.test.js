import test from 'node:test';
import assert from 'node:assert/strict';

import { checkToken } from '../src/checkers.js';

const ENV = {
    ENABLE_UA_RANDOMIZATION: 'false',
    ENABLE_ACCEPT_LANGUAGE_RANDOMIZATION: 'false',
};

test('Gemini stream validation requests and accepts SSE', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    globalThis.fetch = async url => {
        requestedUrl = String(url);
        const chunks = ['d', 'a', 't', 'a', ': {"candidates":[]}\n\n'];
        return new Response(new ReadableStream({
            start(controller) {
                for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
                controller.close();
            },
        }), {
            headers: { 'Content-Type': 'text/event-stream' },
        });
    };

    try {
        const result = await checkToken(
            'test-key',
            { apiStyle: 'gemini' },
            {
                baseUrl: 'https://generativelanguage.googleapis.com',
                model: 'gemini-test',
                enableStream: true,
                validationMaxOutputTokens: 16,
            },
            ENV,
        );

        assert.equal(result.isValid, true);
        assert.match(requestedUrl, /streamGenerateContent\?alt=sse$/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('failed balance responses are cancelled immediately', async () => {
    const originalFetch = globalThis.fetch;
    let call = 0;
    let balanceBodyCancelled = false;
    globalThis.fetch = async () => {
        call++;
        if (call === 1) {
            return new Response('{"id":"completion"}', {
                headers: { 'Content-Type': 'application/json' },
            });
        }
        return new Response(new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('{"error":"unavailable"}'));
            },
            cancel() {
                balanceBodyCancelled = true;
            },
        }), { status: 503 });
    };

    try {
        const result = await checkToken(
            'test-key',
            { apiStyle: 'openai', balanceCheck: 'checkMoonshotBalance' },
            {
                baseUrl: 'https://api.moonshot.cn/v1',
                model: 'kimi-latest',
                enableStream: false,
            },
            ENV,
        );
        assert.equal(result.isValid, true);
        assert.equal(result.balance, -1);
        assert.equal(balanceBodyCancelled, true);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('Moonshot preserves a real zero balance', async () => {
    const originalFetch = globalThis.fetch;
    let call = 0;
    globalThis.fetch = async () => {
        call++;
        if (call === 1) {
            return new Response('{"id":"completion"}', {
                headers: { 'Content-Type': 'application/json' },
            });
        }
        return new Response('{"data":{"available_balance":"0"}}', {
            headers: { 'Content-Type': 'application/json' },
        });
    };

    try {
        const result = await checkToken(
            'test-key',
            { apiStyle: 'openai', balanceCheck: 'checkMoonshotBalance' },
            {
                baseUrl: 'https://api.moonshot.cn/v1',
                model: 'kimi-latest',
                enableStream: false,
            },
            ENV,
        );

        assert.equal(result.isValid, true);
        assert.equal(result.balance, 0);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('non-stream validation responses are rejected above the byte limit', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('x'.repeat(2 * 1024 * 1024 + 1));

    try {
        const result = await checkToken(
            'test-key',
            { apiStyle: 'openai' },
            {
                baseUrl: 'https://api.example.com/v1',
                model: 'test-model',
                enableStream: false,
            },
            ENV,
        );

        assert.equal(result.isValid, false);
        assert.match(result.rawError.content, /Validation response exceeds 2097152 bytes/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('oversized balance responses do not invalidate an otherwise valid token', async () => {
    const originalFetch = globalThis.fetch;
    const originalWarn = console.warn;
    let call = 0;
    console.warn = () => {};
    globalThis.fetch = async () => {
        call++;
        if (call === 1) return new Response('{"id":"completion"}');
        return new Response('x'.repeat(2 * 1024 * 1024 + 1));
    };

    try {
        const result = await checkToken(
            'test-key',
            { apiStyle: 'openai', balanceCheck: 'checkMoonshotBalance' },
            {
                baseUrl: 'https://api.moonshot.cn/v1',
                model: 'kimi-latest',
                enableStream: false,
            },
            ENV,
        );

        assert.equal(result.isValid, true);
        assert.equal(result.balance, -1);
        assert.equal(result.message, '有效但无法获取余额');
    } finally {
        console.warn = originalWarn;
        globalThis.fetch = originalFetch;
    }
});
