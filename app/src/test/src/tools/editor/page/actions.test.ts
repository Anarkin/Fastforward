import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { EditorState } from '@codemirror/state';
import { createEditorStore } from '../../../../../tools/editor/page/store';
import { noop } from '../../../../helpers/fixtures';
import { languageShown } from '../../../../../tools/editor/page/state';

const shown = () => ({ store: createEditorStore(noop) });

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
      [...store.getState().asks],
      [
        ['3', 'changed'],
        ['4', 'overwrite'],
      ],
    );
    store.getState().answerEditorAsk('3');
    assert.deepStrictEqual([...store.getState().asks], [['4', 'overwrite']]);
    store.getState().receive({ type: 'closed', tab: '4' });
    assert.strictEqual(store.getState().asks.size, 0);
  });

  test('keeps the language each editing tab was chosen to color its file in while another tab is shown, for when it is shown again, and forgets it once the tab is closed, as a tab opened later can take its id', () => {
    const { store } = shown();
    const { receive, chooseLanguage } = store.getState();
    receive({ type: 'show', tab: '3', file: '/work/notes.md' });
    assert.strictEqual(languageShown(store.getState()), undefined);
    chooseLanguage('json');
    chooseLanguage('python');
    assert.strictEqual(languageShown(store.getState()), 'python');
    receive({ type: 'show', tab: '4', file: '/work/a.md' });
    assert.strictEqual(languageShown(store.getState()), undefined);
    receive({ type: 'hide' });
    receive({ type: 'show', tab: '3', file: '/work/notes.md' });
    assert.strictEqual(languageShown(store.getState()), 'python');
    receive({ type: 'closed', tab: '3' });
    receive({ type: 'show', tab: '3', file: '/work/b.md' });
    assert.strictEqual(languageShown(store.getState()), undefined);
  });

  test('closes brackets as they are typed once the settings say so, and stops once they no longer do', () => {
    const { store } = shown();
    assert.strictEqual(store.getState().closeBrackets, false);
    store.getState().receive({ type: 'settings', closeBrackets: true });
    assert.strictEqual(store.getState().closeBrackets, true);
    store.getState().receive({ type: 'settings', closeBrackets: false });
    assert.strictEqual(store.getState().closeBrackets, false);
  });
});
