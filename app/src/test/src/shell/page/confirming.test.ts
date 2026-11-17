import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { strings } from '../../../../lib/shared/strings';
import { confirmation } from '../../../../shell/page/confirming';

suite('Confirmations', () => {
  test('names the tab to close on a line of its own, by the whole path of its folder when it has one, with no question or label, as the title and the buttons ask it, and asks before closing a window or quitting by its title and buttons alone, with no question', () => {
    assert.deepStrictEqual(
      confirmation({
        kind: 'tab',
        tab: { id: '1', tool: 'terminal', name: 'repo', folder: 'main' },
      }),
      {
        title: 'Close Tab',
        lines: [{ name: 'repo (main)' }],
        confirm: 'Close',
      },
    );
    assert.deepStrictEqual(
      confirmation({
        kind: 'tab',
        tab: {
          id: '1',
          tool: 'terminal',
          name: 'repo',
          folder: 'main',
          root: '/home/me/main/repo',
        },
      }).lines,
      [{ name: '/home/me/main/repo', path: 'folder' }],
    );
    assert.deepStrictEqual(confirmation({ kind: 'window' }), {
      title: 'Close Window',
      confirm: 'Close',
    });
    assert.deepStrictEqual(confirmation({ kind: 'quit' }), {
      title: 'Quit',
      confirm: 'Quit',
    });
    assert.deepStrictEqual(
      confirmation({
        kind: 'quit',
        note: strings.commander.quitStopsTransfers,
      }),
      {
        title: 'Quit',
        note: strings.commander.quitStopsTransfers,
        confirm: 'Quit',
      },
    );
  });

  test('names the files whose changes to save before closing a tab, a window or the app, each by its whole path on a line of its own with no question or label, as the title and the buttons ask it, offering not to save them', () => {
    assert.deepStrictEqual(
      confirmation({
        kind: 'unsavedTab',
        tab: {
          id: '1',
          tool: 'editor',
          name: 'notes.txt',
          root: '/home/me/notes.txt',
          unsaved: true,
        },
      }),
      {
        title: 'Unsaved Changes',
        lines: [{ name: '/home/me/notes.txt', path: 'file' }],
        confirm: 'Save',
        dontSave: true,
      },
    );
    assert.deepStrictEqual(
      confirmation({
        kind: 'window',
        unsaved: ['/home/me/a.txt', '/home/me/b.txt'],
      }),
      {
        title: 'Close Window',
        lines: [
          { name: '/home/me/a.txt', path: 'file' },
          { name: '/home/me/b.txt', path: 'file' },
        ],
        confirm: 'Save All',
        dontSave: true,
      },
    );
    assert.deepStrictEqual(
      confirmation({
        kind: 'quit',
        unsaved: ['/home/me/a.txt'],
        note: strings.commander.quitStopsTransfers,
      }),
      {
        title: 'Quit',
        lines: [{ name: '/home/me/a.txt', path: 'file' }],
        note: strings.commander.quitStopsTransfers,
        confirm: 'Save All',
        dontSave: true,
      },
    );
  });
});
