import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  maxViewText,
  plainSearch,
  searchSchema,
} from '../../../../lib/shared/searchOptions';

suite('Search options', () => {
  test('keeps a query up to the longest text a view holds, and none longer, so one query pasted too long drops the search alone rather than the whole view of its tab', () => {
    const fits = { query: 'a'.repeat(maxViewText), options: plainSearch };
    assert.deepStrictEqual(searchSchema.encode(fits), fits);
    assert.strictEqual(
      searchSchema.encode({
        query: 'a'.repeat(maxViewText + 1),
        options: plainSearch,
      }),
      undefined,
    );
  });
});
