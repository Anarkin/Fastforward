import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { findCount } from '../../../../../tools/commander/page/viewerFind';

suite('Searching a file viewed', () => {
  test('says it is searching until a match is found or the file is searched through, then counts as the diff does', () => {
    assert.strictEqual(findCount('', plainSearch, 0, 0, false), '');
    assert.strictEqual(findCount('a', plainSearch, 0, 0, false), 'Searching…');
    assert.strictEqual(findCount('a', plainSearch, 0, 0, true), 'No matches');
    assert.strictEqual(findCount('a', plainSearch, 3, 1, false), '2 of 3');
    assert.strictEqual(
      findCount('a', plainSearch, 10_000, 0, true),
      '1 of 10000+',
    );
  });
});
