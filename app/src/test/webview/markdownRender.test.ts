import * as assert from 'node:assert';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import markdownIt from 'markdown-it';
import { imageSourceOf } from '../../shared/images';
import { documentImagePath, documentImageUrl } from '../../webview/images';
import { showImages } from '../../webview/markdownPreview';
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

  test('keeps the HTML GitHub keeps, and no form, nothing that loads another document, and nothing that runs or restyles the page', () => {
    const html = render(
      [
        '<p align="center" style="position:fixed" class="x">kept</p>',
        '',
        '<details><summary>more</summary>inside</details>',
        '',
        '<script>alert(1)</script>',
        '<iframe src="https://example.com"></iframe>',
        '<object data="https://example.com/a.html"></object>',
        '<embed src="https://example.com/a.swf">',
        '<link rel="stylesheet" href="https://example.com/a.css">',
        '<meta http-equiv="refresh" content="0;url=https://example.com">',
        '<base href="https://example.com/">',
        '<video src="https://example.com/a.mp4"></video>',
        '<audio src="https://example.com/a.mp3"></audio>',
        '<picture><source srcset="https://example.com/a.png"></picture>',
        '<form action="https://example.com"><input type="text" name="q" value="v"></form>',
        '<button>b</button><select><option>o</option></select><textarea>t</textarea>',
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
      /<object/,
      /<embed/,
      /<link/,
      /<meta/,
      /<base/,
      /<video/,
      /<audio/,
      /<source/,
      /<form/,
      /<button/,
      /<select/,
      /<textarea/,
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
    assert.match(html, /<img data-path="resolved\/a\.png">/);
  });

  test('keeps only the images it is given a path for, by that path, leaving loading them to the page, and links only https and mail links, the ones the app opens', () => {
    const asked: string[] = [];
    const html = render(
      [
        '![logo](docs/logo.png) ![remote](https://example.com/a.png)',
        '',
        '[relative](docs/a.md) [web](https://example.com) [mail](mailto:a@b.c) [plain](http://example.com)',
      ].join('\n'),
      (src) => {
        asked.push(src);
        return src.startsWith('https:') ? undefined : `repo/${src}`;
      },
    );
    assert.deepStrictEqual(asked, [
      'docs/logo.png',
      'https://example.com/a.png',
    ]);
    assert.match(html, /<img alt="logo" data-path="repo\/docs\/logo\.png">/);
    assert.match(html, /<span class="markdown-alt">remote<\/span>/);
    assert.doesNotMatch(html, /<img alt="remote"/);
    assert.doesNotMatch(html, /src=/);
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

  test('keeps no path a document gives an image itself, so it loads only the images it links by their source', () => {
    const html = render(
      [
        '<img src="https://example.com/a.png" data-path="secret.png" alt="remote">',
        '<img data-path="secret.png" alt="none">',
        '<img src="a.png" data-path="secret.png">',
      ].join('\n'),
      (src) => (src.startsWith('https:') ? undefined : `repo/${src}`),
    );
    assert.doesNotMatch(html, /secret/);
    assert.match(html, /<span class="markdown-alt">remote<\/span>/);
    assert.match(html, /<span class="markdown-alt">none<\/span>/);
    assert.match(html, /<img data-path="repo\/a\.png">/);
  });

  test('loads the images of a document again in place for each version of the working tree, its text left as it is, so an image stays shown until it loads again', () => {
    const page = window.document.createElement('div');
    page.innerHTML = render(
      ['![shot](../shot.png)', '', '```ts', 'const a = 1;', '```'].join('\n'),
      (src) => documentImagePath('docs/a.md', src),
    );
    const [image] = page.querySelectorAll('img');
    const text = page.querySelector('pre');
    const show = (version: string) =>
      showImages(page, (path) =>
        documentImageUrl({ root: '/r', revision: undefined, version }, path),
      );
    const source = () =>
      imageSourceOf(
        new URL(image.getAttribute('src') ?? '', 'fastforward://app'),
      );
    show('1.1');
    assert.deepStrictEqual(source(), {
      root: '/r',
      path: 'shot.png',
      id: '1.1',
      disk: true,
    });
    show('1.2');
    assert.strictEqual(page.querySelector('img'), image);
    assert.strictEqual(page.querySelector('pre'), text);
    assert.strictEqual(source()?.id, '1.2');
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
