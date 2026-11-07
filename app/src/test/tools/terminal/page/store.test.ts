import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { createTerminalStore } from '../../../../tools/terminal/page/store';
import type {
  TerminalToHost,
  TerminalToWebview,
} from '../../../../tools/terminal/shared/protocol';

suite('Terminal store', () => {
  test('keeps the tab shown, the settings and the folders the main process tells, handing the output of the shells to the screen', () => {
    const store = createTerminalStore(() => undefined);
    const screen: TerminalToWebview[] = [];
    const stop = store
      .getState()
      .listenScreen((message) => screen.push(message));
    const { receive } = store.getState();
    receive({
      type: 'settings',
      renderer: 'dom',
      scrollback: 1000,
      minimumContrastRatio: 4.5,
      windowsPty: undefined,
    });
    receive({ type: 'show', tab: '1' });
    receive({ type: 'folders', folders: ['/a', '/b'] });
    receive({ type: 'output', tab: '1', data: 'hello' });
    receive({ type: 'exited', tab: '1' });
    assert.deepStrictEqual(
      {
        shown: store.getState().shown,
        settings: store.getState().settings,
        folders: store.getState().folders,
      },
      {
        shown: '1',
        settings: {
          renderer: 'dom',
          scrollback: 1000,
          minimumContrastRatio: 4.5,
          windowsPty: undefined,
        },
        folders: ['/a', '/b'],
      },
    );
    assert.deepStrictEqual(screen, [
      { type: 'output', tab: '1', data: 'hello' },
      { type: 'exited', tab: '1' },
    ]);
    receive({ type: 'hide' });
    assert.strictEqual(store.getState().shown, undefined);
    stop();
    receive({ type: 'output', tab: '1', data: 'gone' });
    assert.strictEqual(screen.length, 2);
  });

  test('forgets a folder at once while telling the main process, and asks it for a new tab, a folder to browse or one to open', () => {
    const posted: TerminalToHost[] = [];
    const store = createTerminalStore((message) => posted.push(message));
    store.getState().receive({ type: 'folders', folders: ['/a', '/b'] });
    const { forgetFolder, newTab, browseFolders, openFolder } =
      store.getState();
    forgetFolder('/a');
    assert.deepStrictEqual(store.getState().folders, ['/b']);
    newTab();
    browseFolders();
    openFolder('/b');
    assert.deepStrictEqual(posted, [
      { type: 'forgetFolder', folder: '/a' },
      { type: 'newTab' },
      { type: 'browseFolders' },
      { type: 'openFolder', folder: '/b' },
    ]);
  });
});
