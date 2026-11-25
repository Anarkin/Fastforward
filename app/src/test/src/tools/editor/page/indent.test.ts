import * as assert from 'node:assert';
import { EditorState, Text } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  detectedIndent,
  setTabSize,
  tabSizeField,
  tabSizeFrom,
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

  test('draws a tab as wide as the file asks, by its .editorconfig, until another width is chosen for it, and leaves it to the settings where the file asks for none', () => {
    const asked = EditorState.create({
      extensions: tabSizeFrom({ tabSize: { size: 8 } }),
    });
    const unasked = EditorState.create({ extensions: tabSizeFrom({}) });
    const chosen = asked.update({ effects: setTabSize.of(2) }).state;
    assert.deepStrictEqual(
      [
        asked.field(tabSizeField),
        unasked.field(tabSizeField),
        chosen.field(tabSizeField),
      ],
      [8, undefined, 2],
    );
  });
});
