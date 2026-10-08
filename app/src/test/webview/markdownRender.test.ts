import * as assert from 'node:assert';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import markdownIt from 'markdown-it';
import { markdownRenderer } from '../../webview/markdownRender';

const { window } = new JSDOM('');
const render = markdownRenderer(createDOMPurify(window), markdownIt);
const noImages = () => undefined;

suite('Markdown', () => {
  suiteTeardown(() => window.close());

  test('renders what GitHub renders: tables, strikethrough, links and task lists', () => {
    const html = render(
      [
        '| a | b |',
        '| - | - |',
        '| 1 | 2 |',
        '',
        '~~gone~~ and https://example.com',
        '',
        '- [ ] todo',
        '- [x] done',
        '- plain',
      ].join('\n'),
      noImages,
    );
    assert.match(html, /<table>[\s\S]*<td>1<\/td>/);
    assert.match(html, /<s>gone<\/s>/);
    assert.match(
      html,
      /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">https:\/\/example\.com<\/a>/,
    );
    assert.match(html, /<li><input type="checkbox" disabled=""> todo<\/li>/);
    assert.match(
      html,
      /<li><input type="checkbox" disabled="" checked=""> done<\/li>/,
    );
    assert.match(html, /<li>plain<\/li>/);
  });

  test('keeps the HTML GitHub keeps, and nothing that runs or restyles the page', () => {
    const html = render(
      [
        '<p align="center" style="position:fixed" class="x">kept</p>',
        '',
        '<details><summary>more</summary>inside</details>',
        '',
        '<script>alert(1)</script>',
        '<iframe src="https://example.com"></iframe>',
        '<form action="https://example.com"><input type="text" name="q" value="v"></form>',
        '<input type="checkbox" value="v">',
        '',
        '<img src="a.png" onerror="alert(1)">',
        '',
        '[js](javascript:alert(1)) <a href="vbscript:x">vb</a>',
      ].join('\n'),
      (src) => `resolved/${src}`,
    );
    assert.match(html, /<p align="center">kept<\/p>/);
    assert.match(html, /<details><summary>more<\/summary>inside<\/details>/);
    for (const gone of [
      /<script/,
      /<iframe/,
      /<form/,
      /onerror/,
      /style=/,
      /class=/,
      /href="javascript/,
      /href="vbscript/,
      /name=/,
      /value=/,
    ]) {
      assert.doesNotMatch(html, gone);
    }
    assert.deepStrictEqual(html.match(/<input[^>]*>/g), [
      '<input type="checkbox" disabled="">',
    ]);
    assert.match(html, /<img src="resolved\/a\.png">/);
  });

  test('loads only the images it is given a source for, and links only https and mail links, the ones the app opens', () => {
    const asked: string[] = [];
    const html = render(
      [
        '![logo](docs/logo.png) ![remote](https://example.com/a.png)',
        '',
        '[relative](docs/a.md) [web](https://example.com) [mail](mailto:a@b.c) [plain](http://example.com)',
      ].join('\n'),
      (src) => {
        asked.push(src);
        return src.startsWith('https:') ? undefined : `/image/${src}`;
      },
    );
    assert.deepStrictEqual(asked, [
      'docs/logo.png',
      'https://example.com/a.png',
    ]);
    assert.match(html, /<img src="\/image\/docs\/logo\.png" alt="logo">/);
    assert.match(html, /<span class="markdown-alt">remote<\/span>/);
    assert.doesNotMatch(html, /<img alt=/);
    assert.match(
      html,
      /<a target="_blank" rel="noopener noreferrer">relative<\/a>/,
    );
    assert.match(html, /<a href="https:\/\/example\.com"[^>]*>web<\/a>/);
    assert.match(html, /<a href="mailto:a@b\.c"[^>]*>mail<\/a>/);
    assert.match(
      html,
      /<a target="_blank" rel="noopener noreferrer">plain<\/a>/,
    );
  });

  test('keeps the language of a code block, and no other class', () => {
    const html = render(
      [
        '```ts',
        'const a = 1;',
        '```',
        '',
        '<span class="language-ts">x</span>',
      ].join('\n'),
      noImages,
    );
    assert.match(
      html,
      /<pre><code class="language-ts">const a = 1;\n<\/code><\/pre>/,
    );
    assert.match(html, /<span>x<\/span>/);
  });
});
