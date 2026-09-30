import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShortcutsPanel } from '../webview/shortcutsHelp';
import { shortcutOf, shortcuts } from '../webview/shortcuts';
import { definitions } from './fixtures';

const press = (
  key: string,
  extra: Partial<Parameters<typeof shortcutOf>[0]> = {},
) =>
  shortcutOf({
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    defaultPrevented: false,
    target: null,
    ...extra,
  })?.id;

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
    assert.strictEqual(press('C', { shiftKey: true }), undefined);
  });

  test('matches a letter with Caps Lock on', () => {
    assert.strictEqual(press('C'), 'c');
    assert.strictEqual(press('S'), 's');
  });

  test("leaves VS Code's keys, repeats and handled keys alone", () => {
    assert.strictEqual(press('c', { ctrlKey: true }), undefined);
    assert.strictEqual(press('s', { ctrlKey: true }), undefined);
    assert.strictEqual(press('c', { altKey: true }), undefined);
    assert.strictEqual(press('c', { metaKey: true }), undefined);
    assert.strictEqual(press('c', { repeat: true }), undefined);
    assert.strictEqual(press('c', { defaultPrevented: true }), undefined);
  });

  test('leaves keys typed into a field to the field', () => {
    assert.strictEqual(press('c', { target: element('INPUT') }), undefined);
    assert.strictEqual(press('c', { target: element('TEXTAREA') }), undefined);
    assert.strictEqual(press('c', { target: element('DIV', true) }), undefined);
    assert.strictEqual(press('c', { target: element('BUTTON') }), 'c');
  });

  test('lists every shortcut in the panel', () => {
    const html = renderToStaticMarkup(
      <ShortcutsPanel
        container={{ current: null }}
        onClose={() => {}}
        dismissable
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
