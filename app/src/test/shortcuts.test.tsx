import * as assert from 'node:assert';
import {
  changeStep,
  handleShortcut,
  isFindShortcut,
  isNewTabShortcut,
  shortcutOf,
  tabStep,
  worktreeStep,
} from '../webview/shortcuts';
import { adjacentTab, tabBarKey } from '../webview/tabBar';
import { adjacentWorktree } from '../webview/worktreeBar';
import { element } from './fixtures';

const keyEvent = (
  key: string,
  extra: Partial<Parameters<typeof shortcutOf>[0]> = {},
) => ({
  key,
  code: '',
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  repeat: false,
  defaultPrevented: false,
  target: null,
  ...extra,
});

const press = (
  key: string,
  extra: Partial<Parameters<typeof shortcutOf>[0]> = {},
) => shortcutOf(keyEvent(key, extra));

suite('Keyboard shortcuts', () => {
  test('matches a key pressed on its own', () => {
    assert.strictEqual(press('c'), 'c');
    assert.strictEqual(press('s'), 's');
    assert.strictEqual(press('w'), 'w');
    assert.strictEqual(press('h'), 'h');
    assert.strictEqual(press('u'), 'u');
    assert.strictEqual(press('x'), undefined);
  });

  test('matches a letter with Caps Lock on', () => {
    assert.strictEqual(press('C'), 'c');
    assert.strictEqual(press('S'), 's');
    assert.strictEqual(press('W'), 'w');
    assert.strictEqual(press('H'), 'h');
    assert.strictEqual(press('U'), 'u');
  });

  test('matches the physical key on a non-Latin layout', () => {
    assert.strictEqual(press('с', { code: 'KeyC' }), 'c');
    assert.strictEqual(press('ы', { code: 'KeyS' }), 's');
    assert.strictEqual(press('ц', { code: 'KeyW' }), 'w');
    assert.strictEqual(press('р', { code: 'KeyH' }), 'h');
    assert.strictEqual(press('г', { code: 'KeyU' }), 'u');
    assert.strictEqual(press('j', { code: 'KeyC' }), undefined);
  });

  test('leaves a shortcut it has no action for to the other handlers', () => {
    let called = 0;
    let prevented = 0;
    const handle = (key: string) =>
      handleShortcut(
        { ...keyEvent(key), preventDefault: () => prevented++ },
        { c: () => called++ },
      );
    handle('s');
    assert.deepStrictEqual([called, prevented], [0, 0]);
    handle('c');
    assert.deepStrictEqual([called, prevented], [1, 1]);
  });

  test('leaves keys with modifiers, repeats and handled keys alone', () => {
    assert.strictEqual(press('c', { ctrlKey: true }), undefined);
    assert.strictEqual(press('s', { ctrlKey: true }), undefined);
    assert.strictEqual(press('c', { altKey: true }), undefined);
    assert.strictEqual(press('c', { metaKey: true }), undefined);
    assert.strictEqual(press('c', { shiftKey: true }), undefined);
    assert.strictEqual(press('c', { repeat: true }), undefined);
    assert.strictEqual(press('c', { defaultPrevented: true }), undefined);
  });

  test('leaves keys typed into a field to the field', () => {
    assert.strictEqual(press('c', { target: element('INPUT') }), undefined);
    assert.strictEqual(press('c', { target: element('TEXTAREA') }), undefined);
    assert.strictEqual(press('c', { target: element('SELECT') }), undefined);
    assert.strictEqual(press('c', { target: element('DIV', true) }), undefined);
    assert.strictEqual(press('c', { target: element('BUTTON') }), 'c');
  });
});

