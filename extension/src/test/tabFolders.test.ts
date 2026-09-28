import * as assert from 'node:assert';
import {
  foldersOfTab,
  openFolders,
  toggleFolder,
  type FoldersByTab,
} from '../webview/tabFolders';

const none: FoldersByTab = new Map();

suite('Tab folders', () => {
  test('keeps each tab its own open and closed folders', () => {
    let all = toggleFolder(none, 'one', 'open', 'src');
    all = toggleFolder(all, 'two', 'closed', 'docs');
    assert.deepStrictEqual([...foldersOfTab(all, 'one').open], ['src']);
    assert.deepStrictEqual([...foldersOfTab(all, 'one').closed], []);
    assert.deepStrictEqual([...foldersOfTab(all, 'two').closed], ['docs']);
    assert.deepStrictEqual([...foldersOfTab(all, 'two').open], []);
  });

  test('closes an open folder when toggled again', () => {
    const all = toggleFolder(
      toggleFolder(none, 'one', 'open', 'src'),
      'one',
      'open',
      'src',
    );
    assert.deepStrictEqual([...foldersOfTab(all, 'one').open], []);
  });

  test("opens a selected file's folders, keeping the map when open", () => {
    const all = openFolders(none, 'one', ['src', 'src/app']);
    assert.deepStrictEqual(
      [...foldersOfTab(all, 'one').open],
      ['src', 'src/app'],
    );
    assert.strictEqual(openFolders(all, 'one', ['src']), all);
  });

  test('changes nothing without a tab', () => {
    assert.strictEqual(toggleFolder(none, undefined, 'open', 'src'), none);
    assert.strictEqual(openFolders(none, undefined, ['src']), none);
  });
});
