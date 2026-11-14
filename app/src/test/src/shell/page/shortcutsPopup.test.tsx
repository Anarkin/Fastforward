import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { shellKeymap } from '../../../../shell/shared/keymap';
import { keymap, type Binding } from '../../../../lib/shared/keymap';
import { compareKeymap, gitKeymap } from '../../../../tools/git/page/keymap';
import {
  commanderKeymap,
  editorKeymap,
  viewerKeymap,
} from '../../../../tools/commander/page/keymap';
import { terminalKeymap } from '../../../../tools/terminal/page/keymap';
import { shortcutEntries } from '../../../../shell/page/toolShortcuts';
import { entry, contents } from './shortcutsFixtures';

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
});
