import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { EditorState } from '@codemirror/state';
import { shown } from './storeFixtures';

const keptOf = (text: string) => ({
  state: EditorState.create({ doc: text }),
  version: 0,
});

suite('Editor actions', () => {
  test('keeps the editor of each tab apart, for when its tab shows again', () => {
    const { store } = shown();
    const first = keptOf('first');
    const second = keptOf('second');
    store.getState().editorKeeper('3')(first);
    store.getState().editorKeeper('4')(second);
    assert.strictEqual(store.getState().keptEditor('3'), first);
    assert.strictEqual(store.getState().keptEditor('4'), second);
  });

  test('keeps nothing for a tab once it closed, not even from a keeper made while it was open, as an editor unmounting after the close keeps its state, and a tab opened later takes the id', () => {
    const { store } = shown();
    const keepClosed = store.getState().editorKeeper('3');
    keepClosed(keptOf('closed'));
    store.getState().receive({ type: 'closed', tab: '3' });
    assert.strictEqual(store.getState().keptEditor('3'), undefined);
    keepClosed(keptOf('closed'));
    assert.strictEqual(store.getState().keptEditor('3'), undefined);
    const reopened = keptOf('reopened');
    store.getState().editorKeeper('3')(reopened);
    keepClosed(keptOf('closed'));
    assert.strictEqual(store.getState().keptEditor('3'), reopened);
  });

  test('keeps the editors of the other tabs as one tab closes', () => {
    const { store } = shown();
    const other = keptOf('other');
    store.getState().editorKeeper('4')(other);
    store.getState().receive({ type: 'closed', tab: '3' });
    assert.strictEqual(store.getState().keptEditor('4'), other);
  });

  test('keeps a question about saving a file for its tab until it is answered, whether or not an editor of the tab shows then, as a question asked while the tab was left was lost and the file never saved, and forgets it once the tab closes', () => {
    const { store } = shown();
    store.getState().receive({ type: 'askChangedOnDisk', tab: '3' });
    store.getState().receive({ type: 'askOverwrite', tab: '4' });
    assert.deepStrictEqual(
      [...store.getState().editorAsks],
      [
        ['3', 'changed'],
        ['4', 'overwrite'],
      ],
    );
    store.getState().answerEditorAsk('3');
    assert.deepStrictEqual(
      [...store.getState().editorAsks],
      [['4', 'overwrite']],
    );
    store.getState().receive({ type: 'closed', tab: '4' });
    assert.strictEqual(store.getState().editorAsks.size, 0);
  });
});
