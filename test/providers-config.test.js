import assert from 'node:assert/strict';
import test from 'node:test';
import PROVIDERS, { PRIMARY_PROVIDERS, ADDITIONAL_PROVIDERS } from '../config/providers.js';

const EXPECTED_PRIMARY_KEYS = ['openai', 'openai_responses', 'anthropic', 'gemini'];

test('provider groups stay ordered, extensible, and disjoint', () => {
    const additionalKeys = Object.keys(ADDITIONAL_PROVIDERS);

    assert.deepEqual(Object.keys(PRIMARY_PROVIDERS), EXPECTED_PRIMARY_KEYS);
    assert.deepEqual(PROVIDERS, { ...PRIMARY_PROVIDERS, ...ADDITIONAL_PROVIDERS });
    assert.equal(Object.keys(PROVIDERS).length, EXPECTED_PRIMARY_KEYS.length + additionalKeys.length);

    for (const key of EXPECTED_PRIMARY_KEYS) {
        assert.equal(key in ADDITIONAL_PROVIDERS, false, `${key} must not appear in both groups`);
    }
});

test('every primary provider defines its first-level selector labels', () => {
    for (const [key, provider] of Object.entries(PRIMARY_PROVIDERS)) {
        assert.equal(typeof provider.selector?.label, 'string', `${key} selector label is required`);
        assert.equal(typeof provider.selector?.detail, 'string', `${key} selector detail is required`);
        assert.notEqual(provider.selector.label.trim(), '', `${key} selector label must not be empty`);
        assert.notEqual(provider.selector.detail.trim(), '', `${key} selector detail must not be empty`);
    }
});
