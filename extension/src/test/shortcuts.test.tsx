import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { templateOf } from '../webview/columns';
import { ShortcutsPanel } from '../webview/navBar';
import { shortcutOf } from '../webview/shortcuts';

const press = (
  key: string,
  extra: Partial<Parameters<typeof shortcutOf>[0]> = {},
) =>
  shortcutOf({
    key,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    defaultPrevented: false,
    target: null,
    ...extra,
  })?.id;

// What a key press's target is to the shortcuts, without a page to make one
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
    assert.strictEqual(press('i'), 'i');
    assert.strictEqual(press('x'), undefined);
    // Shift makes it another key
    assert.strictEqual(press('C'), undefined);
  });

  test("leaves VS Code's keys, repeats and handled keys alone", () => {
    assert.strictEqual(press('c', { ctrlKey: true }), undefined);
    assert.strictEqual(press('l', { ctrlKey: true, altKey: true }), undefined);
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

  test('takes Ctrl shortcuts only with Ctrl, also while typing', () => {
    assert.strictEqual(press('l', { ctrlKey: true }), 'ctrl+l');
    assert.strictEqual(press('l'), undefined);
    assert.strictEqual(
      press('l', { ctrlKey: true, target: element('INPUT') }),
      'ctrl+l',
    );
  });

  test('lists every shortcut in the panel', () => {
    const html = renderToStaticMarkup(
      <ShortcutsPanel container={{ current: null }} onClose={() => {}}>
        ?
      </ShortcutsPanel>,
    );
    assert.match(
      html,
      /<dt><kbd>C<\/kbd><\/dt><dd>Show or hide the commit list<\/dd>/,
    );
    assert.match(html, /<dt><kbd>Ctrl<\/kbd>\+<kbd>L<\/kbd><\/dt><dd>Search/);
  });

  test('gives a hidden column no width, keeping the others', () => {
    assert.strictEqual(
      templateOf([460, 300], [true, false]),
      '0px 300px minmax(240px, 1fr)',
    );
    assert.strictEqual(
      templateOf([460, 300], [false, false]),
      '460px 300px minmax(240px, 1fr)',
    );
  });
});
