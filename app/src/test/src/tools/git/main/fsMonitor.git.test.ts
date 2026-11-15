import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { replaceBuiltin } from '../../../../helpers/builtins';
import { runGit } from '../../../../../tools/git/main/run';
import {
  workingTreeFiles,
  workingTreePatch,
} from '../../../../../tools/git/main/workingTree';
import {
  removeFolder,
  tempFolder,
  tempRepository,
} from '../../../../helpers/repositories';
import { ignoredPaths } from '../../../../../tools/git/main/watchFolders';

suite('A file system monitor the repository sets', () => {
  test('is never run when it is a command, which git would run on every read of the index', async () => {
    const folder = tempFolder('monitored');
    try {
      const repository = await tempRepository(path.join(folder, 'repository'));
      const { gitPath, root } = repository;
      await repository.commit('first', { 'a.txt': 'one\n' });
      fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
      fs.writeFileSync(path.join(root, 'b.txt'), 'new\n');
      const ran = path.join(folder, 'ran.txt').replaceAll('\\', '/');
      await repository.git('config', 'core.fsmonitor', `echo >> '${ran}'`);
      const workingTree = await workingTreeFiles(gitPath, root);
      await workingTreePatch(gitPath, root, workingTree);
      await ignoredPaths(gitPath, root, [path.join(root, 'b.txt')]);
      assert.strictEqual(fs.existsSync(ran), false);
      assert.deepStrictEqual(
        workingTree.files.map((file) => file.path),
        ['a.txt', 'b.txt'],
      );
    } finally {
      removeFolder(folder);
    }
  });

  test("is kept on when it is git's own", async () => {
    const repository = await tempRepository(tempFolder('daemon'));
    try {
      await repository.git('config', 'core.fsmonitor', 'true');
      const monitor = await runGit(repository.gitPath, repository.root, [
        'config',
        'core.fsmonitor',
      ]);
      assert.strictEqual(monitor.trim(), 'true');
    } finally {
      removeFolder(repository.root);
    }
  });

  test("reads again whether git's own monitor is on once reading it failed, as a git Windows could not start kept the monitor off in the folder for as long as the app ran", async () => {
    const repository = await tempRepository(tempFolder('daemon-unread'));
    const childProcess = process.getBuiltinModule('node:child_process');
    const { spawn } = childProcess;
    let failed = 0;
    replaceBuiltin(
      childProcess,
      'spawn',
      (command: string, args: readonly string[], options: object) => {
        if (args.includes('core.fsmonitor') && failed === 0) {
          failed++;
          return spawn('fastforward-no-such-git', [], options);
        }
        return spawn(command, args, options);
      },
    );
    try {
      await repository.git('config', 'core.fsmonitor', 'true');
      const monitor = async () =>
        (
          await runGit(repository.gitPath, repository.root, [
            'config',
            'core.fsmonitor',
          ])
        ).trim();
      assert.strictEqual(await monitor(), 'false');
      assert.strictEqual(await monitor(), 'true');
      assert.strictEqual(failed, 1);
    } finally {
      replaceBuiltin(childProcess, 'spawn', spawn);
      removeFolder(repository.root);
    }
  });

  test("reads whether git's own monitor is on only the first time it runs git in a folder, as reading it takes a git of its own", async () => {
    const repository = await tempRepository(tempFolder('daemon-later'));
    try {
      const run = (...args: string[]) =>
        runGit(repository.gitPath, repository.root, args);
      await run('status');
      await repository.git('config', 'core.fsmonitor', 'true');
      assert.strictEqual(
        (await run('config', 'core.fsmonitor')).trim(),
        'false',
      );
    } finally {
      removeFolder(repository.root);
    }
  });
});
