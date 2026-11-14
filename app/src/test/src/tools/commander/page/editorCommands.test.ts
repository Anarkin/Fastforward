import * as assert from 'node:assert';
import { toggleComment } from '@codemirror/commands';
import { EditorState, Text } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  commentsOf,
  detectedIndent,
} from '../../../../../tools/commander/page/editorCommands';

const doc = (...lines: string[]) => Text.of(lines);

function commented(language: string, text: string): string | undefined {
  let state = EditorState.create({
    doc: text,
    extensions: commentsOf(language),
  });
  const done = toggleComment({
    state,
    dispatch: (transaction) => {
      state = transaction.state;
    },
  });
  return done ? state.doc.toString() : undefined;
}

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

  test('comments a line out and back in with the marker of its language, and leaves a language it knows no marker of alone', () => {
    assert.strictEqual(commented('typescript', 'let a;'), '// let a;');
    assert.strictEqual(commented('python', 'a = 1'), '# a = 1');
    assert.strictEqual(commented('typescript', '// let a;'), 'let a;');
    assert.strictEqual(commented('html', '<b>'), '<!-- <b> -->');
    assert.strictEqual(commented('bat', 'echo'), 'REM echo');
    assert.strictEqual(commented('no-such-language', 'a'), undefined);
  });
});