suite('Switching tabs', () => {
  const key = {
    key: 'Tab',
    ctrlKey: true,
    shiftKey: false,
    altKey: false,
    metaKey: false,
  };
  const tabs = ['a', 'b', 'c'].map((name) => ({ root: `/${name}`, name }));

  test('goes to the next tab on Ctrl+Tab, and the previous on Ctrl+Shift+Tab', () => {
    assert.strictEqual(tabStep(key), 1);
    assert.strictEqual(tabStep({ ...key, shiftKey: true }), -1);
    assert.strictEqual(tabStep({ ...key, ctrlKey: false }), undefined);
    assert.strictEqual(tabStep({ ...key, altKey: true }), undefined);
    assert.strictEqual(tabStep({ ...key, metaKey: true }), undefined);
    assert.strictEqual(tabStep({ ...key, key: 'q' }), undefined);
  });

  test('goes to the next worktree on Ctrl+PageDown, and the previous on Ctrl+PageUp', () => {
    const pageDown = { ...key, key: 'PageDown' };
    assert.strictEqual(worktreeStep(pageDown), 1);
    assert.strictEqual(worktreeStep({ ...pageDown, key: 'PageUp' }), -1);
    assert.strictEqual(
      worktreeStep({ ...pageDown, ctrlKey: false }),
      undefined,
    );
    assert.strictEqual(
      worktreeStep({ ...pageDown, shiftKey: true }),
      undefined,
    );
    assert.strictEqual(worktreeStep({ ...pageDown, altKey: true }), undefined);
    assert.strictEqual(worktreeStep({ ...pageDown, metaKey: true }), undefined);
    assert.strictEqual(worktreeStep(key), undefined);
  });

  test('skips the worktrees whose folder is missing', () => {
    const worktrees = [
      { root: '/a', name: 'main', folder: 'a', main: true, missing: false },
      { root: '/b', name: 'gone', folder: 'b', main: false, missing: true },
      { root: '/c', name: 'feature', folder: 'c', main: false, missing: false },
    ];
    assert.strictEqual(adjacentWorktree(worktrees, '/a', 1), '/c');
    assert.strictEqual(adjacentWorktree(worktrees, '/a', -1), '/c');
    assert.strictEqual(adjacentWorktree(worktrees, '/b', 1), '/c');
    assert.strictEqual(
      adjacentWorktree(worktrees.slice(0, 2), '/a', 1),
      undefined,
    );
  });

  test('wraps around at either end, and stays put with one tab', () => {
    assert.strictEqual(adjacentTab(tabs, '/a', 1), '/b');
    assert.strictEqual(adjacentTab(tabs, '/c', 1), '/a');
    assert.strictEqual(adjacentTab(tabs, '/a', -1), '/c');
    assert.strictEqual(adjacentTab(tabs, undefined, 1), '/a');
    assert.strictEqual(adjacentTab(tabs.slice(0, 1), '/a', 1), undefined);
  });

  test('takes the letter typed, not the key pressed, on another Latin layout', () => {
    const dvorak = { ...key, key: 'u', code: 'KeyF' };
    assert.ok(!isFindShortcut(dvorak));
    assert.ok(isFindShortcut({ ...dvorak, key: 'f', code: 'KeyY' }));
    assert.ok(!isNewTabShortcut({ ...dvorak, key: 'y', code: 'KeyT' }));
    assert.ok(isNewTabShortcut({ ...dvorak, key: 't', code: 'KeyK' }));
    assert.strictEqual(changeStep({ key: 'h', code: 'KeyJ' }), undefined);
    assert.strictEqual(changeStep({ key: 'j', code: 'KeyC' }), 1);
    assert.strictEqual(changeStep({ key: 'л', code: 'KeyK' }), -1);
  });

  test('opens a repository on Ctrl+T, or Cmd+T, whatever the keyboard layout', () => {
    const newTab = { ...key, key: 't', code: 'KeyT' };
    assert.ok(isNewTabShortcut(newTab));
    assert.ok(isNewTabShortcut({ ...newTab, ctrlKey: false, metaKey: true }));
    assert.ok(isNewTabShortcut({ ...newTab, key: 'е' }));
    assert.ok(!isNewTabShortcut({ ...newTab, ctrlKey: false }));
    assert.ok(!isNewTabShortcut({ ...newTab, shiftKey: true }));
  });

  test('opens a repository or picks the tab a key asks for, and nothing for other keys', () => {
    assert.deepStrictEqual(
      tabBarKey({ ...key, key: 't', code: 'KeyT' }, tabs, '/a'),
      { kind: 'add' },
    );
    assert.deepStrictEqual(tabBarKey({ ...key, code: 'Tab' }, tabs, '/a'), {
      kind: 'select',
      root: '/b',
    });
    assert.deepStrictEqual(
      tabBarKey({ ...key, code: 'Tab', shiftKey: true }, tabs, '/a'),
      { kind: 'select', root: '/c' },
    );
    assert.strictEqual(
      tabBarKey({ ...key, key: 'x', code: 'KeyX' }, tabs, '/a'),
      undefined,
    );
  });
});
