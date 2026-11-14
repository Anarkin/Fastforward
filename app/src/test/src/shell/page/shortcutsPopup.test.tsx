import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import type { TabInfo } from '../../../../shell/shared/protocol';
import type { ToolId } from '../../../../shell/shared/tools';
import { shellKeymap } from '../../../../shell/shared/keymap';
import {
  keyParts,
  keymap,
  setKeyPlatform,
  type Binding,
} from '../../../../lib/shared/keymap';
import { compareKeymap, gitKeymap } from '../../../../tools/git/page/keymap';
import {
  commanderKeymap,
  editorKeymap,
  viewerKeymap,
} from '../../../../tools/commander/page/keymap';
import { terminalKeymap } from '../../../../tools/terminal/page/keymap';
import {
  entryFor,
  groupsInView,
  ShortcutsList,
  ShortcutsPopup,
  shownEntries,
  steppedEntry,
  steppedGroup,
} from '../../../../shell/page/shortcutsPopup';
import { shortcutEntries } from '../../../../shell/page/tools';
import { createShellStore } from '../../../../shell/page/store';
import { withStores } from '../../../helpers/componentFixtures';
import { noop, renderedBy, tagsWith } from '../../../helpers/fixtures';

function shortcutsStore(
  tool?: ToolId,
  kind: Pick<TabInfo, 'view' | 'edit' | 'compare'> = {},
) {
  return createShellStore(noop, {
    popups: ['shortcuts'],
    ...(tool === undefined
      ? {}
      : { tabs: [{ id: '1', tool, name: 'repo', ...kind }], active: '1' }),
  });
}

function shortcutsMarkup(
  tool?: ToolId,
  kind?: Pick<TabInfo, 'view' | 'edit' | 'compare'>,
): string {
  return renderToStaticMarkup(
    withStores(<ShortcutsPopup />, { shell: shortcutsStore(tool, kind) }),
  );
}

const textsOf = (html: string, name: string) =>
  [
    ...html.matchAll(
      new RegExp(
        `class="${name}(?: [^"]*)?"[^>]*>(?:<svg.*?</svg>)?([^<]*)<`,
        'g',
      ),
    ),
  ].map((match) => match[1]);

const entry = (id: string) => {
  const found = shortcutEntries.find((each) => each.id === id);
  assert.ok(found, id);
  return found;
};

const contents = (id: string) =>
  entry(id).groups.map((group) => [
    group.title,
    group.bindings.map((binding) => binding.action),
  ]);

const shown = (query: string) => shownEntries(shortcutEntries, query);

function onMac<T>(draw: () => T): T {
  setKeyPlatform('darwin');
  try {
    return draw();
  } finally {
    setKeyPlatform('win32');
  }
}

const view = (first: string | undefined, more = {}) => ({
  first,
  cut: false,
  atStart: false,
  atEnd: false,
  ...more,
});

interface Held {
  readonly ctrlKey?: boolean;
  readonly shiftKey?: boolean;
}

async function inPopup(
  tool: ToolId,
  check: (page: {
    readonly document: Document;
    readonly press: (key: string, held?: Held) => Promise<void>;
    readonly type: (text: string) => Promise<void>;
  }) => Promise<void>,
  prepare: (document: Document) => void = () => {},
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>');
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
  );
  Object.assign(globalThis, globals);
  try {
    const { createRoot } = await import('react-dom/client');
    const { document } = dom.window;
    const main = document.querySelector('main');
    assert.ok(main);
    prepare(document);
    const root = createRoot(main);
    await act(async () => {
      root.render(
        withStores(<ShortcutsPopup />, { shell: shortcutsStore(tool) }),
      );
    });
    const value = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value',
    );
    await check({
      document,
      press: (key, held = {}) =>
        act(async () => {
          document.activeElement?.dispatchEvent(
            new dom.window.KeyboardEvent('keydown', {
              key,
              bubbles: true,
              cancelable: true,
              ...held,
            }),
          );
        }),
      type: (text) =>
        act(async () => {
          const field = document.querySelector('input');
          assert.ok(field);
          value?.set?.call(field, text);
          field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        }),
    });
    await act(async () => {
      root.unmount();
    });
  } finally {
    Object.assign(globalThis, saved);
  }
}

const openTool = (document: Document) =>
  document.querySelector('.shortcuts-tool.open .shortcuts-tool-name')
    ?.textContent;

