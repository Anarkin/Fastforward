import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import { holdPdfStyles } from '../../../../../tools/viewer/page/pdfStyles';

suite('Styles of the PDF viewer', () => {
  test('are in the page only while a PDF is shown, in a layer below the styles of the app, one sheet for every PDF shown, taken out with the last of them, as every element the app draws was matched against the 370 nested rules of PDF.js, more than half of the time a screen of the diff took to restyle', async () => {
    const { window } = new JSDOM('<!doctype html><title>page</title>');
    const { document } = window;
    const sheets = () =>
      [...document.head.querySelectorAll('style')].map(
        (sheet) => sheet.textContent,
      );
    assert.deepStrictEqual(sheets(), []);

    const first = holdPdfStyles(document);
    const second = holdPdfStyles(document);
    assert.deepStrictEqual(sheets(), [
      "@import url('pdfViewer.css') layer(pdfjs);",
    ]);
    let loaded = false;
    void second.loaded.then(() => {
      loaded = true;
    });
    await Promise.resolve();
    assert.strictEqual(loaded, false);
    document.head
      .querySelector('style')
      ?.dispatchEvent(new window.Event('load'));
    await first.loaded;
    await second.loaded;

    first.release();
    first.release();
    assert.strictEqual(sheets().length, 1);
    second.release();
    assert.deepStrictEqual(sheets(), []);

    const again = holdPdfStyles(document);
    assert.strictEqual(sheets().length, 1);
    document.head
      .querySelector('style')
      ?.dispatchEvent(new window.Event('error'));
    await again.loaded;
    again.release();
    assert.deepStrictEqual(sheets(), []);
  });
});
