import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  isPdf,
  isPdfFingerprint,
  pdfPlaceOf,
} from '../../../../../tools/commander/shared/pdf';

suite('PDFs', () => {
  test('tells a PDF by its extension, in any case', () => {
    assert.strictEqual(isPdf('C:/books/Guide.PDF'), true);
    assert.strictEqual(isPdf('notes.pdf.txt'), false);
  });

  test('takes the place PDF.js tells, a page, a zoom in percent or a fit, and the point on the page', () => {
    assert.deepStrictEqual(
      pdfPlaceOf({ pageNumber: 12, scale: 125, left: -13.4, top: 792.6 }),
      { page: 12, zoom: 125, left: -13, top: 793 },
    );
    assert.deepStrictEqual(
      pdfPlaceOf({ page: 3, zoom: 'page-width', left: 0, top: 500 }),
      { page: 3, zoom: 'page-width', left: 0, top: 500 },
    );
  });

  test('refuses a place it can not show, as the page sends it', () => {
    for (const bad of [
      undefined,
      'page=3',
      { page: 0, zoom: 'auto', left: 0, top: 0 },
      { page: 1.5, zoom: 'auto', left: 0, top: 0 },
      { page: 2, zoom: 'huge', left: 0, top: 0 },
      { page: 2, zoom: 0, left: 0, top: 0 },
      { page: 2, zoom: 100_000, left: 0, top: 0 },
      { page: 2, zoom: 'auto', left: Number.NaN, top: 0 },
      { page: 2, zoom: 'auto', left: 0, top: 1e12 },
    ]) {
      assert.strictEqual(pdfPlaceOf(bad), undefined, JSON.stringify(bad));
    }
  });

  test('takes the ID of a PDF as PDF.js gives it, in hex, and nothing else', () => {
    assert.strictEqual(
      isPdfFingerprint('9f0c1e2d3b4a59687766554433221100'),
      true,
    );
    assert.strictEqual(isPdfFingerprint(''), false);
    assert.strictEqual(isPdfFingerprint('../places'), false);
    assert.strictEqual(isPdfFingerprint('a'.repeat(129)), false);
    assert.strictEqual(isPdfFingerprint(7), false);
  });
});
