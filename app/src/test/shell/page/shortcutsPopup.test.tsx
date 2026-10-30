import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { keyLabels, keymap } from '../../../shell/shared/keymap';
import { gitKeymap } from '../../../tools/git/shared/keymap';
import { shortcutGroupsFor } from '../../../shell/page/App';
import { ShortcutsPopup } from '../../../shell/page/shortcutsPopup';
import { renderedBy, tagsWith } from '../../fixtures';

const noop = () => undefined;
const shortcutGroups = shortcutGroupsFor('git');

function titles(tool: Parameters<typeof shortcutGroupsFor>[0]): string[] {
  return shortcutGroupsFor(tool).map((group) => group.title);
}

function pinnedRow(tool: 'git' | undefined): string | undefined {
  return tagsWith(
    renderToStaticMarkup(
      <ShortcutsPopup
        groups={shortcutGroupsFor(tool)}
        mac={false}
        onClose={noop}
      />,
    ),
    'shortcuts-pinned',
  )[0];
}

suite('Shortcuts popup', () => {
  test('lists every binding with a group under it, and none without one', () => {
    const listed = shortcutGroups.flatMap((group) =>
      group.bindings.map((binding) => binding.action),
    );
    const bindings = [...Object.values(keymap), ...Object.values(gitKeymap)];
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
          'Tabs',
          [
            'Open a new tab',
            'Open the folder of the tab in another tool',
            'Next or previous tab',
            'Close a tab',
            'Move a tab among the tabs',
            'Remove a recent item from a menu',
          ],
        ],
        [
          'App',
          ['Open the main menu', 'Show or hide these shortcuts', 'Show About'],
        ],
        ['Worktrees', ['Next or previous worktree']],
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
      ],
    );
  });

  test("shows the tabs' and the app's shortcuts first, always in the same place, then those of the active tab's tool only", () => {
    assert.deepStrictEqual(titles(undefined), ['Tabs', 'App']);
    assert.deepStrictEqual(titles('commander'), ['Tabs', 'App', 'Commander']);
    assert.deepStrictEqual(titles('git').slice(0, 3), [
      'Tabs',
      'App',
      'Worktrees',
    ]);
  });

  test('pins the shortcuts of the tabs and the app in a row of their own atop those of the tool, so they stay in place whatever tab is open', () => {
    for (const tool of ['git', undefined] as const) {
      const html = renderToStaticMarkup(
        <ShortcutsPopup
          groups={shortcutGroupsFor(tool)}
          mac={false}
          onClose={noop}
        />,
      );
      const [pinned] = tagsWith(html, 'shortcuts-pinned');
      assert.ok(pinned);
      const headings = [
        ...html.matchAll(/class="shortcuts-heading">([^<]*)</g),
      ].map((match) => match[1]);
      assert.deepStrictEqual(headings.slice(0, 2), ['Tabs', 'App']);
      assert.ok(
        html.indexOf('shortcuts-pinned') < html.indexOf('>Tabs<') &&
          html.indexOf('>App<') <
            (tool === 'git' ? html.indexOf('>Worktrees<') : html.length),
      );
    }
  });

  test('sets the pinned row apart from the shortcuts of the tool by a line, only when there are some', () => {
    assert.match(pinnedRow('git') ?? '', /\bdivided\b/);
    assert.doesNotMatch(pinnedRow(undefined) ?? '', /\bdivided\b/);
  });

  test('leaves the developer tools off the screen, as they are for whoever works on the app, though their keys still open them', () => {
    const listed = shortcutGroups.flatMap((group) => group.bindings);
    assert.ok(!listed.includes(keymap.devTools));
    assert.deepStrictEqual(keymap.devTools.keys, { 'Mod+Shift+I': true });
  });

  test('says under the shortcuts that the keys moving in lists and closing popups work everywhere, as they are left off the screen', () => {
    const html = renderToStaticMarkup(
      <ShortcutsPopup groups={shortcutGroups} mac={false} onClose={noop} />,
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
    assert.ok(listed.includes(gitKeymap.peekStep));
  });

  test('takes its title from the menu entry that opens it, so both name it alike', () => {
    const html = renderToStaticMarkup(
      <ShortcutsPopup groups={shortcutGroups} mac={false} onClose={noop} />,
    );
    assert.match(html, /aria-label="Shortcuts"/);
    assert.match(html, /<span>Shortcuts<\/span>/);
  });

  test('draws each group under its heading, every key in a key cap', () => {
    const html = renderToStaticMarkup(
      <ShortcutsPopup groups={shortcutGroups} mac={false} onClose={noop} />,
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
      renderToStaticMarkup(
        <ShortcutsPopup groups={shortcutGroups} mac onClose={noop} />,
      ),
      /<kbd>\u2318<\/kbd>\+<kbd>T<\/kbd>/,
    );
  });

  test('closes on its close button', () => {
    let closed = 0;
    const popup = renderedBy(ShortcutsPopup, {
      groups: shortcutGroups,
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
