import test from 'node:test';
import assert from 'node:assert/strict';

import { getModels } from '../src/model_fetchers.js';

const ENV = {
    ENABLE_UA_RANDOMIZATION: 'false',
    ENABLE_ACCEPT_LANGUAGE_RANDOMIZATION: 'false',
};

test('Google model pagination encodes and rejects repeated page tokens', async () => {
    const originalFetch = globalThis.fetch;
    const urls = [];
    const repeatedToken = 'a+b&c';
    globalThis.fetch = async url => {
        urls.push(String(url));
        return new Response(JSON.stringify({
            models: [{ name: 'models/gemini-test', supportedGenerationMethods: ['generateContent'] }],
            nextPageToken: repeatedToken,
        }), { headers: { 'Content-Type': 'application/json' } });
    };

    try {
        await assert.rejects(
            getModels(
                { fetchModels: 'fetchGoogleModels' },
                'key',
                { provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
                ENV,
            ),
            /Repeated model page token/,
        );
        assert.equal(urls.length, 2);
        assert.match(urls[1], /pageToken=a%2Bb%26c/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('Google model pagination stops at the maximum page count', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
        calls++;
        return new Response(JSON.stringify({ models: [], nextPageToken: `page-${calls}` }));
    };

    try {
        await assert.rejects(
            getModels(
                { fetchModels: 'fetchGoogleModels' },
                'key',
                { provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
                ENV,
            ),
            /20 pages/,
        );
        assert.equal(calls, 20);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('model responses larger than the byte limit are cancelled', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('x'.repeat(2 * 1024 * 1024 + 1));

    try {
        await assert.rejects(
            getModels(
                { fetchModels: 'fetchOpenAIModels' },
                'key',
                { provider: 'openai', baseUrl: 'https://api.openai.com/v1' },
                ENV,
            ),
            /exceeds 2097152 bytes/,
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('Google model pagination rejects oversized page tokens', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
        models: [],
        nextPageToken: 'x'.repeat(4097),
    }));

    try {
        await assert.rejects(
            getModels(
                { fetchModels: 'fetchGoogleModels' },
                'key',
                { provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
                ENV,
            ),
            /page token exceeds limit \(4096 characters\)/,
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('Google model pagination enforces a cumulative response budget', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
        calls++;
        return new Response(JSON.stringify({
            models: [],
            nextPageToken: `page-${calls}`,
            padding: 'x'.repeat(1_800_000),
        }));
    };

    try {
        await assert.rejects(
            getModels(
                { fetchModels: 'fetchGoogleModels' },
                'key',
                { provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com' },
                ENV,
            ),
            /pagination exceeds total response limit/,
        );
        assert.equal(calls, 5);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
