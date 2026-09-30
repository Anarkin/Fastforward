import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { handleShortcut, shortcutOf, shortcuts } from '../webview/shortcuts';
import { ShortcutsPanel } from '../webview/shortcutsHelp';
import { definitions } from './fixtures';

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
) => shortcutOf(keyEvent(key, extra))?.key;

function element(tagName: string, isContentEditable = false): EventTarget {
  const target = {
    tagName,
    isContentEditable,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  return target;
}

suite('Keyboard shortcuts', () => {
  test('matches a key pressed on its own', () => {
    assert.strictEqual(press('c'), 'c');
    assert.strictEqual(press('s'), 's');
    assert.strictEqual(press('x'), undefined);
  });

  test('matches a letter with Caps Lock on', () => {
    assert.strictEqual(press('C'), 'c');
    assert.strictEqual(press('S'), 's');
  });

  test('matches the physical key on a non-Latin layout', () => {
    assert.strictEqual(press('с', { code: 'KeyC' }), 'c');
    assert.strictEqual(press('ы', { code: 'KeyS' }), 's');
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

  test("leaves VS Code's keys, repeats and handled keys alone", () => {
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

  test('lists every shortcut in the panel', () => {
    const html = renderToStaticMarkup(
      <ShortcutsPanel
        container={{ current: null }}
        onClose={() => {}}
        dismissible
      >
        ?
      </ShortcutsPanel>,
    );
    assert.deepStrictEqual(
      definitions(html),
      shortcuts.map((shortcut) => [
        shortcut.key.toUpperCase(),
        shortcut.description,
        '',
      ]),
    );
  });
});
