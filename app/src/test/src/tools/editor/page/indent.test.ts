import * as assert from 'node:assert';
import { Text } from '@codemirror/state';
import { suite, test } from 'vitest';
import { detectedIndent } from '../../../../../tools/editor/page/indent';

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
});
