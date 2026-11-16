import * as assert from 'node:assert';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import markdownIt from 'markdown-it';
import { afterAll, suite, test } from 'vitest';
import { documentImagePath } from '../../../../../tools/viewer/page/documentImages';
import {
  boxCodeBlocks,
  showBlocks,
  showImages,
} from '../../../../../tools/viewer/page/markdownBlocks';
import { markdownRenderer } from '../../../../../tools/viewer/page/markdownRender';

const { window } = new JSDOM('');
const render = markdownRenderer(createDOMPurify(window), markdownIt);
const noImages = () => undefined;

const diagramAround = (paragraph: string) =>
  render(
    ['# Title', '', paragraph, '', '```mermaid', 'graph LR', '```'].join('\n'),
    noImages,
  );

suite('Markdown blocks', () => {
  afterAll(() => window.close());

  test('loads the images of a document again in place for each version of the working tree, its text left as it is, so an image stays shown until it loads again', () => {
    const page = window.document.createElement('div');
    page.innerHTML = render(
      ['![shot](../shot.png)', '', '```ts', 'const a = 1;', '```'].join('\n'),
      (src) => documentImagePath('docs/a.md', src),
    );
    const [image] = page.querySelectorAll('img');
    const text = page.querySelector('pre');
    const show = (version: string) =>
      showImages(page, (path) => `/files/${path}?version=${version}`);
    show('1.1');
    assert.strictEqual(
      image.getAttribute('src'),
      '/files/shot.png?version=1.1',
    );
    show('1.2');
    assert.strictEqual(page.querySelector('img'), image);
    assert.strictEqual(page.querySelector('pre'), text);
    assert.strictEqual(
      image.getAttribute('src'),
      '/files/shot.png?version=1.2',
    );
  });

  test('shows a document anew keeping each block whose HTML is unchanged as it was drawn, with what was drawn before it, telling the blocks it added and dropped', () => {
    const page = window.document.createElement('div');
    assert.deepStrictEqual(
      showBlocks(page, diagramAround('First.')).added.map(
        (block) => block.tagName,
      ),
      ['H1', 'P', 'PRE'],
    );
    const [heading, paragraph, code] = page.children;
    const drawn = window.document.createElement('div');
    code.before(drawn);
    code.setAttribute('hidden', '');
    const shown = showBlocks(page, diagramAround('Second.'));
    const [, edited] = page.children;
    assert.deepStrictEqual([...page.children], [heading, edited, drawn, code]);
    assert.strictEqual(edited.textContent, 'Second.');
    assert.ok(code.hasAttribute('hidden'));
    assert.deepStrictEqual(shown, { added: [edited], removed: [paragraph] });
  });

  test('keeps blocks alike in the order they come, adding the ones a document has more of', () => {
    const page = window.document.createElement('div');
    showBlocks(page, render('Same.\n\nSame.', noImages));
    const [first, second] = page.children;
    const shown = showBlocks(page, render('Same.\n\nSame.\n\nSame.', noImages));
    const [kept, keptToo, third] = page.children;
    assert.deepStrictEqual([kept, keptToo], [first, second]);
    assert.deepStrictEqual(shown, { added: [third], removed: [] });
  });

  test('puts each character of a code block drawn wider or narrower than its columns in a box exactly as wide as them, as the viewer and the diff do, shrinking a glyph wider than its box, and leaves the code outside blocks alone', () => {
    const { document } = new JSDOM(
      '<main><pre><code>a😀b中</code></pre><p><code>x😀</code></p><pre><code>plain</code></pre></main>',
    ).window;
    const main = document.querySelector('main');
    assert.ok(main);
    boxCodeBlocks(main, {
      char: 10,
      of: () => 20,
      boxed: (cluster) => (/[😀中]/u.test(cluster) ? 2 : undefined),
      scaled: (cluster) => (cluster === '😀' ? 0.875 : undefined),
    });
    assert.deepStrictEqual(
      [...main.querySelectorAll('code')].map((code) => code.innerHTML),
      [
        'a<span class="cell wide"><span style="font-size: 0.875em;">😀</span></span>b<span class="cell wide">中</span>',
        'x😀',
        'plain',
      ],
    );
  });
});
