import * as assert from 'node:assert';
import { EditorState, Text } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  detectedIndent,
  drawnTabSize,
  indentField,
  indentShownOf,
  indentionOf,
  shownIndent,
} from '../../../../../tools/editor/page/indent';

const doc = (...lines: string[]) => Text.of(lines);

suite('Commands of the editor', () => {
  test('indents as the file is indented, with tabs where most indented lines start with one, and otherwise by the step its lines are most often indented by', () => {
    assert.strictEqual(detectedIndent(doc('a', '\tb', '\t\tc', '  d')), '\t');
    assert.strictEqual(
      detectedIndent(doc('a', '  b', '    c', '  d', 'e')),
      '  ',
    );
    assert.strictEqual(
      detectedIndent(doc('a', '    b', '        c', '    d')),
      '    ',
    );
  });

  test('takes tabs only where more indented lines start with a tab than with a space, spaces on a tie, a line starting with a tab and then spaces counted as one with a tab', () => {
    const tab = String.fromCharCode(9);
    assert.deepStrictEqual(
      [
        shownIndent(doc('a', tab + 'b', '  c')),
        shownIndent(doc('a', tab + 'b', tab + tab + 'c', '  d')),
        shownIndent(doc('a', tab + '  b', tab + '  c', '  d')),
      ],
      ['  ', tab, tab],
    );
  });

  test('takes the step between the indentation of one line and the next seen most often, the smaller on a tie', () => {
    assert.deepStrictEqual(
      [
        shownIndent(doc('a', '  b', '    c', '  d', '      e')),
        shownIndent(doc('a', '  b', '    c', '        d', '            e')),
        shownIndent(doc('a', '   b', '      c')),
      ],
      ['  ', '  ', '   '],
    );
  });

  test('leaves out steps of one column, as aligning a comment, and steps of more than eight, as continuing a long line, and has nothing to say where only those are', () => {
    assert.deepStrictEqual(
      [
        shownIndent(doc('/**', ' * a', ' */', 'b')),
        shownIndent(doc('a', '            b', 'c')),
        shownIndent(
          doc(
            'class A {',
            '    /**',
            '     * b',
            '     */',
            '    c() {',
            '        d',
            '    }',
            '}',
          ),
        ),
      ],
      [undefined, undefined, '    '],
    );
  });

  test('skips blank lines and lines of whitespace alone, which tell no indentation and would break the steps between the lines around them', () => {
    assert.strictEqual(
      shownIndent(doc('a', '', '        ', '  b', '', '    c', '   ', '  d')),
      '  ',
    );
  });

  test('reads only the first ten thousand lines, so a huge file opens at once', () => {
    const tab = String.fromCharCode(9);
    const lines = [
      ...Array.from({ length: 10_000 }, (_, at) =>
        at % 2 === 0 ? 'a' : '  b',
      ),
      ...Array.from({ length: 20_000 }, () => tab + 'c'),
    ];
    assert.strictEqual(shownIndent(doc(...lines)), '  ');
  });

  test('indents a file with no indented lines by four spaces, as the viewer draws a tab', () => {
    assert.strictEqual(detectedIndent(doc('a', 'b', '', 'c')), '    ');
  });

  test('draws a tab as wide as its .editorconfig asks, else leaves it to the settings', () => {
    const asked = EditorState.create({
      extensions: indentionOf(doc('a'), {
        tabSize: { size: 8, key: 'tab_width' },
      }),
    });
    const unasked = EditorState.create({
      extensions: indentionOf(doc('a'), {}),
    });
    assert.deepStrictEqual([asked, unasked].map(drawnTabSize), [8, undefined]);
  });

  test('tells the indent unit, where it came from and what the lines of the file showed as it opened', () => {
    const opened = EditorState.create({
      doc: doc('a', '  b', '    c').toString(),
      extensions: indentionOf(doc('a', '  b', '    c'), {
        indentFile: 'x/.editorconfig',
        fallbackIndent: '\t',
      }),
    });
    assert.deepStrictEqual(indentShownOf(opened), {
      indent: '  ',
      lines: '  ',
      rules: { indentFile: 'x/.editorconfig', fallbackIndent: '\t' },
    });
    assert.deepStrictEqual(
      [shownIndent(doc('a', 'b')), shownIndent(doc('a', '\tb'))],
      [undefined, '\t'],
    );
  });

  test('indents as the .editorconfig of the file says over what its lines show, and as its lines show over the settings', () => {
    const lines = doc('a', '  b');
    const indentOf = (rules: Parameters<typeof indentionOf>[1]) =>
      EditorState.create({
        doc: lines.toString(),
        extensions: indentionOf(lines, rules),
      }).field(indentField);
    assert.deepStrictEqual(
      [
        indentOf({ indent: '\t', fallbackIndent: '    ' }),
        indentOf({ fallbackIndent: '\t' }),
      ],
      ['\t', '  '],
    );
  });
});
