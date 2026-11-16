import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import {
  keptPdfFound,
  pdfFound,
  stepToKept,
} from '../../../../../tools/commander/page/pdfPreview';
import { matchCount } from '../../../../../lib/shared/textMatches';

const pdfCount = (
  query: string,
  options: typeof plainSearch,
  found: Parameters<typeof pdfFound>[0],
) => matchCount(query, options, pdfFound(found));

const at = (current: number, total: number, done = false) => ({
  current,
  total,
  done,
});

suite('Searching a PDF viewed', () => {
  test('steps from the match PDF.js lands on to the match its tab was left on, once PDF.js counts that many, and then lets it be', () => {
    assert.strictEqual(stepToKept(at(0, 0), 3), undefined);
    assert.strictEqual(stepToKept(at(1, 2), 3), undefined);
    assert.strictEqual(stepToKept(at(1, 5), 3), 1);
    assert.strictEqual(stepToKept(at(5, 5), 3), -1);
    assert.strictEqual(stepToKept(at(3, 5), 3), undefined);
    assert.strictEqual(stepToKept(at(1, 5), undefined), undefined);
    assert.strictEqual(keptPdfFound(at(1, 5), 3), 3);
    assert.strictEqual(keptPdfFound(at(3, 5), 3), undefined);
    assert.strictEqual(keptPdfFound(at(1, 2, true), 3), undefined);
    assert.strictEqual(keptPdfFound(at(1, 2), 3), 3);
  });

  test('says it is searching until PDF.js finds a match or goes through the PDF, then counts as the diff does', () => {
    assert.strictEqual(pdfCount('', plainSearch, undefined), '');
    assert.strictEqual(pdfCount('fox', plainSearch, undefined), 'Searching…');
    assert.strictEqual(
      pdfCount('fox', plainSearch, { current: 0, total: 0, done: false }),
      'Searching…',
    );
    assert.strictEqual(
      pdfCount('fox', plainSearch, { current: 0, total: 0, done: true }),
      'No matches',
    );
    assert.strictEqual(
      pdfCount('fox', plainSearch, { current: 2, total: 30, done: false }),
      '2 of 30',
    );
  });
});
