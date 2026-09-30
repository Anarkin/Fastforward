import * as assert from 'node:assert';
import {
  noFolders,
  openFolders,
  shownFolders,
  toggleFolder,
} from '../webview/viewFolders';

suite('View folders', () => {
  test('keeps the folders toggled while the view stays', () => {
    const state = toggleFolder(
      toggleFolder(noFolders, 'one', 'open', 'src'),
      'one',
      'closed',
      'docs',
    );
    assert.deepStrictEqual([...shownFolders(state, 'one').open], ['src']);
    assert.deepStrictEqual([...shownFolders(state, 'one').closed], ['docs']);
  });

  test('starts over in another view, and on coming back', () => {
    const state = toggleFolder(noFolders, 'one', 'closed', 'src');
    assert.deepStrictEqual([...shownFolders(state, 'two').closed], []);
    const elsewhere = toggleFolder(state, 'two', 'open', 'lib');
    assert.deepStrictEqual([...shownFolders(elsewhere, 'one').closed], []);
    assert.deepStrictEqual([...shownFolders(elsewhere, 'two').open], ['lib']);
  });

  test('closes an open folder when toggled again', () => {
    const state = toggleFolder(
      toggleFolder(noFolders, 'one', 'open', 'src'),
      'one',
      'open',
      'src',
    );
    assert.deepStrictEqual([...shownFolders(state, 'one').open], []);
  });

  test("opens a selected file's folders, keeping the state when they are open", () => {
    const state = openFolders(
      toggleFolder(noFolders, 'one', 'closed', 'lib'),
      'one',
      ['src', 'src/app'],
    );
    assert.deepStrictEqual(
      [...shownFolders(state, 'one').open],
      ['src', 'src/app'],
    );
    assert.deepStrictEqual([...shownFolders(state, 'one').closed], ['lib']);
    assert.strictEqual(openFolders(state, 'one', ['src']), state);
  });
});