const headingsOf = (document: Document) =>
  [...document.querySelectorAll('.shortcuts-heading')].map(
    (heading) => heading.textContent,
  );

suite('Shortcuts popup', () => {
  test('lists the tools, the viewer, the diff and the editor apart from the commander and git they open in, then the shortcuts of every tab, last', () => {
    assert.deepStrictEqual(
      shortcutEntries.map((each) => [each.id, each.title]),
      [
        ['commander', 'Commander'],
        ['viewer', 'Viewer'],
        ['diff', 'Diff'],
        ['editor', 'Editor'],
        ['git', 'Git'],
        ['terminal', 'Terminal'],
        ['everywhere', 'Every tab'],
      ],
    );
  });

  test("groups each tool's shortcuts by what they are for rather than where on the screen they work", () => {
    assert.deepStrictEqual(
      shortcutEntries.map((each) => [
        each.title,
        each.groups.map((group) => group.title),
      ]),
      [
        [
          'Commander',
          [
            'Moving around',
            'Listing',
            'Filtering',
            'Marking',
            'File operations',
            'Viewing and comparing',
            'Archives',
          ],
        ],
        ['Viewer', ['Scrolling', 'Showing the file', 'Text', 'Searching']],
        ['Diff', ['Diff', 'Searching']],
        [
          'Editor',
          ['Editing', 'Moving around', 'Cursors and selections', 'Searching'],
        ],
        [
          'Git',
          ['Moving around', 'Commits', 'Commit messages', 'Files', 'Searching'],
        ],
        ['Terminal', ['Clipboard', 'Kept from the shell']],
        ['Every tab', ['Tabs', 'App', 'Lists and popups']],
      ],
    );
  });

  test("lists every binding with a group once, under the tool whose keymap has it, git's keys of the diff under Diff alone with the comparison's, and none without one", () => {
    const keymaps: [string, Readonly<Record<string, Binding<unknown>>>][] = [
      ['everywhere', { ...shellKeymap, ...keymap }],
      ['commander', commanderKeymap],
      ['viewer', viewerKeymap],
      ['editor', editorKeymap],
      [
        'git',
        Object.fromEntries(
          Object.entries(gitKeymap).filter(
            ([, binding]) => binding.group !== 'Diff',
          ),
        ),
      ],
      ['diff', compareKeymap],
      ['terminal', terminalKeymap],
    ];
    for (const [id, bindings] of keymaps) {
      const listed = entry(id).groups.flatMap((group) => group.bindings);
      const grouped = Object.values(bindings).filter(
        (binding) => binding.group !== undefined,
      );
      assert.strictEqual(listed.length, grouped.length, id);
      assert.deepStrictEqual(new Set(listed), new Set(grouped), id);
    }
    assert.ok(
      Object.values(gitKeymap)
        .filter((binding) => binding.group === 'Diff')
        .every((binding) =>
          entry('diff')
            .groups.flatMap((group) => group.bindings)
            .includes(binding),
        ),
    );
  });

  test('leaves the developer tools and the keys moving through the shortcuts themselves off the list, though their keys still work', () => {
    const listed = shortcutEntries.flatMap((each) =>
      each.groups.flatMap((group) => group.bindings),
    );
    for (const binding of [
      shellKeymap.devTools,
      shellKeymap.shortcutsTool,
      shellKeymap.shortcutsGroup,
      shellKeymap.shortcutsPage,
    ]) {
      assert.ok(!listed.includes(binding), binding.action);
    }
    assert.deepStrictEqual(shellKeymap.devTools.keys, { 'Mod+Shift+I': true });
  });

  test("puts the commander's keys for moving around, the list, the filter, marking, the files, viewing and archives each in a group of its own", () => {
    assert.deepStrictEqual(contents('commander'), [
      [
        'Moving around',
        [
          'Open the selected folder, or the selected file in its app',
          'Go up to the parent folder',
          'Back or forward through the folders of the side',
          'Open the bookmarks of the side, to go to one or to bookmark the folder of the side',
          'Go to a folder by typing or pasting its path, or to the folder of a file with the file selected',
          'Move to the thumbnail on the left or right',
          'Go to the other side',
          'Choose the drive of the left or right side',
          'Open the selected folder, or the one you are in, on the left or right side',
        ],
      ],
      [
        'Listing',
        [
          'Show the side as details or as thumbnails',
          'Sort by a column, or reverse the order',
          'Group the files of the side by their colors, or stop',
          'Show only the files of the side that have a copy of the same content, grouped, or every file again',
          'Show or hide the hidden files',
          'List the files of every folder in the folder of the side, or the folder alone again',
          'Count the sizes of the folders of the side',
          'Stop reading the folders of the side listed flat, or counting the sizes of its folders',
          'Read the folder of the side again',
        ],
      ],
      [
        'Filtering',
        [
          'Filter the folder by name',
          'Filter the folder by the letters typed with Alt',
          'Clear the filter',
        ],
      ],
      [
        'Marking',
        [
          'Mark or unmark the selected file and move down, counting with Space the size of a folder it marks',
          'Mark the files passed while moving, or unmark them',
          'Mark every file, or unmark them all once all are marked',
          'Mark the files and folders whose names match a pattern, or unmark them with minus',
          'Mark the files with the extension of the selected one, or unmark them with minus',
          'Mark the files and folders not marked, and unmark those marked',
          'Mark or unmark a file, or mark the files up to it',
        ],
      ],
      [
        'File operations',
        [
          'Copy the marked items, or the selected one, into the folder of the other side, or move them there with F6',
          'Rename the selected file or folder',
          'Make a folder in the folder of the side',
          'Edit a new file in the folder of the side, made once saved',
          'Move the marked items, or the selected one, to the Recycle Bin, or with Shift delete them permanently',
          'Put the marked items, or the selected one, on the clipboard, to paste them here or into another app',
          'Copy the files on the clipboard into the folder of the side',
          'Copy the paths of the marked items, or of the selected one, as text, or the path of the folder of the side on ..',
          'Copy the names of the marked items, or of the selected one, as text, or the name of the folder of the side on ..',
          'Show the menu of the marked items, the one clicked or selected, or the folder of the side',
          'Show the extended menu of Windows for the marked items, the one clicked, or the folder of the side',
        ],
      ],
      [
        'Viewing and comparing',
        [
          'View the selected file in a tab of its own',
          'Edit the selected file in a tab of its own',
          'Compare the marked files, or the selected file of each side, in a git tab',
        ],
      ],
      [
        'Archives',
        [
          'Open the selected file with 7-Zip, going into it as a folder',
          'Pack the marked items, or the selected one, into an archive in the folder of the other side',
          'Test the marked archives, or the selected one, against the checksum of every file in them',
        ],
      ],
    ]);
  });

  test("gives the file viewer's keys for the text a group of their own, as they change nothing else, and those showing and closing the file another", () => {
    assert.deepStrictEqual(contents('viewer'), [
      [
        'Scrolling',
        [
          'Scroll by a row, a page, or to the start or end',
          'Scroll sideways',
          'Scroll sideways with the wheel',
        ],
      ],
      [
        'Showing the file',
        [
          'View the file as hex, text or a preview',
          'Zoom a PDF in or out',
          'Show an image at its real size, or fit it to the viewer',
          'Edit the file being viewed in this tab',
          'Close the file being viewed',
        ],
      ],
      [
        'Text',
        [
          'Choose the encoding of the text',
          'Choose the language the text is colored in',
          'Turn line wrapping on or off',
          'Show or hide whitespace',
        ],
      ],
      [
        'Searching',
        ['Search the file', 'Next or previous match', 'Close the search'],
      ],
    ]);
  });

  test("puts git's moves between columns and worktrees together, every move between commits under Commits, and the search keys of the columns and the diff under Searching", () => {
    assert.deepStrictEqual(contents('git'), [
      [
        'Moving around',
        [
          'Next or previous worktree',
          'Next or previous column',
          'Show or hide the commit list',
        ],
      ],
      [
        'Commits',
        [
          'Select the checked-out commit',
          'Select the upstream of the checked-out branch',
          'Select the first parent',
          'Go back or forward through the selected commits',
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
        'Files',
        [
          'Open or close a folder',
          'View the file shown in a tab of its own',
          'Go from the file filter to the files',
        ],
      ],
      [
        'Searching',
        [
          "Search the column you're in",
          'Next or previous match',
          'Close the search',
        ],
      ],
    ]);
    assert.deepStrictEqual(contents('diff'), [
      [
        'Diff',
        [
          'Next or previous change',
          'Scroll sideways, then change column at the edge',
          'Scroll sideways with the wheel',
          'Turn line wrapping on or off',
          'Show or hide whitespace',
          'Choose the language the text is colored in',
          'Close the files being compared',
        ],
      ],
      [
        'Searching',
        [
          "Search the column you're in",
          'Next or previous match',
          'Close the search',
        ],
      ],
    ]);
  });

  test('lists the keys the terminal keeps from the shell, and those that work in every tab, every list and every popup', () => {
    assert.deepStrictEqual(contents('terminal'), [
      ['Clipboard', ['Copy the selection', 'Paste']],
      ['Kept from the shell', ['Go to the app rather than the shell']],
    ]);
    assert.deepStrictEqual(contents('everywhere'), [
      [
        'Tabs',
        [
          'Open a new tab',
          'Open a new window',
          'Open the folder of the tab in another tool',
          'Next or previous tab',
          'Close a tab',
          'Move a tab among the tabs',
          'Remove a recent item from a menu',
        ],
      ],
      [
        'App',
        [
          'Open the main menu',
          'Close the newest notice',
          'Show or hide these shortcuts',
          'Show About',
        ],
      ],
      [
        'Lists and popups',
        [
          'Move in a list',
          'Move a page, or to either end',
          'Close a menu or popup',
          'Move between the controls of a popup',
        ],
      ],
    ]);
  });

  test('opens on the tool of the tab shown, the viewer for a file viewed, the editor for a file edited, the diff for two files compared or a diff with the focus, and the shortcuts of every tab with no tab open', () => {
    assert.strictEqual(entryFor('commander'), 'commander');
    assert.strictEqual(entryFor('commander', { view: true }), 'viewer');
    assert.strictEqual(entryFor('git'), 'git');
    assert.strictEqual(entryFor('git', { compare: true }), 'diff');
    assert.strictEqual(entryFor('git', {}, 'diff'), 'diff');
    assert.strictEqual(entryFor('commander', { edit: true }), 'editor');
    assert.strictEqual(entryFor('terminal'), 'terminal');
    assert.strictEqual(entryFor(undefined), 'everywhere');
  });

  test('lists every tool beside the shortcuts, the one of the tab open with its groups under it, the first marked as in view, and only its shortcuts in the pane', () => {
    const html = shortcutsMarkup('commander');
    assert.deepStrictEqual(textsOf(html, 'shortcuts-tool-name'), [
      'Commander',
      'Viewer',
      'Diff',
      'Editor',
      'Git',
      'Terminal',
      'Every tab',
    ]);
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
        shortcutsMarkup('commander', { view: true }),
        'shortcuts-heading',
      ),
      ['Scrolling', 'Showing the file', 'Text', 'Searching'],
    );
    assert.deepStrictEqual(
      textsOf(
        shortcutsMarkup('commander', { edit: true }),
        'shortcuts-heading',
      ),
      entry('editor').groups.map((group) => group.title),
    );
    assert.deepStrictEqual(
      textsOf(shortcutsMarkup('git', { compare: true }), 'shortcuts-heading'),
      entry('diff').groups.map((group) => group.title),
    );
  });

  test('opens on the diff in a git tab while a diff has the focus, rather than on Git', async () => {
    await inPopup(
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
    await inPopup('git', ({ document }) => {
      assert.strictEqual(openTool(document), 'Git');
      return Promise.resolve();
    });
  });

  test('offers a filter above the tools and the shortcuts, telling what it takes', () => {
    const html = shortcutsMarkup('git');
    const [field] = tagsWith(html, 'search-input');
    assert.ok(field);
    assert.match(field, /placeholder="Filter by words or keys"/);
    assert.match(field, /aria-label="Filter by words or keys"/);
    assert.ok(html.indexOf(field) < html.indexOf('shortcuts-tree'));
  });

  test("narrows the shortcuts to those with every word typed in what they do or among their keys, whatever their case, counting each tool's matches", () => {
    const counts = (query: string) =>
      shown(query).map((each) => [each.id, each.count]);
    assert.deepStrictEqual(counts('f3'), [
      ['commander', 2],
      ['viewer', 0],
      ['diff', 0],
      ['editor', 0],
      ['git', 1],
      ['terminal', 0],
      ['everywhere', 0],
    ]);
    assert.deepStrictEqual(counts('ARCHIVE')[0], ['commander', 2]);
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
      'viewer/Scrolling',
    );
    assert.strictEqual(
      steppedGroup(
        all,
        'viewer',
        view('viewer/Scrolling', { atStart: true }),
        -1,
      ),
      'commander/Archives',
    );
    assert.strictEqual(
      steppedGroup(
        all,
        'terminal',
        view('terminal/Clipboard', { atStart: true, atEnd: true }),
        1,
      ),
      'everywhere/Tabs',
    );
    assert.strictEqual(
      steppedGroup(
        all,
        'everywhere',
        view('everywhere/Tabs', { atEnd: true }),
        1,
      ),
      undefined,
    );
    assert.strictEqual(
      steppedGroup(
        all,
        'commander',
        view('commander/Moving around', { atStart: true }),
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
      steppedGroup(f3, 'viewer', view(undefined, whole), 1),
      'git/Files',
    );
    assert.strictEqual(
      steppedGroup(f3, 'viewer', view(undefined, whole), -1),
      'commander/Viewing and comparing',
    );
  });

  test('takes the keyboard in its filter, going to the next and previous tool on Ctrl+Tab and Ctrl+Shift+Tab, and on ↓ and ↑ too once the pane can scroll no further, as the filter narrows the shortcuts to what is typed', async () => {
    await inPopup('commander', async ({ document, press, type }) => {
      const field = document.querySelector('.shortcuts-filter input');
      assert.ok(field);
      assert.strictEqual(document.activeElement, field);
      assert.strictEqual(openTool(document), 'Commander');
      await press('Tab', { ctrlKey: true });
      assert.strictEqual(openTool(document), 'Viewer');
      assert.deepStrictEqual(headingsOf(document), [
        'Scrolling',
        'Showing the file',
        'Text',
        'Searching',
      ]);
      await press('Tab', { ctrlKey: true, shiftKey: true });
      assert.strictEqual(openTool(document), 'Commander');
      await press('ArrowDown');
      assert.strictEqual(openTool(document), 'Viewer');
      await press('ArrowUp');
      assert.strictEqual(openTool(document), 'Commander');
      await type('f3');
      assert.deepStrictEqual(
        [...document.querySelectorAll('.shortcuts-tool .shortcuts-count')].map(
          (count) => count.textContent,
        ),
        ['2', '0', '0', '0', '1', '0', '0'],
      );
      assert.strictEqual(
        document.querySelectorAll('.shortcuts-tool.empty').length,
        5,
      );
      assert.deepStrictEqual(headingsOf(document), ['Viewing and comparing']);
      await press('ArrowDown');
      assert.strictEqual(openTool(document), 'Git');
      assert.deepStrictEqual(headingsOf(document), ['Files']);
      assert.strictEqual(document.activeElement, field);
    });
  });

  test('opens a tool clicked, leaving the keyboard in the filter, a group clicked too', async () => {
    await inPopup('git', async ({ document }) => {
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
    assert.strictEqual(steppedEntry('commander', 1), 'viewer');
    assert.strictEqual(steppedEntry('everywhere', 1), 'commander');
    assert.strictEqual(steppedEntry('commander', -1), 'everywhere');
  });

  test('says under the shortcuts how to reach the other tools and groups from the keyboard', () => {
    const html = shortcutsMarkup('git');
    assert.strictEqual(tagsWith(html, 'shortcuts-note').length, 1);
    assert.match(
      html,
      />Ctrl\+Tab and Ctrl\+Shift\+Tab show the other tools, and ↑ and ↓ go through the groups\.</,
    );
  });

  test('takes its title from the menu entry that opens it, so both name it alike', () => {
    const html = shortcutsMarkup('git');
    assert.match(html, /aria-label="Shortcuts"/);
    assert.match(html, /<span>Shortcuts<\/span>/);
    assert.match(html, /role="dialog"/);
  });

  test('draws each shortcut as one key cap holding its keys, joined by a line between them, and marks a part done with the mouse by a mouse', () => {
    const html = shortcutsMarkup(undefined);
    assert.match(
      html,
      /<span class="shortcut-combo"><kbd>Ctrl<\/kbd><span class="shortcut-joiner">\+<\/span><kbd>T<\/kbd><\/span>/,
    );
    assert.match(
      onMac(() => shortcutsMarkup(undefined)),
      /<kbd>⌘<\/kbd><span class="shortcut-joiner">\+<\/span><kbd>T<\/kbd>/,
    );
    assert.match(
      shortcutsMarkup('git'),
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
    assert.ok(isValidElement<{ title: string; onClick: () => void }>(close));
    assert.strictEqual(close.props.title, 'Close');
    close.props.onClick();
    assert.deepStrictEqual(store.getState().popups, []);
  });
});
