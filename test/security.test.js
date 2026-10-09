import test from 'node:test';
import assert from 'node:assert/strict';

import { getAllowedOrigins, validateOrigin, validateTargetUrl } from '../src/utils/security.js';

test('validateTargetUrl rejects private, reserved, and mapped IP addresses', () => {
    const blocked = [
        'http://127.0.0.1',
        'http://localhost.',
        'http://192.0.2.1',
        'http://[::1]',
        'http://[fea0::1]',
        'http://[::ffff:7f00:1]',
        'http://[2001:db8::1]',
        'https://user:password@example.com',
    ];

    for (const url of blocked) {
        assert.equal(validateTargetUrl(url), false, url);
    }
    assert.equal(validateTargetUrl('https://api.openai.com/v1'), true);
});

test('origin wildcard matches only the intended host shape', () => {
    const rules = ['https://*.workers.dev'];
    assert.equal(validateOrigin('https://checker.workers.dev', rules), 'https://checker.workers.dev');
    assert.equal(validateOrigin('https://checkerXworkersYdev', rules), null);
    assert.equal(validateOrigin('https://workers.dev', rules), null);
});

test('invalid allowed-origin configuration fails closed', () => {
    assert.deepEqual(getAllowedOrigins({ ALLOWED_ORIGINS: '"not-an-array"' }), []);
    assert.deepEqual(getAllowedOrigins({ ALLOWED_ORIGINS: '["https://ok.example",7]' }), ['https://ok.example']);
});
