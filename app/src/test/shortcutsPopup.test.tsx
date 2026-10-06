import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { shortcutKeys } from '../webview/shortcuts';
import {
  keyLabel,
  shortcutGroups,
  ShortcutsPopup,
} from '../webview/shortcutsPopup';
import { tagsWith } from './fixtures';

const noop = () => undefined;

suite('Shortcuts popup', () => {
  test('lists every key that acts alone', () => {
    const alone = new Set(
      shortcutGroups.flatMap((group) =>
        group.entries.flatMap((entry) =>
          entry.keys.filter((keys) => keys.length === 1).map(([key]) => key),
        ),
      ),
    );
    for (const key of [...shortcutKeys, 'j', 'k']) {
      assert.ok(alone.has(key.toUpperCase()), key);
    }
  });

  test('names the command key Ctrl, or Cmd on macOS, but Ctrl where macOS keeps it', () => {
    assert.strictEqual(keyLabel('Mod', false), 'Ctrl');
    assert.strictEqual(keyLabel('Mod', true), '\u2318');
    assert.strictEqual(keyLabel('Ctrl', true), 'Ctrl');
    assert.strictEqual(keyLabel('H', true), 'H');
  });

  test('draws each group under its heading, every key in a key cap', () => {
    const html = renderToStaticMarkup(
      <ShortcutsPopup mac={false} onClose={noop} />,
    );
    assert.match(html, /role="dialog"/);
    assert.deepStrictEqual(
      tagsWith(html, 'shortcuts-heading').length,
      shortcutGroups.length,
    );
    const caps = shortcutGroups
      .flatMap((group) => group.entries)
      .flatMap((entry) => entry.keys.flat()).length;
    assert.strictEqual(html.match(/<kbd>/g)?.length, caps);
    assert.match(html, /<kbd>Ctrl<\/kbd>\+<kbd>T<\/kbd>/);
    assert.doesNotMatch(
      renderToStaticMarkup(<ShortcutsPopup mac onClose={noop} />),
      /<kbd>Ctrl<\/kbd>\+<kbd>T<\/kbd>/,
    );
  });
});
