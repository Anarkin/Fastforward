import { AppIcon } from '../../../../shell/page/appIcon';
import * as assert from 'node:assert';
import { act, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { shellKeymap } from '../../../../shell/shared/keymap';
import { keyParts } from '../../../../lib/page/keyLabels';
import { commanderKeymap } from '../../../../tools/commander/page/keymap';
import {
  entryFor,
  groupsInView,
  steppedEntry,
  steppedGroup,
} from '../../../../shell/page/shortcutsList';
import {
  ShortcutsList,
  ShortcutsPopup,
} from '../../../../shell/page/shortcutsPopup';
import { shortcutEntries } from '../../../../shell/page/toolShortcuts';
import { tools, toolSections } from '../../../../shell/shared/tools';
import { strings } from '../../../../lib/shared/strings';
import {
  shortcutsStore,
  shortcutsMarkup,
  textsOf,
  entry,
  shown,
  onMac,
  view,
  inPopup,
  openTool,
  headingsOf,
} from './shortcutsFixtures';
import { renderedBy } from '../../../helpers/componentFixtures';
import { tagsWith } from '../../../helpers/markup';

const counts = (query: string) =>
  shown(query).map((each) => [each.id, each.count]);

const clickOn = (button: Element | undefined) =>
  act(async () => {
    assert.ok(button instanceof window.HTMLElement);
    button.click();
  });

suite('Shortcuts popup', () => {
  test('opens on the tool of the tab shown, the viewer for a file viewed, the editor for a file edited, the diff for two files compared or a diff with the focus, and the shortcuts of every tab with no tab open', () => {
    assert.strictEqual(entryFor('commander'), 'commander');
    assert.strictEqual(entryFor('viewer'), 'viewer');
    assert.strictEqual(entryFor('git'), 'git');
    assert.strictEqual(entryFor('diff'), 'diff');
    assert.strictEqual(entryFor('git', 'diff'), 'diff');
    assert.strictEqual(entryFor('editor'), 'editor');
    assert.strictEqual(entryFor('terminal'), 'terminal');
    assert.strictEqual(entryFor(undefined), 'everywhere');
  });

  test('lists the shortcuts of every tab first, then those of every tool of the app once, under its name, in the order of the sections of the settings', () => {
    assert.deepStrictEqual(
      shortcutEntries.map((each) => each.id),
      ['everywhere', ...toolSections, 'paint'],
    );
    assert.deepStrictEqual([...toolSections].toSorted(), [...tools].toSorted());
    assert.deepStrictEqual(
      shortcutEntries.slice(1, -1).map((each) => each.title),
      toolSections.map((tool) => strings.tools[tool]),
    );
  });

  test('lists every tool beside the shortcuts, the one of the tab open with its groups under it, the first marked as in view, and only its shortcuts in the pane', () => {
    const html = shortcutsMarkup(<ShortcutsPopup />, 'commander');
    assert.deepStrictEqual(textsOf(html, 'shortcuts-tool-name'), [
      'General',
      'Terminal',
      'Commander',
      'Git',
      'Viewer',
      'Diff',
      'Editor',
      'Paint',
    ]);
    const appIcon = renderToStaticMarkup(
      <AppIcon className="icon" size={16} />,
    );
    assert.match(appIcon, /^<svg class="icon" width="16" height="16"/);
    assert.ok(
      html.includes(appIcon),
      'the shortcuts of every tab under the icon of the app, as small as the icons of the tools',
    );
    const open = tagsWith(html, 'shortcuts-tool', 'open');
    assert.strictEqual(open.length, 1);
    assert.match(open[0] ?? '', /aria-expanded="true"/);
    assert.strictEqual(
      html.match(/aria-expanded="false"/g)?.length,
      shortcutEntries.length - 1,
    );
    const groups = entry('commander').groups.map((group) => group.title);
    assert.deepStrictEqual(textsOf(html, 'shortcuts-group-link'), groups);
    assert.deepStrictEqual(textsOf(html, 'shortcuts-heading'), groups);
    const marked = tagsWith(html, 'shortcuts-group-link', 'in-view');
    assert.strictEqual(marked.length, 1);
    assert.ok(html.indexOf(marked[0] ?? '') < html.indexOf('>Listing<'));
  });

  test('opens on the groups of the viewer for a file viewed, of the editor for a file edited, and of the diff for two files compared', () => {
    assert.deepStrictEqual(
      textsOf(
        shortcutsMarkup(<ShortcutsPopup />, 'viewer'),
        'shortcuts-heading',
      ),
      ['Scrolling', 'Showing the file', 'Text', 'Searching'],
    );
    assert.deepStrictEqual(
      textsOf(
        shortcutsMarkup(<ShortcutsPopup />, 'editor'),
        'shortcuts-heading',
      ),
      entry('editor').groups.map((group) => group.title),
    );
    assert.deepStrictEqual(
      textsOf(shortcutsMarkup(<ShortcutsPopup />, 'diff'), 'shortcuts-heading'),
      entry('diff').groups.map((group) => group.title),
    );
  });

  test('opens on the diff in a git tab while a diff has the focus, rather than on Git', async () => {
    await inPopup(
      <ShortcutsPopup />,
      'git',
      ({ document }) => {
        assert.strictEqual(openTool(document), 'Diff');
        return Promise.resolve();
      },
      (document) => {
        const diff = document.createElement('div');
        diff.setAttribute('data-shortcuts', 'diff');
        diff.tabIndex = 0;
        document.body.append(diff);
        diff.focus();
      },
    );
    await inPopup(<ShortcutsPopup />, 'git', ({ document }) => {
      assert.strictEqual(openTool(document), 'Git');
      return Promise.resolve();
    });
  });

  test('offers a filter above the tools and the shortcuts, telling what it takes', () => {
    const html = shortcutsMarkup(<ShortcutsPopup />, 'git');
    const [field] = tagsWith(html, 'search-box-input');
    assert.ok(field);
    assert.deepStrictEqual(
      tagsWith(html, 'search-bar').map((tag) => /monospace/.test(tag)),
      [false],
      'the font of the actions it filters',
    );
    assert.match(field, /placeholder="Filter by words or keys"/);
    assert.match(field, /aria-label="Filter by words or keys"/);
    assert.ok(html.indexOf(field) < html.indexOf('shortcuts-tree'));
  });

  test("narrows the shortcuts to those with every word typed in what they do or among their keys, whatever their case, counting each tool's matches", () => {
    assert.deepStrictEqual(counts('f3'), [
      ['everywhere', 0],
      ['terminal', 0],
      ['commander', 2],
      ['git', 1],
      ['viewer', 1],
      ['diff', 0],
      ['editor', 2],
      ['paint', 0],
    ]);
    assert.deepStrictEqual(counts('ARCHIVE')[2], ['commander', 2]);
    const shiftF6 = shown('shift f6')
      .flatMap((each) => each.groups.flatMap((group) => group.rows))
      .map((row) => row.binding.action);
    assert.deepStrictEqual(shiftF6, [
      'Go to a folder by typing or pasting its path, or to the folder of a file with the file selected',
      'Rename the selected file or folder',
    ]);
    assert.ok(shown('mark zzz').every((each) => each.count === 0));
    assert.deepStrictEqual(
      shown('').map((each) => each.count),
      shortcutEntries.map((each) =>
        each.groups.reduce((sum, group) => sum + group.bindings.length, 0),
      ),
    );
  });

  test('takes the start of a shortcut typed with its plus, so shift+f finds the function keys held with Shift', () => {
    const found = shown('shift+f')
      .flatMap((each) => each.groups.flatMap((group) => group.rows))
      .map((row) => row.binding);
    assert.ok(found.includes(commanderKeymap.renameItem));
    assert.ok(found.includes(commanderKeymap.compare));
    assert.ok(found.includes(shellKeymap.about));
    assert.ok(!found.includes(commanderKeymap.view));
  });

  test('counts the matches of each group, so the list shows where else the words turn up', () => {
    const commander = shown('f3').find((each) => each.id === 'commander');
    assert.deepStrictEqual(
      commander?.groups.map((group) => [group.title, group.rows.length]),
      [
        ['Moving around', 0],
        ['Listing', 0],
        ['Filtering', 0],
        ['Marking', 0],
        ['File operations', 0],
        ['Viewing and comparing', 2],
        ['Archives', 0],
      ],
    );
  });

  test('marks the words found in what a shortcut does and the keys found among its keys', () => {
    const commander = shown('rename f6').find(
      (each) => each.id === 'commander',
    );
    assert.ok(commander);
    const html = renderToStaticMarkup(<ShortcutsList entry={commander} />);
    assert.match(html, /<mark class="match">Rename<\/mark> the selected file/);
    assert.match(html, /<kbd class="match">F6<\/kbd>/);
    assert.match(html, /<kbd>Shift<\/kbd>/);
  });

  test("says so when none of the tool's shortcuts has every word, leaving its groups out", () => {
    const terminal = shown('f3').find((each) => each.id === 'terminal');
    assert.ok(terminal);
    const html = renderToStaticMarkup(<ShortcutsList entry={terminal} />);
    assert.match(html, />No shortcut here has all of these words\.</);
    assert.strictEqual(tagsWith(html, 'shortcuts-heading').length, 0);
  });

  test('marks as in view every group with a shortcut showing between the heading stuck at the top of the pane and its bottom, allowing a pixel of rounding', () => {
    const sections = [
      { key: 'a', top: 30, bottom: 100 },
      { key: 'b', top: 130, bottom: 250 },
      { key: 'c', top: 280, bottom: 300 },
    ];
    assert.deepStrictEqual(groupsInView(sections, 30, 200), ['a', 'b']);
    assert.deepStrictEqual(groupsInView(sections, 101, 400), ['b', 'c']);
    assert.deepStrictEqual(groupsInView(sections, 99.5, 280.5), ['b']);
    assert.deepStrictEqual(groupsInView(sections, 0, 1000), ['a', 'b', 'c']);
    assert.deepStrictEqual(groupsInView([], 0, 100), []);
  });

  test("brings the next or previous group to the top of the pane, or the top of the group cut by it back, going on into the next or previous tool's once the pane can scroll no further, skipping those without a match, and no further than the ends", () => {
    const all = shown('');
    assert.strictEqual(
      steppedGroup(all, 'commander', view('commander/Moving around'), 1),
      'commander/Listing',
    );
    assert.strictEqual(
      steppedGroup(all, 'commander', view('commander/Listing'), -1),
      'commander/Moving around',
    );
    assert.strictEqual(
      steppedGroup(
        all,
        'commander',
        view('commander/Listing', { cut: true }),
        -1,
      ),
      'commander/Listing',
    );
    assert.strictEqual(
      steppedGroup(
        all,
        'commander',
        view('commander/Viewing and comparing', { atEnd: true }),
        1,
      ),
      'git/Moving around',
    );
    assert.strictEqual(
      steppedGroup(
        all,
        'git',
        view('git/Moving around', { atStart: true }),
        -1,
      ),
      'commander/Archives',
    );
    assert.strictEqual(
      steppedGroup(
        all,
        'editor',
        view('editor/Searching', { atStart: true, atEnd: true }),
        1,
      ),
      undefined,
    );
    assert.strictEqual(
      steppedGroup(
        all,
        'everywhere',
        view('everywhere/Tabs', { atEnd: true }),
        1,
      ),
      'terminal/Clipboard',
    );
    assert.strictEqual(
      steppedGroup(
        all,
        'terminal',
        view('terminal/Clipboard', { atStart: true }),
        -1,
      ),
      'everywhere/Lists and popups',
    );
    assert.strictEqual(
      steppedGroup(
        all,
        'everywhere',
        view('everywhere/Tabs', { atStart: true }),
        -1,
      ),
      undefined,
    );
    const f3 = shown('f3');
    const whole = { atStart: true, atEnd: true };
    assert.strictEqual(
      steppedGroup(
        f3,
        'commander',
        view('commander/Viewing and comparing', whole),
        1,
      ),
      'git/Files',
    );
    assert.strictEqual(
      steppedGroup(f3, 'git', view('git/Files', whole), -1),
      'commander/Viewing and comparing',
    );
    assert.strictEqual(
      steppedGroup(f3, 'terminal', view(undefined, whole), 1),
      'commander/Viewing and comparing',
    );
    assert.strictEqual(
      steppedGroup(f3, 'diff', view(undefined, whole), -1),
      'viewer/Showing the file',
    );
    assert.strictEqual(
      steppedGroup(f3, 'diff', view(undefined, whole), 1),
      'editor/Editing',
    );
    assert.strictEqual(
      steppedGroup(f3, 'paint', view(undefined, whole), 1),
      undefined,
    );
  });

  test('takes the keyboard in its filter, going to the next and previous tool on Ctrl+Tab and Ctrl+Shift+Tab, and on ↓ and ↑ too once the pane can scroll no further, as the filter narrows the shortcuts to what is typed', async () => {
    await inPopup(
      <ShortcutsPopup />,
      'commander',
      async ({ document, press, type }) => {
        const field = document.querySelector('.shortcuts-filter input');
        assert.ok(field);
        assert.strictEqual(document.activeElement, field);
        assert.strictEqual(openTool(document), 'Commander');
        await press('Tab', { ctrlKey: true });
        assert.strictEqual(openTool(document), 'Git');
        assert.deepStrictEqual(headingsOf(document), [
          'Moving around',
          'Commits',
          'Commit messages',
          'Files',
          'Searching',
        ]);
        await press('Tab', { ctrlKey: true, shiftKey: true });
        assert.strictEqual(openTool(document), 'Commander');
        await press('ArrowDown');
        assert.strictEqual(openTool(document), 'Git');
        await press('ArrowUp');
        assert.strictEqual(openTool(document), 'Commander');
        await type('f3');
        assert.deepStrictEqual(
          [
            ...document.querySelectorAll('.shortcuts-tool .shortcuts-count'),
          ].map((count) => count.textContent),
          ['0', '0', '2', '1', '1', '0', '2', '0'],
        );
        assert.strictEqual(
          document.querySelectorAll('.shortcuts-tool.empty').length,
          4,
        );
        assert.deepStrictEqual(headingsOf(document), ['Viewing and comparing']);
        await press('ArrowDown');
        assert.strictEqual(openTool(document), 'Git');
        assert.deepStrictEqual(headingsOf(document), ['Files']);
        assert.strictEqual(document.activeElement, field);
      },
    );
  });

  test('opens a tool clicked, leaving the keyboard in the filter, a group clicked too', async () => {
    await inPopup(<ShortcutsPopup />, 'git', async ({ document }) => {
      const click = (selector: string, text: string) =>
        act(async () => {
          const target = [
            ...document.querySelectorAll<HTMLElement>(selector),
          ].find((each) => each.textContent?.startsWith(text));
          assert.ok(target, text);
          target.click();
        });
      assert.strictEqual(openTool(document), 'Git');
      await click('.shortcuts-tool', 'Terminal');
      assert.strictEqual(openTool(document), 'Terminal');
      await click('.shortcuts-group-link', 'Kept from the shell');
      assert.strictEqual(openTool(document), 'Terminal');
      assert.strictEqual(
        document.activeElement,
        document.querySelector('.shortcuts-filter input'),
      );
    });
  });

  test('steps through the tools round, from the last back to the first', () => {
    assert.strictEqual(steppedEntry('terminal', 1), 'commander');
    assert.strictEqual(steppedEntry('everywhere', 1), 'terminal');
    assert.strictEqual(steppedEntry('terminal', -1), 'everywhere');
    assert.strictEqual(steppedEntry('paint', 1), 'everywhere');
  });

  test('takes its title from the menu entry that opens it, so both name it alike', () => {
    const html = shortcutsMarkup(<ShortcutsPopup />, 'git');
    assert.match(html, /aria-label="Shortcuts"/);
    assert.match(html, /<span>Shortcuts<\/span>/);
    assert.match(html, /role="dialog"/);
  });

  test('draws each shortcut as one key cap holding its keys, joined by a line between them, and marks a part done with the mouse by a mouse', () => {
    const html = shortcutsMarkup(<ShortcutsPopup />, undefined);
    assert.match(
      html,
      /<span class="shortcut-combo"><kbd>Ctrl<\/kbd><span class="shortcut-joiner">\+<\/span><kbd>T<\/kbd><\/span>/,
    );
    assert.match(
      onMac(() => shortcutsMarkup(<ShortcutsPopup />, undefined)),
      /<kbd>⌘<\/kbd><span class="shortcut-joiner">\+<\/span><kbd>T<\/kbd>/,
    );
    assert.match(
      shortcutsMarkup(<ShortcutsPopup />, 'git'),
      /<kbd>Ctrl<\/kbd><span class="shortcut-joiner">\+<\/span><kbd class="pointer"><svg class="icon mouse-icon"[^>]*>.*?<\/svg>Click<\/kbd>/,
    );
    const caps = entry('everywhere')
      .groups.flatMap((group) => group.bindings)
      .flatMap((binding) => Object.keys(binding.keys))
      .flatMap((keys) => keyParts(keys, false)).length;
    assert.strictEqual(html.match(/<kbd[ >]/g)?.length, caps);
  });

  test('closes on its close button', () => {
    const store = shortcutsStore('git');
    const popup = renderedBy(ShortcutsPopup, {}, { shell: store });
    assert.ok(isValidElement<{ children: React.ReactElement }>(popup));
    const dialog = popup.props.children;
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(dialog));
    const title = dialog.props.children[0];
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(title));
    const close = title.props.children[1];
    assert.ok(
      isValidElement<{ 'data-tip': string; onClick: () => void }>(close),
    );
    assert.strictEqual(close.props['data-tip'], 'Close');
    close.props.onClick();
    assert.deepStrictEqual(store.getState().popups, []);
  });

  test('filters with the search bar, counting the groups that match, stepping to the next and back around them across the tools, and matching whole words of what the shortcuts do while its toggle is pressed', async () => {
    await inPopup(
      <ShortcutsPopup />,
      'commander',
      async ({ document, type }) => {
        const count = () =>
          document.querySelector('.shortcuts-filter .search-count')
            ?.textContent;
        assert.strictEqual(
          document.querySelector('.shortcuts-filter .search-bar > .nav-button'),
          null,
        );
        await type('f3');
        assert.match(count() ?? '', /^\d+ of 4$/);
        const [, next] = document.querySelectorAll(
          '.shortcuts-filter .search-steps button',
        );
        await clickOn(next);
        assert.strictEqual(openTool(document), 'Git');
        await clickOn(next);
        assert.strictEqual(openTool(document), 'Viewer');
        await clickOn(next);
        assert.strictEqual(openTool(document), 'Editor');
        await clickOn(next);
        assert.strictEqual(openTool(document), 'Commander');
        await type('archiv');
        assert.notStrictEqual(count(), 'No matches');
        const wholeWord = document.querySelectorAll(
          '.shortcuts-filter .search-toggle',
        )[1];
        await clickOn(wholeWord);
        assert.strictEqual(wholeWord?.getAttribute('aria-pressed'), 'true');
        assert.strictEqual(count(), 'No matches');
      },
    );
  });
});
