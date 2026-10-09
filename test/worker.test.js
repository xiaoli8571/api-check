import test from 'node:test';
import assert from 'node:assert/strict';

import worker, { RegionalFetcher, RequestRateLimiter } from '../src/index.js';

test('sensitive endpoints reject untrusted and missing origins', async () => {
    const env = { ALLOWED_ORIGINS: '[]' };
    const crossOrigin = await worker.fetch(new Request('https://checker.example/models', {
        method: 'POST',
        headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
        body: '{}',
    }), env, {});
    assert.equal(crossOrigin.status, 403);

    const missingOrigin = await worker.fetch(new Request('https://checker.example/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
    }), env, {});
    assert.equal(missingOrigin.status, 403);

    const sameOrigin = await worker.fetch(new Request('https://checker.example/models', {
        method: 'POST',
        headers: { Origin: 'https://checker.example', 'Content-Type': 'application/json' },
        body: '{}',
    }), env, {});
    assert.equal(sameOrigin.status, 400);

    const allowlisted = await worker.fetch(new Request('https://checker.example/models', {
        method: 'POST',
        headers: { Origin: 'https://frontend.example', 'Content-Type': 'application/json' },
        body: '{}',
    }), { ALLOWED_ORIGINS: '["https://frontend.example"]' }, {});
    assert.equal(allowlisted.status, 400);
});

test('RegionalFetcher revalidates internal targets', async () => {
    const fetcher = new RegionalFetcher({}, {});
    const response = await fetcher.fetch(new Request('http://do.internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            targetUrl: 'http://[::ffff:7f00:1]/metadata',
            method: 'GET',
            headers: {},
        }),
    }));
    assert.equal(response.status, 400);
});

test('RequestRateLimiter enforces a shared fixed-window token budget', async () => {
    let bucket;
    let alarmAt;
    const storage = {
        async transaction(callback) {
            return callback({
                get: async () => bucket,
                put: async (_key, value) => { bucket = value; },
            });
        },
        async setAlarm(value) { alarmAt = value; },
        async deleteAll() { bucket = undefined; },
    };
    const limiter = new RequestRateLimiter({ storage }, {});

    const consume = amount => limiter.fetch(new Request('http://rate-limiter.internal/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, maxTokens: 60000, windowMs: 3600000 }),
    }));

    assert.equal((await consume(40000)).status, 200);
    const denied = await consume(30000);
    assert.equal(denied.status, 429);
    assert.equal((await denied.json()).allowed, false);
    assert.ok(alarmAt > Date.now());
});

test('/models consumes a separate centralized per-IP quota', async () => {
    let limiterId;
    const env = {
        ALLOWED_ORIGINS: '[]',
        REQUEST_RATE_LIMITER: {
            idFromName(value) {
                limiterId = value;
                return value;
            },
            get() {
                return {
                    fetch: async () => new Response(JSON.stringify({ allowed: false, retryAfterMs: 30000 }), {
                        status: 429,
                        headers: { 'Content-Type': 'application/json' },
                    }),
                };
            },
        },
    };
    const response = await worker.fetch(new Request('https://checker.example/models', {
        method: 'POST',
        headers: {
            Origin: 'https://checker.example',
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '203.0.113.20',
        },
        body: '{}',
    }), env, {});

    assert.equal(response.status, 429);
    assert.equal(limiterId, 'models:203.0.113.20');
});

test('/models rejects oversized request bodies before JSON parsing', async () => {
    const response = await worker.fetch(new Request('https://checker.example/models', {
        method: 'POST',
        headers: {
            Origin: 'https://checker.example',
            'Content-Type': 'application/json',
        },
        body: 'x'.repeat(64 * 1024 + 1),
    }), { ALLOWED_ORIGINS: '[]' }, {});

    assert.equal(response.status, 413);
});

test('/models reports limiter infrastructure failures as unavailable', async () => {
    const originalError = console.error;
    console.error = () => {};
    const env = {
        ALLOWED_ORIGINS: '[]',
        REQUEST_RATE_LIMITER: {
            idFromName: value => value,
            get: () => ({ fetch: async () => { throw new Error('storage unavailable'); } }),
        },
    };
    try {
        const response = await worker.fetch(new Request('https://checker.example/models', {
            method: 'POST',
            headers: {
                Origin: 'https://checker.example',
                'Content-Type': 'application/json',
                'CF-Connecting-IP': '203.0.113.21',
            },
            body: '{}',
        }), env, {});

        assert.equal(response.status, 503);
        assert.equal(response.headers.get('Retry-After'), '5');
    } finally {
        console.error = originalError;
    }
});
