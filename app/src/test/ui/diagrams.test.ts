import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { afterAll, suite, test } from 'vitest';
import { strings } from '../../shared/strings';
import {
  mermaidDrawer,
  showDiagrams,
  type DrawDiagram,
} from '../../ui/diagrams';

const { window } = new JSDOM('');
const { document } = window;

const svg = (width: number, height: number, label: string) =>
  `<svg id="d" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: ${width}px;" viewBox="-8 -8 ${width} ${height}"><text>${label}</text></svg>`;

const preview = (...blocks: [string, string][]) => {
  const element = document.createElement('div');
  for (const [language, text] of blocks) {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = `language-${language}`;
    code.textContent = text;
    pre.append(code);
    element.append(pre);
  }
  return element;
};

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

const sourceOf = (src: string | null) =>
  decodeURIComponent(
    src?.replace(/^data:image\/svg\+xml;charset=utf-8,/, '') ?? '',
  );

const imageOf = (src: string | null | undefined) =>
  new window.DOMParser().parseFromString(
    sourceOf(src ?? null),
    'image/svg+xml',
  );

suite('Diagrams', () => {
  afterAll(() => window.close());

  test('draws each Mermaid code block as an image of its SVG, sized by its view box, hiding its code and leaving other code blocks', async () => {
    const element = preview(
      ['mermaid', 'graph TD\n  A --> B\n'],
      ['ts', 'const a = 1;\n'],
      ['mermaid', 'pie\n  "a" : 1\n'],
    );
    const drawn: string[] = [];
    showDiagrams(element, async () => async (source) => {
      drawn.push(source);
      return svg(drawn.length * 100, 50, source);
    });
    await settled();
    assert.deepStrictEqual(drawn, [
      'graph TD\n  A --> B\n',
      'pie\n  "a" : 1\n',
    ]);
    const [first, second] = element.querySelectorAll('.markdown-diagram img');
    const image = imageOf(first.getAttribute('src')).documentElement;
    assert.strictEqual(image.getAttribute('viewBox'), '-8 -8 100 50');
    assert.strictEqual(image.textContent, drawn[0]);
    assert.strictEqual(first.getAttribute('width'), '100');
    assert.strictEqual(first.getAttribute('height'), '50');
    assert.strictEqual(first.getAttribute('alt'), strings.diff.diagram);
    assert.strictEqual(second.getAttribute('width'), '200');
    const pres = [...element.querySelectorAll('pre')];
    assert.deepStrictEqual(
      pres.map((pre) => pre.hidden),
      [true, false, true],
    );
    assert.strictEqual(
      pres[0].previousElementSibling?.className,
      'markdown-diagram',
    );
  });

  test('writes the HTML of labels as XML, as an image of an SVG is read as XML, which takes no line break left open and no named entity', async () => {
    const element = preview(['mermaid', 'graph TD\n  A["One<br/>two"]\n']);
    showDiagrams(
      element,
      async () => async () =>
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><foreignObject width="80" height="40"><div xmlns="http://www.w3.org/1999/xhtml"><span>One<br>two&nbsp;&amp;&lt;three&gt;</span></div></foreignObject></svg>',
    );
    await settled();
    const image = imageOf(
      element.querySelector('.markdown-diagram img')?.getAttribute('src'),
    );
    assert.strictEqual(image.querySelector('parsererror'), null);
    assert.strictEqual(image.getElementsByTagName('br').length, 1);
    assert.strictEqual(image.documentElement.textContent, 'Onetwo &<three>');
  });

  test('keeps the code of a diagram that fails to draw, saying it could not be drawn', async () => {
    const element = preview(['mermaid', 'graph nonsense\n']);
    showDiagrams(element, async () => async () => {
      throw new Error('Parse error on line 1');
    });
    await settled();
    const pre = element.querySelector('pre');
    assert.strictEqual(pre?.hidden, false);
    assert.strictEqual(pre?.previousElementSibling?.className, 'markdown-note');
    assert.strictEqual(
      pre?.previousElementSibling?.textContent,
      strings.diff.diagramFailed,
    );
    assert.strictEqual(element.querySelectorAll('img').length, 0);
  });

  test('puts the code back once left, drawing nothing that finishes later', async () => {
    const element = preview(
      ['mermaid', 'graph TD\n  A --> B\n'],
      ['mermaid', 'graph TD\n  C --> D\n'],
    );
    const late = Promise.withResolvers<string>();
    let drawn = 0;
    const leave = showDiagrams(element, async () => async () => {
      drawn++;
      return drawn === 1 ? svg(100, 50, 'first') : late.promise;
    });
    await settled();
    assert.strictEqual(element.querySelectorAll('img').length, 1);
    leave();
    late.resolve(svg(100, 50, 'second'));
    await settled();
    assert.strictEqual(element.querySelectorAll('.markdown-diagram').length, 0);
    assert.deepStrictEqual(
      [...element.querySelectorAll('pre')].map((pre) => pre.hidden),
      [false, false],
    );
  });

  test('loads nothing to draw with for a document without diagrams', async () => {
    let loaded = false;
    showDiagrams(preview(['ts', 'const a = 1;\n']), async () => {
      loaded = true;
      return async () => '';
    });
    await settled();
    assert.strictEqual(loaded, false);
  });

  test('draws with Mermaid at its strict security level, in the theme of the color scheme and the font of the page, keeping its error diagrams out of the page', async () => {
    const configs: unknown[] = [];
    const ids: string[] = [];
    const mermaid = {
      initialize: (config: unknown) => configs.push(config),
      render: async (id: string, source: string) => {
        ids.push(id);
        return { svg: `<svg>${source}</svg>`, diagramType: 'flowchart' };
      },
    };
    const draw: DrawDiagram = mermaidDrawer(mermaid, {
      dark: true,
      fontFamily: 'Segoe UI',
    });
    assert.strictEqual(await draw('graph TD'), '<svg>graph TD</svg>');
    await draw('pie');
    mermaidDrawer(mermaid, { dark: false, fontFamily: 'Segoe UI' });
    assert.deepStrictEqual(configs, [
      {
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        theme: 'dark',
        fontFamily: 'Segoe UI',
      },
      {
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        theme: 'default',
        fontFamily: 'Segoe UI',
      },
    ]);
    assert.strictEqual(new Set(ids).size, 2);
  });
});
