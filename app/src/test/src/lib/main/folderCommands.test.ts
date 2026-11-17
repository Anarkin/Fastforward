import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { runFolderCommand } from '../../../../lib/main/folderCommands';

suite('Folder commands', () => {
  test('opens a terminal or git in a folder, or clones or inits a repository in it, the same wherever the menu that asked for it was', async () => {
    const ran: string[] = [];
    const runner = {
      open: (tool: 'terminal' | 'git', folder: string) => {
        ran.push(`${tool} ${folder}`);
        return Promise.resolve();
      },
      cloneInto: (folder: string) => {
        ran.push(`clone ${folder}`);
        return Promise.resolve();
      },
      initRepository: (folder: string) => {
        ran.push(`init ${folder}`);
        return Promise.resolve();
      },
    };
    for (const command of [
      'newTerminal',
      'openInGit',
      'cloneHere',
      'initHere',
    ] as const) {
      await runFolderCommand(command, '/code', runner);
    }
    assert.deepStrictEqual(ran, [
      'terminal /code',
      'git /code',
      'clone /code',
      'init /code',
    ]);
  });
});
