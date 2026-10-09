import test from 'node:test';
import assert from 'node:assert/strict';

import { secureProxiedFetch } from '../src/utils/fetcher.js';

const ENV = {
    ENABLE_UA_RANDOMIZATION: 'false',
    ENABLE_ACCEPT_LANGUAGE_RANDOMIZATION: 'false',
};

test('regional fetch uses locationHint and a versioned Durable Object name', async () => {
    const originalFetch = globalThis.fetch;
    const observed = {};
    globalThis.fetch = async () => {
        throw new Error('direct fetch fallback must not run');
    };

    try {
        const env = {
            ...ENV,
            REGIONAL_FETCHER: {
                idFromName(name) {
                    observed.name = name;
                    return name;
                },
                get(id, options) {
                    observed.id = id;
                    observed.options = options;
                    return {
                        async fetch() {
                            return new Response('{"ok":true}', {
                                headers: { 'Content-Type': 'application/json' },
                            });
                        },
                    };
                },
            },
        };

        const response = await secureProxiedFetch(
            'https://api.openai.com/v1/models',
            { method: 'GET' },
            'weur',
            env,
            1000,
        );

        assert.deepEqual(await response.json(), { ok: true });
        assert.equal(observed.name, 'v2:weur');
        assert.deepEqual(observed.options, { locationHint: 'weur' });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('timeout remains active while consuming the response body', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(new ReadableStream({ start() {} }));

    try {
        const response = await secureProxiedFetch(
            'https://api.example.com/slow',
            { method: 'GET' },
            null,
            ENV,
            20,
        );
        await assert.rejects(response.text(), error => error?.name === 'AbortError');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('safe same-origin redirects are followed manually', async () => {
    const originalFetch = globalThis.fetch;
    const observed = [];
    globalThis.fetch = async (url, options) => {
        observed.push({ url: String(url), options });
        if (observed.length === 1) {
            return new Response(null, {
                status: 307,
                headers: { Location: '/redirected' },
            });
        }
        return new Response('{"ok":true}');
    };

    try {
        const response = await secureProxiedFetch(
            'https://api.example.com/test',
            { method: 'GET' },
            null,
            ENV,
            1000,
        );
        assert.deepEqual(await response.json(), { ok: true });
        assert.equal(observed.length, 2);
        assert.equal(observed[0].options.redirect, 'manual');
        assert.equal(observed[1].url, 'https://api.example.com/redirected');
        assert.equal(observed[1].options.method, 'GET');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('cross-origin redirect targets are rejected without receiving credentials', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
        calls++;
        return new Response(null, {
            status: 302,
            headers: { Location: 'https://evil.example/collect' },
        });
    };

    try {
        const response = await secureProxiedFetch(
            'https://api.example.com/test',
            { method: 'GET', headers: { Authorization: 'Bearer secret' } },
            null,
            ENV,
            1000,
        );
        assert.equal(response.status, 400);
        assert.equal(calls, 1);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('regional AbortError is preserved as a timeout response', async () => {
    const env = {
        ...ENV,
        REGIONAL_FETCHER: {
            idFromName: name => name,
            get: () => ({
                async fetch() {
                    throw new DOMException('Timed out', 'AbortError');
                },
            }),
        },
    };
    const response = await secureProxiedFetch(
        'https://api.example.com/test',
        { method: 'GET' },
        'wnam',
        env,
        1000,
    );
    assert.equal(response.status, 408);
});
