import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
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

  test('groups the shortcuts by what they are for, each told in a few words starting with what it does, a toggle saying it goes both ways', () => {
    assert.deepStrictEqual(
      shortcutGroups.map((group) => [
        group.title,
        group.bindings.map((binding) => binding.action),
      ]),
      [
        [
          'Repositories',
          [
            'Open a repository',
            'Next or previous repository',
            'Next or previous worktree',
            'Close a repository',
            'Move a repository among the tabs',
            'Remove a recent repository from the menu',
          ],
        ],
        [
          'Moving around the commits',
          [
            'Select the checked-out commit',
            'Select the upstream of the checked-out branch',
            'Select the first parent',
            'Go back or forward through the selected commits',
          ],
        ],
        [
          'Commits',
          [
            'Expand or collapse the selected merge',
            'Compare with the selected commit',
          ],
        ],
        [
          'Commit messages',
          [
            "Hold to peek at a commit's message",
            'Pin it, to scroll or copy it',
            'Peek through the commits',
          ],
        ],
        [
          'Columns',
          [
            'Next or previous column',
            'Show or hide the commit list',
            "Search the column you're in",
            'Close the search',
          ],
        ],
        [
          'Files',
          ['Open or close a folder', 'Go from the file filter to the files'],
        ],
        [
          'Diff',
          [
            'Next or previous change',
            'Scroll sideways, then change column at the edge',
            'Scroll sideways with the wheel',
            'Turn line wrapping on or off',
            'Show or hide whitespace',
            'Next or previous match',
          ],
        ],
        [
          'App',
          ['Open the main menu', 'Show or hide these shortcuts', 'Show About'],
        ],
      ],
    );
  });

  test('leaves the developer tools off the screen, as they are for whoever works on the app, though their keys still open them', () => {
    const listed = shortcutGroups.flatMap((group) => group.bindings);
    assert.ok(!listed.includes(keymap.devTools));
    assert.deepStrictEqual(keymap.devTools.keys, { 'Mod+Shift+I': true });
  });

  test('says under the shortcuts that the keys moving in lists and closing popups work everywhere, as they are left off the screen', () => {
    const html = renderToStaticMarkup(
      <ShortcutsPopup mac={false} onClose={noop} />,
    );
    const [note] = tagsWith(html, 'shortcuts-note');
    assert.ok(note);
    assert.match(
      html,
      />The arrows, PgUp, PgDn, Home, End and Esc work in every list and popup\.</,
    );
  });

  test('leaves out the keys moving in a list, as every list takes them alike, but lists stepping through the commits with Alt', () => {
    const listed = shortcutGroups.flatMap((group) => group.bindings);
    assert.ok(!listed.includes(keymap.move));
    assert.ok(!listed.includes(keymap.page));
    assert.ok(listed.includes(keymap.peekStep));
  });

  test('takes its title from the menu entry that opens it, so both name it alike', () => {
    const html = renderToStaticMarkup(
      <ShortcutsPopup mac={false} onClose={noop} />,
    );
    assert.match(html, /aria-label="Shortcuts"/);
    assert.match(html, /<span>Shortcuts<\/span>/);
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
    assert.ok(isValidElement<{ children: React.ReactElement }>(popup));
    const dialog = popup.props.children;
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(dialog));
    const title = dialog.props.children[0];
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(title));
    const close = title.props.children[1];
    assert.ok(isValidElement<{ title: string; onClick: () => void }>(close));
    assert.strictEqual(close.props.title, 'Close');
    close.props.onClick();
    assert.strictEqual(closed, 1);
  });
});
