import * as assert from 'node:assert';
import { toggleComment } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { suite, test } from 'vitest';
import { commentsOf } from '../../../../../tools/editor/page/comments';

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
  test('comments a line out and back in with the marker of its language, and leaves a language it knows no marker of alone', () => {
    assert.strictEqual(commented('typescript', 'let a;'), '// let a;');
    assert.strictEqual(commented('python', 'a = 1'), '# a = 1');
    assert.strictEqual(commented('typescript', '// let a;'), 'let a;');
    assert.strictEqual(commented('html', '<b>'), '<!-- <b> -->');
    assert.strictEqual(commented('bat', 'echo'), 'REM echo');
    assert.strictEqual(commented('no-such-language', 'a'), undefined);
  });
});
