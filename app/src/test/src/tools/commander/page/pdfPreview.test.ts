import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { pdfFindCount } from '../../../../../tools/commander/page/pdfPreview';

suite('Searching a PDF viewed', () => {
  test('says it is searching until PDF.js finds a match or goes through the PDF, then counts as the diff does', () => {
    assert.strictEqual(pdfFindCount('', undefined), '');
    assert.strictEqual(pdfFindCount('fox', undefined), 'Searching…');
    assert.strictEqual(
      pdfFindCount('fox', { current: 0, total: 0, done: false }),
      'Searching…',
    );
    assert.strictEqual(
      pdfFindCount('fox', { current: 0, total: 0, done: true }),
      'No results',
    );
    assert.strictEqual(
      pdfFindCount('fox', { current: 2, total: 30, done: false }),
      '2 of 30',
    );
  });
});
