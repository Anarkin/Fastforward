import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import { labelTip, tip, tipOf, tipped } from '../../../../lib/page/tips';
import { namedFile, sentence } from '../../../../lib/shared/sentences';

function element(
  props: Readonly<Record<string, string | undefined>>,
  tag = 'i',
) {
  const { document } = new JSDOM(
    `<!doctype html><body><${tag} id="it"></${tag}>`,
  ).window;
  const it = document.getElementById('it');
  assert.ok(it);
  for (const [name, value] of Object.entries(props)) {
    if (value !== undefined) {
      it.setAttribute(name, value);
    }
  }
  return it;
}

suite('The tooltip of an element', () => {
  test('is told in attributes of its element, its words as text, a path among them as it is written, and, where it names a path, the sentence too, so no element carries more than text for it and none listens for the pointer', () => {
    assert.deepStrictEqual(tip('Wrap'), { 'data-tip': 'Wrap' });
    const moved = sentence`Moved from ${namedFile('a/old.ts')}`;
    assert.deepStrictEqual(tip(moved), {
      'data-tip': 'Moved from a/old.ts',
      'data-tip-said': JSON.stringify(moved),
    });
    assert.deepStrictEqual(tip('C:\\Code', { at: 'over', cut: true }), {
      'data-tip': 'C:\\Code',
      'data-tip-at': 'over',
      'data-tip-cut': '',
    });
  });

  test('tells rows of a name and its values under its words, as the button of the preview of a file viewed lists the kinds of file it previews, and reads them back, only where they are given', () => {
    const rows = [
      { name: 'Markdown', values: '.md .markdown' },
      { name: 'PDF', values: '.pdf' },
    ];
    const told = tip('Preview', {
      rows,
    });

    assert.deepStrictEqual(told, {
      'data-tip': 'Preview',
      'data-tip-rows': JSON.stringify(rows),
    });
    assert.deepStrictEqual(tipOf(element(told, 'button')), {
      said: 'Preview',
      at: 'below-center',
      cut: false,
      rows,
    });
    assert.deepStrictEqual(
      tipOf(element({ ...tip('Preview'), 'data-tip-rows': '[{"name":1}]' })),
      { said: 'Preview', at: 'below', cut: false },
    );
  });

  test('is none for nothing to say, so an element with no tooltip has no attribute of one', () => {
    assert.deepStrictEqual(
      [tip(undefined), tip(''), tip(false), tip([])],
      [{}, {}, {}, {}],
    );
    assert.strictEqual(tipOf(element({})), undefined);
    assert.strictEqual(tipOf(element({ 'data-tip': '' })), undefined);
  });

  test('names a button that shows an icon alone, as its tooltip is the only words it has, to a screen reader and to whoever looks for it by its name', () => {
    assert.deepStrictEqual(labelTip('Close'), {
      'aria-label': 'Close',
      'data-tip': 'Close',
    });
    assert.deepStrictEqual([labelTip(undefined), labelTip('')], [{}, {}]);
  });

  test('is read back from its element as it was told, below its element where no place is asked for, shown whether cut or not, and the element found by its attribute', () => {
    const moved = sentence`Moved from ${namedFile('a/old.ts')}`;
    assert.deepStrictEqual(
      tipOf(element({ ...tip(moved, { at: 'above-end' }) })),
      {
        said: moved,
        at: 'above-end',
        cut: false,
      },
    );
    assert.deepStrictEqual(
      tipOf(element({ ...tip('src/a.ts', { cut: true }) })),
      { said: 'src/a.ts', at: 'below', cut: true },
    );
    assert.strictEqual(element({ ...tip('Wrap') }).matches(tipped), true);
  });

  test('is centered below a button, whose words or icon it explains, and starts where anything else starts, a row or a path, unless its owner says where', () => {
    assert.deepStrictEqual(
      [
        tipOf(element({ ...labelTip('Wrap') }, 'button'))?.at,
        tipOf(element({ ...tip('Encoding') }, 'button'))?.at,
        tipOf(element({ ...tip('src/a.ts') }, 'div'))?.at,
        tipOf(element({ ...tip('Wrap', { at: 'above' }) }, 'button'))?.at,
      ],
      ['below-center', 'below-center', 'below', 'above'],
    );
  });

  test('takes a sentence it can not read, or a place it does not know, for its plain words below its element, as a Markdown file brings titles of its own and the page trusts none of them', () => {
    for (const said of [
      '{',
      '[1]',
      '[{"name":1}]',
      '[{"name":"a","path":"x"}]',
    ]) {
      assert.deepStrictEqual(
        tipOf(
          element({
            'data-tip': 'plain',
            'data-tip-said': said,
            'data-tip-at': 'sideways',
          }),
        ),
        { said: 'plain', at: 'below', cut: false },
        said,
      );
    }
  });
});
