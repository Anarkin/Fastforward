import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { runFolderCommand } from '../../../../lib/main/folderCommands';

suite('Folder commands', () => {
  test('opens a terminal, the commander or git in a folder, clones or inits a repository in it, or opens it with the system, the same wherever the menu that asked for it was', async () => {
    const ran: string[] = [];
    const runner = {
      open: (tool: 'terminal' | 'commander' | 'git', folder: string) => {
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
      openWithSystem: (folder: string) => {
        ran.push(`system ${folder}`);
        return Promise.resolve();
      },
    };
    for (const command of [
      'newTerminal',
      'openInCommander',
      'openInGit',
      'cloneHere',
      'initHere',
      'openWithSystem',
    ] as const) {
      await runFolderCommand(command, '/code', runner);
    }
    assert.deepStrictEqual(ran, [
      'terminal /code',
      'commander /code',
      'git /code',
      'clone /code',
      'init /code',
      'system /code',
    ]);
  });
});
