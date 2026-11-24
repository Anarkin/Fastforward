import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import { copiedMarkdown } from '../../../../../tools/viewer/page/markdownCopy';

const { window } = new JSDOM('');

const shown = () => {
  const root = window.document.createElement('div');
  root.innerHTML =
    '<h1>Title</h1><p>Some prose.</p><pre><code data-block="one"></code></pre><p>Between.</p><pre><code data-block="two"></code></pre><p>After.</p>';
  window.document.body.replaceChildren(root);
  const texts = new Map([
    ['one', 'const code = 1;\nconst more = 2;\n'],
    ['two', 'end();\n'],
  ]);
  const codes = root.querySelectorAll('pre > code');
  const textOf = (code: Element) =>
    texts.get(code.getAttribute('data-block') ?? '');
  const selection = window.getSelection();
  assert.ok(selection);
  return { root, codes, textOf, selection };
};

const selected = (
  selection: Selection,
  start: Node,
  startOffset: number,
  end: Node,
  endOffset: number,
) => {
  const range = window.document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  selection.removeAllRanges();
  selection.addRange(range);
  return range;
};

suite('Copying a Markdown preview', () => {
  test('copies the text of the code blocks a selection runs over with the prose around them, as their text is drawn as cells and is in no element of the page, so a preview selected whole copied none of its code, keeping the selection as it was', () => {
    const { root, codes, textOf, selection } = shown();
    selection.selectAllChildren(root);
    const before = selection.toString();

    assert.strictEqual(
      copiedMarkdown(selection, codes, textOf),
      'TitleSome prose.\n\nconst code = 1;\nconst more = 2;\n\nBetween.\n\nend();\n\nAfter.',
    );
    assert.strictEqual(selection.toString(), before);
  });

  test('copies a code block whole from a selection that starts or ends in it, and the prose on the other side of it', () => {
    const { root, codes, textOf, selection } = shown();
    const [one, two] = [...codes];
    assert.ok(one && two);
    const after = root.lastElementChild?.firstChild;
    assert.ok(after);
    selected(selection, one, 0, after, 3);

    assert.strictEqual(
      copiedMarkdown(selection, codes, textOf),
      'const code = 1;\nconst more = 2;\n\nBetween.\n\nend();\n\nAft',
    );
  });

  test('leaves the copy to the browser while no code block is selected, and to the cells of a block while the selection is inside it alone', () => {
    const { root, codes, textOf, selection } = shown();
    const prose = root.firstElementChild?.nextElementSibling?.firstChild;
    const [one] = [...codes];
    assert.ok(prose && one);
    selected(selection, prose, 0, prose, 4);
    assert.strictEqual(copiedMarkdown(selection, codes, textOf), undefined);
    selected(selection, one, 0, one, 0);
    assert.strictEqual(copiedMarkdown(selection, codes, textOf), undefined);
    selection.removeAllRanges();
    assert.strictEqual(copiedMarkdown(selection, codes, textOf), undefined);
  });
});
