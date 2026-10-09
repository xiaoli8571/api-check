import assert from 'node:assert/strict';
import test from 'node:test';

import { findFirstNonEmptyCategory } from '../frontend/src/utils/resultCategories.js';

test('finds the first non-empty result category in tab order', () => {
    const results = {
        valid: [],
        lowBalance: [],
        zeroBalance: [{ token: 'zero' }],
        rateLimit: [{ token: 'limited' }],
        invalid: [{ token: 'invalid' }],
        duplicate: [],
    };

    assert.equal(findFirstNonEmptyCategory(results), 'zeroBalance');
});

test('prefers valid when it has results', () => {
    const results = {
        valid: [{ token: 'valid' }],
        lowBalance: [{ token: 'low' }],
    };

    assert.equal(findFirstNonEmptyCategory(results), 'valid');
});

test('returns null when every result category is empty', () => {
    assert.equal(findFirstNonEmptyCategory({}), null);
});
