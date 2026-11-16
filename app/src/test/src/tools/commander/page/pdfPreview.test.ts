import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { pdfFound } from '../../../../../tools/commander/page/pdfPreview';
import { matchCount } from '../../../../../lib/shared/textMatches';

const pdfCount = (
  query: string,
  options: typeof plainSearch,
  found: Parameters<typeof pdfFound>[0],
) => matchCount(query, options, pdfFound(found));

suite('Searching a PDF viewed', () => {
  test('says it is searching until PDF.js finds a match or goes through the PDF, then counts as the diff does', () => {
    assert.strictEqual(pdfCount('', plainSearch, undefined), '');
    assert.strictEqual(pdfCount('fox', plainSearch, undefined), 'Searching…');
    assert.strictEqual(
      pdfCount('fox', plainSearch, {
        current: 0,
        total: 0,
        done: false,
        settled: false,
      }),
      'Searching…',
    );
    assert.strictEqual(
      pdfCount('fox', plainSearch, {
        current: 0,
        total: 0,
        done: true,
        settled: true,
      }),
      'No matches',
    );
    assert.strictEqual(
      pdfCount('fox', plainSearch, {
        current: 2,
        total: 30,
        done: false,
        settled: false,
      }),
      '2 of 30',
    );
  });
});
