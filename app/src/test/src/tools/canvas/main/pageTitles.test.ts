import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  readTitle,
  titleIn,
  type PageFetch,
} from '../../../../../tools/canvas/main/pageTitles';

const page =
  (
    body: string | Uint8Array<ArrayBuffer>,
    type = 'text/html; charset=utf-8',
    status = 200,
  ): PageFetch =>
  () =>
    Promise.resolve(
      new Response(body, { status, headers: { 'content-type': type } }),
    );

suite('Page titles', () => {
  test('reads the title of a page, its entities decoded and its whitespace folded into single spaces', () => {
    assert.strictEqual(
      titleIn(
        '<html><head><TITLE data-x="1">\n  Fish &amp; Chips &mdash; Caf&eacute;&#39;s &#x2192; menu\n</TITLE></head></html>',
      ),
      "Fish & Chips — Café's → menu",
    );
    assert.strictEqual(titleIn('<html><title>   </title></html>'), undefined);
    assert.strictEqual(
      titleIn('<html><body>no title</body></html>'),
      undefined,
    );
  });

  test('cuts a title past 1000 code units, never between the two halves of a character beyond the first plane', () => {
    assert.strictEqual(
      titleIn(`<title>${'x'.repeat(2000)}</title>`)?.length,
      1000,
    );
    const title = titleIn(`<title>a${'𝒜'.repeat(600)}</title>`);
    assert.strictEqual(title?.length, 999);
    assert.ok(title.isWellFormed());
  });

  test('reads a page only from the web, over https, without cookies and within a time', async () => {
    const asked: [string, RequestInit][] = [];
    const fetchPage: PageFetch = (url, init) => {
      asked.push([url, init]);
      return page('<title>Secure</title>')(url, init);
    };
    for (const url of [
      'http://example.com/',
      'file:///etc/passwd',
      'mailto:someone@example.com',
      'javascript:alert(1)',
      'not a url',
    ]) {
      assert.strictEqual(await readTitle(url, fetchPage), undefined, url);
    }
    assert.strictEqual(asked.length, 0);
    assert.strictEqual(
      await readTitle('https://example.com/', fetchPage),
      'Secure',
    );
    const [[url, init] = ['', {}]] = asked;
    assert.strictEqual(url, 'https://example.com/');
    assert.strictEqual(init.credentials, 'omit');
    assert.ok(init.signal instanceof AbortSignal);
  });

  test('reads no title of a page that failed, is no HTML or could not be fetched', async () => {
    const url = 'https://example.com/';
    assert.strictEqual(
      await readTitle(url, page('<title>Gone</title>', 'text/html', 404)),
      undefined,
    );
    assert.strictEqual(
      await readTitle(url, page('<title>Data</title>', 'application/json')),
      undefined,
    );
    assert.strictEqual(
      await readTitle(url, () => Promise.reject(new Error('offline'))),
      undefined,
    );
    assert.strictEqual(
      await readTitle(
        url,
        page('<title>Strict</title>', 'application/xhtml+xml'),
      ),
      'Strict',
    );
  });

  test('decodes a page in the charset its header or its meta names, and in UTF-8 otherwise', async () => {
    const url = 'https://example.com/';
    const latin = Uint8Array.from([
      ...new TextEncoder().encode('<title>Caf'),
      0xe9,
      ...new TextEncoder().encode('</title>'),
    ]);
    assert.strictEqual(
      await readTitle(url, page(latin, 'text/html; charset=ISO-8859-1')),
      'Café',
    );
    const meta = Uint8Array.from([
      ...new TextEncoder().encode('<meta charset="windows-1252"><title>'),
      0x93,
      0x41,
      0x94,
      ...new TextEncoder().encode('</title>'),
    ]);
    assert.strictEqual(await readTitle(url, page(meta, 'text/html')), '“A”');
    assert.strictEqual(
      await readTitle(url, page('<title>日本</title>', 'text/html')),
      '日本',
    );
    assert.strictEqual(
      await readTitle(
        url,
        page('<title>Odd</title>', 'text/html; charset=no-such-thing'),
      ),
      'Odd',
    );
  });

  test('reads no more of a page than its first 256 KB, and stops once its title has ended', async () => {
    const url = 'https://example.com/';
    let pulled = 0;
    const endless =
      (chunk: string): PageFetch =>
      () =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              pull: (controller) => {
                pulled += 1;
                controller.enqueue(new TextEncoder().encode(chunk));
              },
            }),
            { headers: { 'content-type': 'text/html' } },
          ),
        );
    assert.strictEqual(
      await readTitle(url, endless('<title>Early</tit')),
      undefined,
    );
    assert.ok(pulled <= Math.ceil((256 * 1024) / 16) + 2, String(pulled));
    pulled = 0;
    assert.strictEqual(
      await readTitle(url, endless('<title>Found</title>'.padEnd(64, ' '))),
      'Found',
    );
    assert.ok(pulled <= 2, String(pulled));
  });
});
