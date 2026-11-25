import * as assert from 'node:assert';
import { EditorState, Text } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  detectedIndent,
  drawnTabSize,
  indentField,
  indentShownOf,
  indentionOf,
  setIndent,
  setTabSize,
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

  test('indents a file with no indented lines by four spaces, as the viewer draws a tab', () => {
    assert.strictEqual(detectedIndent(doc('a', 'b', '', 'c')), '    ');
  });

  test('draws a tab as wide as the width chosen for its tab, else as its .editorconfig asks, else leaves it to the settings', () => {
    const asked = EditorState.create({
      extensions: indentionOf(doc('a'), {
        tabSize: { size: 8, key: 'tab_width' },
      }),
    });
    const unasked = EditorState.create({
      extensions: indentionOf(doc('a'), {}),
    });
    const chosen = asked.update({ effects: setTabSize.of(2) }).state;
    const unchosen = chosen.update({ effects: setTabSize.of(undefined) }).state;
    assert.deepStrictEqual(
      [asked, unasked, chosen, unchosen].map(drawnTabSize),
      [8, undefined, 2, 8],
    );
  });

  test('tells the indent unit, where it came from and what the lines of the file showed as it opened, and takes another once the indentation is converted', () => {
    const opened = EditorState.create({
      doc: doc('a', '  b', '    c').toString(),
      extensions: indentionOf(doc('a', '  b', '    c'), {
        indentFile: 'x/.editorconfig',
        fallbackIndent: '\t',
      }),
    });
    const converted = opened.update({ effects: setIndent.of('\t') }).state;
    assert.deepStrictEqual(
      [indentShownOf(opened), indentShownOf(converted)],
      [
        {
          indent: '  ',
          converted: false,
          lines: '  ',
          rules: { indentFile: 'x/.editorconfig', fallbackIndent: '\t' },
          chosenTabSize: undefined,
        },
        {
          indent: '\t',
          converted: true,
          lines: '  ',
          rules: { indentFile: 'x/.editorconfig', fallbackIndent: '\t' },
          chosenTabSize: undefined,
        },
      ],
    );
    assert.strictEqual(converted.field(indentField), '\t');
    assert.deepStrictEqual(
      [shownIndent(doc('a', 'b')), shownIndent(doc('a', '\tb'))],
      [undefined, '\t'],
    );
  });
});
