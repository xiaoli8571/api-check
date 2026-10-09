import test from 'node:test';
import assert from 'node:assert/strict';

import { TaskManager } from '../src/websocket_handler.js';

const PROVIDER_CONFIG = {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-test',
    enableStream: false,
    region: 'wnam',
    validationPrompt: 'Hi',
    validationMaxTokens: 16,
    validationMaxOutputTokens: 16,
};

function createManager(overrides = {}) {
    const errors = [];
    let doneResolve;
    const done = new Promise(resolve => { doneResolve = resolve; });
    const manager = new TaskManager({}, {
        onResult() {},
        onError(message) { errors.push(message); },
        onBatchDone() { doneResolve(); },
        ...overrides,
    });
    return { manager, errors, done };
}

test('session token quota is cumulative across batches', async () => {
    const { manager, errors } = createManager();
    manager.sessionTokenCount = 50000;
    await manager.start({
        tokens: [{ token: 'key', order: 0 }],
        providerConfig: PROVIDER_CONFIG,
        concurrency: 1,
    });

    assert.match(errors[0], /server limit/);
    assert.equal(manager.isProcessing, false);
});

test('pause stops workers from taking another item and resume continues', async () => {
    const { manager, done } = createManager();
    const processed = [];
    let releaseFirst;
    const firstGate = new Promise(resolve => { releaseFirst = resolve; });

    manager.runCheck = async item => {
        processed.push(item.order);
        if (item.order === 0) await firstGate;
    };

    await manager.start({
        tokens: [
            { token: 'key-1', order: 0 },
            { token: 'key-2', order: 1 },
            { token: 'key-3', order: 2 },
        ],
        providerConfig: PROVIDER_CONFIG,
        concurrency: 1,
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    manager.pause();
    releaseFirst();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(processed, [0]);

    manager.resume();
    await done;
    assert.deepEqual(processed, [0, 1, 2]);
});

test('invalid regions are rejected before work starts', async () => {
    const { manager, errors } = createManager();
    await manager.start({
        tokens: [{ token: 'key', order: 0 }],
        providerConfig: { ...PROVIDER_CONFIG, region: 'invalid-region' },
        concurrency: 1,
    });
    assert.equal(errors[0], 'Invalid initial data for a batch');
});

test('central token quota failures stop a batch before upstream work', async () => {
    let limiterId;
    const env = {
        MAX_TOKENS_PER_IP_PER_WINDOW: '60000',
        TOKEN_RATE_WINDOW_MS: '3600000',
        REQUEST_RATE_LIMITER: {
            idFromName: value => {
                limiterId = value;
                return value;
            },
            get: () => ({
                fetch: async () => new Response(JSON.stringify({ allowed: false, retryAfterMs: 30000 }), {
                    status: 429,
                    headers: { 'Content-Type': 'application/json' },
                }),
            }),
        },
    };
    const errors = [];
    const manager = new TaskManager(env, {
        onResult() {},
        onError(message) { errors.push(message); },
        onBatchDone() {},
    }, '203.0.113.9');

    await manager.start({
        tokens: [{ token: 'key', order: 0 }],
        providerConfig: PROVIDER_CONFIG,
        concurrency: 1,
    });

    assert.match(errors[0], /retry after 30 seconds/);
    assert.equal(manager.isProcessing, false);
    assert.equal(manager.isTerminated, true);
    assert.equal(limiterId, 'tokens:203.0.113.9');
});

test('closing a session while central quota is pending prevents work from starting', async () => {
    let releaseQuota;
    const quotaGate = new Promise(resolve => { releaseQuota = resolve; });
    const env = {
        REQUEST_RATE_LIMITER: {
            idFromName: value => value,
            get: () => ({
                fetch: async () => {
                    await quotaGate;
                    return new Response(JSON.stringify({ allowed: true, remaining: 10 }), {
                        headers: { 'Content-Type': 'application/json' },
                    });
                },
            }),
        },
    };
    const manager = new TaskManager(env, {
        onResult() {},
        onError() {},
        onBatchDone() {},
    }, '203.0.113.10');
    let checks = 0;
    manager.runCheck = async () => { checks++; };

    const startPromise = manager.start({
        tokens: [{ token: 'key', order: 0 }],
        providerConfig: PROVIDER_CONFIG,
        concurrency: 1,
    });
    manager.stop();
    releaseQuota();
    await startPromise;

    assert.equal(checks, 0);
    assert.equal(manager.isProcessing, false);
});

test('central token limiter infrastructure failures are not reported as quota exhaustion', async () => {
    const originalError = console.error;
    console.error = () => {};
    const env = {
        REQUEST_RATE_LIMITER: {
            idFromName: value => value,
            get: () => ({ fetch: async () => { throw new Error('storage unavailable'); } }),
        },
    };
    const errors = [];
    const manager = new TaskManager(env, {
        onResult() {},
        onError(message) { errors.push(message); },
        onBatchDone() {},
    }, '203.0.113.11');

    try {
        await manager.start({
            tokens: [{ token: 'key', order: 0 }],
            providerConfig: PROVIDER_CONFIG,
            concurrency: 1,
        });

        assert.match(errors[0], /temporarily unavailable/);
        assert.doesNotMatch(errors[0], /rate limit exceeded/i);
        assert.equal(manager.isTerminated, true);
    } finally {
        console.error = originalError;
    }
});
