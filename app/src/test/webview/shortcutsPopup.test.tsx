import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { keyLabels, keymap } from '../../shared/keymap';
import { shortcutGroups, ShortcutsPopup } from '../../webview/shortcutsPopup';
import { renderedBy, tagsWith } from '../fixtures';

const noop = () => undefined;

suite('Shortcuts popup', () => {
  test('lists every binding with a group under it, and none without one', () => {
    const listed = shortcutGroups.flatMap((group) =>
      group.bindings.map((binding) => binding.action),
    );
    const bindings = Object.values(keymap);
    assert.deepStrictEqual(
      new Set(listed),
      new Set(
        bindings
          .filter((binding) => binding.group !== undefined)
          .map((binding) => binding.action),
      ),
    );
    assert.ok(bindings.some((binding) => binding.group === undefined));
  });

  test('draws each group under its heading, every key in a key cap', () => {
    const html = renderToStaticMarkup(
      <ShortcutsPopup mac={false} onClose={noop} />,
    );
    assert.match(html, /role="dialog"/);
    assert.strictEqual(
      tagsWith(html, 'shortcuts-heading').length,
      shortcutGroups.length,
    );
    const caps = shortcutGroups
      .flatMap((group) => group.bindings)
      .flatMap((binding) => Object.keys(binding.keys))
      .flatMap((keys) => keyLabels(keys, false)).length;
    assert.strictEqual(html.match(/<kbd>/g)?.length, caps);
    assert.match(html, /<kbd>Ctrl<\/kbd>\+<kbd>T<\/kbd>/);
    assert.match(
      renderToStaticMarkup(<ShortcutsPopup mac onClose={noop} />),
      /<kbd>\u2318<\/kbd>\+<kbd>T<\/kbd>/,
    );
  });

  test('closes on its close button', () => {
    let closed = 0;
    const popup = renderedBy(ShortcutsPopup, {
      mac: false,
      onClose: () => closed++,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(popup));
    const title = popup.props.children[0];
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(title));
    const close = title.props.children[1];
    assert.ok(isValidElement<{ title: string; onClick: () => void }>(close));
    assert.strictEqual(close.props.title, 'Close');
    close.props.onClick();
    assert.strictEqual(closed, 1);
  });
});
