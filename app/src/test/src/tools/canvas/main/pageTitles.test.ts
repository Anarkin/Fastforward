import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  readTitle,
  titleIn,
  type Fetched,
  type PageFetch,
  type Reach,
} from '../../../../../tools/canvas/main/pageTitles';

const publicAddress = '93.184.215.14';

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

const reach = (
  fetchPage: PageFetch,
  addresses: Readonly<Record<string, readonly string[]>> = {},
): Reach => ({
  fetchPage,
  lookup: (host) => Promise.resolve(addresses[host] ?? [publicAddress]),
});

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
    assert.strictEqual(
      titleIn('<title-bar>no</title-bar><title>Yes</title>'),
      'Yes',
    );
    assert.strictEqual(titleIn('<title>Open'), undefined);
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

  test('reads the title and the charset of a hostile page in time that grows with the page alone, a page of open tags never closed too', async () => {
    const started = performance.now();
    assert.strictEqual(titleIn('<title'.repeat(50_000)), undefined);
    const metas = new TextEncoder().encode(
      `${'<meta'.repeat(50_000)}<title>Late</title>`,
    );
    assert.strictEqual(
      await readTitle('https://example.com/', reach(page(metas, 'text/html'))),
      'Late',
    );
    assert.ok(performance.now() - started < 2000);
  });

  test('reads a page only from the web, over https to an address of the web, without cookies and within a time', async () => {
    const asked: string[] = [];
    const signals: AbortSignal[] = [];
    const fetchPage: PageFetch = (url, signal) => {
      asked.push(url);
      signals.push(signal);
      return page('<title>Secure</title>')(url, signal);
    };
    for (const url of [
      'http://example.com/',
      'file:///etc/passwd',
      'mailto:someone@example.com',
      'javascript:alert(1)',
      'not a url',
      'https://localhost/',
      'https://127.0.0.1/',
      'https://[::1]/',
      'https://10.0.0.7/',
      'https://192.168.1.1/',
      'https://169.254.169.254/',
      'https://internal.example/',
      'https://mapped.example/',
    ]) {
      assert.strictEqual(
        await readTitle(
          url,
          reach(fetchPage, {
            localhost: ['127.0.0.1'],
            '127.0.0.1': ['127.0.0.1'],
            '::1': ['::1'],
            '10.0.0.7': ['10.0.0.7'],
            '192.168.1.1': ['192.168.1.1'],
            '169.254.169.254': ['169.254.169.254'],
            'internal.example': [publicAddress, '172.16.4.2'],
            'mapped.example': ['::ffff:10.1.2.3'],
          }),
        ),
        undefined,
        url,
      );
    }
    assert.deepStrictEqual(asked, []);
    assert.strictEqual(
      await readTitle('https://example.com/', reach(fetchPage)),
      'Secure',
    );
    assert.deepStrictEqual(asked, ['https://example.com/']);
    assert.ok(signals[0] instanceof AbortSignal);
  });

  test('follows a page moved elsewhere on the web, five times at most, and no further than a move to a page it would not read', async () => {
    const asked: string[] = [];
    const moves: Readonly<Record<string, string>> = {
      'https://example.com/a': '/b',
      'https://example.com/b': 'https://example.org/c',
      'https://example.com/plain': 'http://example.com/plain',
      'https://example.com/inside': 'https://10.0.0.7/admin',
      'https://example.com/loop': '/loop',
    };
    const fetchPage: PageFetch = (url, signal): Promise<Fetched> => {
      asked.push(url);
      const moved = moves[url];
      return moved === undefined
        ? page(`<title>At ${url}</title>`)(url, signal)
        : Promise.resolve({ moved });
    };
    const addresses = { '10.0.0.7': ['10.0.0.7'] };
    assert.strictEqual(
      await readTitle('https://example.com/a', reach(fetchPage, addresses)),
      'At https://example.org/c',
    );
    asked.length = 0;
    for (const url of [
      'https://example.com/plain',
      'https://example.com/inside',
    ]) {
      assert.strictEqual(
        await readTitle(url, reach(fetchPage, addresses)),
        undefined,
      );
    }
    assert.deepStrictEqual(asked, [
      'https://example.com/plain',
      'https://example.com/inside',
    ]);
    asked.length = 0;
    assert.strictEqual(
      await readTitle('https://example.com/loop', reach(fetchPage)),
      undefined,
    );
    assert.strictEqual(asked.length, 6);
  });

  test('reads no title of a page that failed, is no HTML or could not be fetched', async () => {
    const url = 'https://example.com/';
    assert.strictEqual(
      await readTitle(
        url,
        reach(page('<title>Gone</title>', 'text/html', 404)),
      ),
      undefined,
    );
    assert.strictEqual(
      await readTitle(
        url,
        reach(page('<title>Data</title>', 'application/json')),
      ),
      undefined,
    );
    assert.strictEqual(
      await readTitle(
        url,
        reach(() => Promise.reject(new Error('offline'))),
      ),
      undefined,
    );
    assert.strictEqual(
      await readTitle(url, {
        fetchPage: page('<title>Unknown</title>'),
        lookup: () => Promise.reject(new Error('no such host')),
      }),
      undefined,
    );
    assert.strictEqual(
      await readTitle(
        url,
        reach(page('<title>Strict</title>', 'application/xhtml+xml')),
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
      await readTitle(url, reach(page(latin, 'text/html; charset=ISO-8859-1'))),
      'Café',
    );
    const meta = Uint8Array.from([
      ...new TextEncoder().encode('<meta charset="windows-1252"><title>'),
      0x93,
      0x41,
      0x94,
      ...new TextEncoder().encode('</title>'),
    ]);
    assert.strictEqual(
      await readTitle(url, reach(page(meta, 'text/html'))),
      '“A”',
    );
    assert.strictEqual(
      await readTitle(url, reach(page('<title>日本</title>', 'text/html'))),
      '日本',
    );
    assert.strictEqual(
      await readTitle(
        url,
        reach(page('<title>Odd</title>', 'text/html; charset=no-such-thing')),
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
      await readTitle(url, reach(endless('<title>Early</tit'))),
      undefined,
    );
    assert.ok(pulled <= Math.ceil((256 * 1024) / 16) + 2, String(pulled));
    pulled = 0;
    assert.strictEqual(
      await readTitle(
        url,
        reach(endless('<title>Found</title>'.padEnd(64, ' '))),
      ),
      'Found',
    );
    assert.ok(pulled <= 2, String(pulled));
  });
});
