import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { strings } from '../../../../lib/shared/strings';
import { confirmation } from '../../../../shell/page/confirming';

suite('Confirmations', () => {
  test('asks whether you are sure, naming the tool and, on a line of its own, the tab to close, as a tab named after a folder could pass for anything, or the app to quit', () => {
    assert.deepStrictEqual(
      confirmation({
        kind: 'tab',
        tab: { id: '1', tool: 'terminal', name: 'repo', folder: 'main' },
      }),
      {
        title: 'Close Tab',
        message: 'Are you sure you want to close this Terminal tab?',
        lines: [{ label: 'Tab', name: 'repo (main)' }],
        confirm: 'Close',
      },
    );
    assert.deepStrictEqual(confirmation({ kind: 'window' }), {
      title: 'Close Window',
      message: 'Are you sure you want to close this window and its tabs?',
      confirm: 'Close',
    });
    assert.deepStrictEqual(confirmation({ kind: 'quit' }), {
      title: 'Quit',
      message: 'Are you sure you want to quit Fastforward?',
      confirm: 'Quit',
    });
    assert.deepStrictEqual(
      confirmation({
        kind: 'quit',
        note: strings.commander.quitStopsTransfers,
      }),
      {
        title: 'Quit',
        message: 'Are you sure you want to quit Fastforward?',
        note: strings.commander.quitStopsTransfers,
        confirm: 'Quit',
      },
    );
  });

  test('asks whether to save the changes of a file before closing its tab, and of the files a window or the app holds before closing or quitting, naming each on a line of its own and offering not to save them', () => {
    assert.deepStrictEqual(
      confirmation({
        kind: 'unsavedTab',
        tab: { id: '1', tool: 'commander', name: 'notes.txt', unsaved: true },
      }),
      {
        title: 'Unsaved Changes',
        message: 'Save the changes to this file before closing it?',
        lines: [{ label: 'File', name: 'notes.txt', path: 'file' }],
        confirm: 'Save',
        dontSave: true,
      },
    );
    assert.deepStrictEqual(
      confirmation({ kind: 'window', unsaved: ['a.txt', 'b.txt'] }),
      {
        title: 'Close Window',
        message: 'Save the changes to these files before closing the window?',
        lines: [
          { label: 'File', name: 'a.txt', path: 'file' },
          { label: 'File', name: 'b.txt', path: 'file' },
        ],
        confirm: 'Save All',
        dontSave: true,
      },
    );
    assert.deepStrictEqual(
      confirmation({
        kind: 'quit',
        unsaved: ['a.txt'],
        note: strings.commander.quitStopsTransfers,
      }),
      {
        title: 'Quit',
        message: 'Save the changes to these files before quitting Fastforward?',
        lines: [{ label: 'File', name: 'a.txt', path: 'file' }],
        note: strings.commander.quitStopsTransfers,
        confirm: 'Save All',
        dontSave: true,
      },
    );
  });
});
