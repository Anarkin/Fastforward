import * as assert from 'node:assert';
import { keymap } from '../shared/keymap';
import { keyPressed } from '../webview/shortcuts';
import { adjacentTab } from '../webview/tabBar';
import { adjacentWorktree } from '../webview/worktreeBar';
import { element } from './fixtures';

type KeyEvent = Parameters<typeof keyPressed>[1];

const keyEvent = (key: string, extra: Partial<KeyEvent> = {}): KeyEvent => ({
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

const ctrlTab = keyEvent('Tab', { ctrlKey: true });

const shortcuts = (key: string, extra: Partial<KeyEvent> = {}) =>
  keyPressed(keymap.shortcuts, keyEvent(key, extra)) === true;

const repositoryStep = (extra: Partial<KeyEvent>) =>
  keyPressed(keymap.repository, { ...ctrlTab, ...extra });

const worktreeStep = (extra: Partial<KeyEvent>) =>
  keyPressed(keymap.worktree, { ...ctrlTab, key: 'PageDown', ...extra });

const opensRepository = (extra: Partial<KeyEvent>) =>
  keyPressed(keymap.openRepository, {
    ...ctrlTab,
    key: 't',
    code: 'KeyT',
    ...extra,
  });

const letters = [
  [keymap.commits, 'c'],
  [keymap.search, 's'],
  [keymap.wrap, 'w'],
  [keymap.head, 'h'],
  [keymap.upstream, 'u'],
] as const;

suite('Keyboard shortcuts', () => {
  test('matches a key pressed on its own', () => {
    for (const [binding, letter] of letters) {
      assert.strictEqual(keyPressed(binding, keyEvent(letter)), true, letter);
    }
    assert.strictEqual(keyPressed(keymap.commits, keyEvent('x')), undefined);
  });

  test('matches a letter with Caps Lock on', () => {
    for (const [binding, letter] of letters) {
      assert.strictEqual(
        keyPressed(binding, keyEvent(letter.toUpperCase())),
        true,
        letter,
      );
    }
  });

  test('matches the physical key on a non-Latin layout', () => {
    for (const [binding, key, code] of [
      [keymap.commits, 'с', 'KeyC'],
      [keymap.search, 'ы', 'KeyS'],
      [keymap.wrap, 'ц', 'KeyW'],
      [keymap.head, 'р', 'KeyH'],
      [keymap.upstream, 'г', 'KeyU'],
    ] as const) {
      assert.strictEqual(keyPressed(binding, keyEvent(key, { code })), true);
    }
    assert.strictEqual(
      keyPressed(keymap.commits, keyEvent('j', { code: 'KeyC' })),
      undefined,
    );
  });

  test('leaves keys with modifiers, repeats and handled keys alone', () => {
    for (const extra of [
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { shiftKey: true },
      { repeat: true },
      { defaultPrevented: true },
    ]) {
      assert.strictEqual(
        keyPressed(keymap.commits, keyEvent('c', extra)),
        undefined,
        JSON.stringify(extra),
      );
    }
    assert.strictEqual(
      keyPressed(keymap.search, keyEvent('s', { ctrlKey: true })),
      undefined,
    );
  });

  test('shows the shortcuts on F1, even in a field, or on ? outside one', () => {
    assert.ok(shortcuts('F1'));
    assert.ok(shortcuts('F1', { target: element('INPUT') }));
    assert.ok(shortcuts('?', { shiftKey: true }));
    assert.ok(!shortcuts('?', { shiftKey: true, target: element('INPUT') }));
    assert.ok(!shortcuts('F1', { ctrlKey: true }));
    assert.ok(!shortcuts('F1', { shiftKey: true }));
    assert.ok(!shortcuts('?', { altKey: true }));
    assert.ok(!shortcuts('F1', { repeat: true }));
    assert.ok(!shortcuts('F2'));
  });

  test('leaves keys typed into a field to the field', () => {
    for (const target of [
      element('INPUT'),
      element('TEXTAREA'),
      element('SELECT'),
      element('DIV', true),
    ]) {
      assert.strictEqual(
        keyPressed(keymap.commits, keyEvent('c', { target })),
        undefined,
      );
    }
    assert.strictEqual(
      keyPressed(keymap.commits, keyEvent('c', { target: element('BUTTON') })),
      true,
    );
  });
});

suite('Switching tabs', () => {
  const key = ctrlTab;
  const tabs = ['a', 'b', 'c'].map((name) => ({ root: `/${name}`, name }));

  test('goes to the next tab on Ctrl+Tab, and the previous on Ctrl+Shift+Tab', () => {
    assert.strictEqual(repositoryStep({}), 1);
    assert.strictEqual(repositoryStep({ shiftKey: true }), -1);
    assert.strictEqual(repositoryStep({ ctrlKey: false }), undefined);
    assert.strictEqual(repositoryStep({ altKey: true }), undefined);
    assert.strictEqual(repositoryStep({ metaKey: true }), undefined);
    assert.strictEqual(repositoryStep({ key: 'q' }), undefined);
  });

  test('goes to the next worktree on Ctrl+PageDown, and the previous on Ctrl+PageUp', () => {
    assert.strictEqual(worktreeStep({}), 1);
    assert.strictEqual(worktreeStep({ key: 'PageUp' }), -1);
    assert.strictEqual(worktreeStep({ ctrlKey: false }), undefined);
    assert.strictEqual(worktreeStep({ shiftKey: true }), undefined);
    assert.strictEqual(worktreeStep({ altKey: true }), undefined);
    assert.strictEqual(worktreeStep({ metaKey: true }), undefined);
    assert.strictEqual(worktreeStep({ key: 'Tab' }), undefined);
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
    assert.strictEqual(keyPressed(keymap.find, dvorak), undefined);
    assert.strictEqual(
      keyPressed(keymap.find, { ...dvorak, key: 'f', code: 'KeyY' }),
      true,
    );
    assert.strictEqual(
      keyPressed(keymap.openRepository, { ...dvorak, key: 'y', code: 'KeyT' }),
      undefined,
    );
    assert.strictEqual(
      keyPressed(keymap.openRepository, { ...dvorak, key: 't', code: 'KeyK' }),
      true,
    );
    assert.strictEqual(
      keyPressed(keymap.change, keyEvent('h', { code: 'KeyJ' })),
      undefined,
    );
    assert.strictEqual(
      keyPressed(keymap.change, keyEvent('j', { code: 'KeyC' })),
      1,
    );
    assert.strictEqual(
      keyPressed(keymap.change, keyEvent('л', { code: 'KeyK' })),
      -1,
    );
  });

  test('opens a repository on Ctrl+T, or Cmd+T, whatever the keyboard layout', () => {
    assert.strictEqual(opensRepository({}), true);
    assert.strictEqual(
      opensRepository({ ctrlKey: false, metaKey: true }),
      true,
    );
    assert.strictEqual(opensRepository({ key: 'е' }), true);
    assert.strictEqual(opensRepository({ ctrlKey: false }), undefined);
    assert.strictEqual(opensRepository({ shiftKey: true }), undefined);
  });
});
