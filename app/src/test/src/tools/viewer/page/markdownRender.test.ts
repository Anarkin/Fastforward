import * as assert from 'node:assert';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import markdownIt from 'markdown-it';
import { afterAll, suite, test } from 'vitest';
import { markdownRenderer } from '../../../../../tools/viewer/page/markdownRender';

const { window } = new JSDOM('');
const render = markdownRenderer(createDOMPurify(window), markdownIt);
const noImages = () => undefined;

suite('Markdown', () => {
  afterAll(() => window.close());

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

  test('leaves the control characters of a paragraph and of a code block in the text, for the font of the app to draw as the viewer draws a text, and swaps the form feed alone for its picture, leaving a picture the file itself holds as it is', () => {
    const formFeed = String.fromCharCode(12);
    const html = render(
      [
        `bell \u0007 and ␛ fed${formFeed}on`,
        '',
        '```',
        `a\u001b[0m\u007f${formFeed}`,
        '```',
      ].join('\n'),
      noImages,
    );
    assert.ok(html.includes('<p>bell \u0007 and ␛ fed␌on</p>'), html);
    assert.ok(html.includes('<code>a\u001b[0m\u007f␌\n</code>'), html);
  });

  test('aligns the columns of a table as its separator row says, as GitHub does, by the align it keeps rather than a style', () => {
    const html = render(
      ['| a | b | c | d |', '|:--|:-:|--:|---|', '| 1 | 2 | 3 | 4 |'].join(
        '\n',
      ),
      noImages,
    );
    assert.match(
      html,
      /<th align="left">a<\/th>\s*<th align="center">b<\/th>\s*<th align="right">c<\/th>\s*<th>d<\/th>/,
    );
    assert.match(
      html,
      /<td align="left">1<\/td>\s*<td align="center">2<\/td>\s*<td align="right">3<\/td>\s*<td>4<\/td>/,
    );
    assert.doesNotMatch(html, /style=/);
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

  test('hands the title a document gives a link, an image or an abbreviation to the tooltip of the app as plain words, rather than to the tooltip of the browser, and keeps no data attribute of the document, so a document tells that tooltip nothing but words', () => {
    const html = render(
      [
        '[a link](https://example.com "where it goes")',
        '',
        '<abbr title="HyperText">HT</abbr>',
        '',
        `<span data-tip="mine" data-tip-said='["x"]' data-other="1" title="plain">t</span>`,
      ].join('\n'),
      noImages,
    );
    assert.match(
      html,
      /<a href="https:\/\/example\.com" data-tip="where it goes" target=/,
    );
    assert.match(html, /<abbr data-tip="HyperText">HT<\/abbr>/);
    assert.match(html, /<span data-tip="plain">t<\/span>/);
    assert.doesNotMatch(html, / title=|data-tip-said|data-other|mine/);
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
