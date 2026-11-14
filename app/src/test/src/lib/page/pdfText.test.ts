import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { pdfText } from '../../../../lib/page/pdfText';

function element(attributes: Record<string, string>) {
  const set = new Map(Object.entries(attributes));
  return {
    getAttribute: (name: string) => set.get(name) ?? null,
    setAttribute: (name: string, value: string) => set.set(name, value),
    querySelectorAll: () => [],
    set,
  };
}

suite('Text of PDF.js', () => {
  test('names each page for screen readers with the text of the app, by its number', async () => {
    const page = element({
      'data-l10n-id': 'pdfjs-page-landmark',
      'data-l10n-args': JSON.stringify({ page: 7 }),
    });

    await pdfText().translateOnce(page);

    assert.strictEqual(page.set.get('aria-label'), 'Page 7');
  });

  test('gives the date of an annotation in the date format of the system, and no text for messages the app does not show', async () => {
    const text = pdfText();
    const when = new Date(2026, 10, 1, 21, 30);
    assert.strictEqual(
      await text.get('pdfjs-annotation-date-time-string', {
        dateObj: when.valueOf(),
      }),
      when.toLocaleString(),
    );
    assert.strictEqual(await text.get('pdfjs-editor-ink-button'), '');
    assert.deepStrictEqual(
      await text.get(['pdfjs-page-landmark', 'pdfjs-other']),
      ['', ''],
    );
    assert.strictEqual(text.getLanguage(), 'en-us');
    assert.strictEqual(text.getDirection(), 'ltr');
  });
});
