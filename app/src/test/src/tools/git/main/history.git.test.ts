import * as assert from 'node:assert';
import type { SpawnOptions } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { replaceBuiltin } from '../../../../helpers/builtins';
import { headCommit } from '../../../../../tools/git/main/commitLookup';
import {
  listHistory,
  listRecentHistory,
} from '../../../../../tools/git/main/history';
import { readRefs } from '../../../../../tools/git/main/refReads';
import { runGit } from '../../../../../tools/git/main/run';
import { tipsInGitOrder } from '../../../../../tools/git/main/tabHistory';
import { renamingRepository } from '../../../../helpers/gitFixtures';
import { entriesOf } from './historyFixtures';
import {
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

const fastImported = (count: number, from: string) =>
  Array.from(
    { length: count },
    (_, index) =>
      `commit refs/heads/main\ncommitter Test <test@example.com> ${index + 1} +0000\ndata 0\n${index === 0 ? from : ''}\n`,
  ).join('');

suite('Git history', () => {
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;

  beforeAll(async () => {
    ({ temp } = await renamingRepository('history'));
    gitPath = temp.gitPath;
    cwd = temp.root;
  });

  afterAll(() => removeFolder(cwd));

  test('lists the history of HEAD, the branches, the remotes and the tags, and only of HEAD when solo', async () => {
    const [first, tree] = await temp.resolve('HEAD~2', 'HEAD^{tree}');
    const refs = [
      'refs/heads/side',
      'refs/remotes/origin/side',
      'refs/tags/side',
    ];
    const sides: string[] = [];
    for (const ref of refs) {
      const side = (
        await temp.git('commit-tree', tree, '-p', first, '-m', ref)
      ).trim();
      await temp.git('update-ref', ref, side);
      sides.push(side);
    }
    try {
      const all = entriesOf(await listHistory(gitPath, cwd));
      const solo = entriesOf(await listHistory(gitPath, cwd, true));
      for (const [index, side] of sides.entries()) {
        assert.ok(
          all.some((entry) => entry.hash === side),
          refs[index],
        );
      }
      assert.strictEqual(solo.length, 3);
    } finally {
      for (const ref of refs) {
        await temp.git('update-ref', '-d', ref);
      }
    }
  });

  test('lists the whole history however much git prints, as one of over 3 million commits printed over 256 MB', async () => {
    const [head] = await temp.resolve('HEAD');
    const stash = 'a'.repeat(40);
    const printing = `
      const hidden = 'b'.repeat(65535);
      process.stdout.write('${stash} ${'c'.repeat(40)} ' + hidden + '\\n');
      let left = 4200;
      const write = () => {
        while (left-- > 0) {
          if (!process.stdout.write(hidden + '\\n')) {
            process.stdout.once('drain', write);
            return;
          }
        }
        process.stdout.end('${head}\\n');
      };
      write();
    `;
    const childProcess = process.getBuiltinModule('node:child_process');
    const { spawn } = childProcess;
    replaceBuiltin(
      childProcess,
      'spawn',
      (command: string, args: readonly string[], options: SpawnOptions) =>
        args.includes('rev-list')
          ? spawn(process.execPath, ['-e', printing], options)
          : spawn(command, args, options),
    );
    try {
      const history = await listHistory(gitPath, cwd, false, [stash]);
      assert.ok(history.has(head));
      assert.ok(history.has(stash));
    } finally {
      replaceBuiltin(childProcess, 'spawn', spawn);
    }
  });

  test('lists the commits a stash keeps its index and untracked files in when a ref points at them, as their tips missing from the history read it whole again on every refresh', async () => {
    const folder = tempFolder('stashTips');
    try {
      const repository = await tempRepository(folder);
      await repository.commit('a', { 'a.txt': 'a\n' });
      fs.writeFileSync(path.join(folder, 'a.txt'), 'changed\n');
      fs.writeFileSync(path.join(folder, 'new.txt'), 'new\n');
      await repository.git('stash', 'push', '-q', '--include-untracked');
      await repository.git('tag', 'index', 'stash@{0}^2');
      await repository.git('branch', 'untracked', 'stash@{0}^3');
      const [index, untracked] = await repository.resolve('index', 'untracked');
      const { head, refs, stashes } = await readRefs(gitPath, folder);
      const history = await listHistory(
        gitPath,
        folder,
        false,
        stashes.map((stash) => stash.commit),
        undefined,
        tipsInGitOrder(head, refs, false, stashes),
      );
      assert.ok(history.has(index));
      assert.ok(history.has(untracked));
    } finally {
      removeFolder(folder);
    }
  });

  test('lists the newest commits of HEAD, of the stashes and of the tips given, as many as asked, in the order of the whole history, read whole only when it has fewer', async () => {
    const [first, tree] = await temp.resolve('HEAD~2', 'HEAD^{tree}');
    const side = (
      await temp.git('commit-tree', tree, '-p', first, '-m', 'side')
    ).trim();
    const stash = (
      await temp.git('commit-tree', tree, '-p', first, '-m', 'stash')
    ).trim();
    const solo = entriesOf(await listHistory(gitPath, cwd, true));
    const recent = async (
      tips: string[],
      count: number,
      stashes: string[] = [],
    ) => {
      const { history, whole } = await listRecentHistory(
        gitPath,
        cwd,
        tips,
        stashes,
        count,
      );
      return { history: entriesOf(history), whole };
    };
    assert.deepStrictEqual(await recent([], 2), {
      history: solo.slice(0, 2),
      whole: false,
    });
    const { history } = await recent([side], 2);
    assert.deepStrictEqual(
      history.map((entry) => entry.hash),
      [side, solo[0].hash],
    );
    const { history: stashed } = await recent([side], 2, [stash]);
    assert.deepStrictEqual(
      stashed.map((entry) => entry.hash),
      [stash, side],
    );
    assert.deepStrictEqual(await recent([], 3), {
      history: solo,
      whole: false,
    });
    assert.deepStrictEqual(await recent([], 4), {
      history: solo,
      whole: true,
    });
  });

  test('lists at most the newest 5000 commits unless asked for more, as reading the whole history takes seconds in large repositories', async () => {
    const folder = tempFolder('recent5000');
    try {
      const repository = await tempRepository(folder);
      await runGit(repository.gitPath, folder, ['fast-import', '--quiet'], {
        input: fastImported(4999, ''),
      });
      const recent = () => listRecentHistory(repository.gitPath, folder, []);
      assert.strictEqual((await recent()).whole, true);
      await runGit(repository.gitPath, folder, ['fast-import', '--quiet'], {
        input: fastImported(1, 'from refs/heads/main^0\n'),
      });
      const { history, whole } = await recent();
      assert.deepStrictEqual([history.size, whole], [5000, false]);
    } finally {
      removeFolder(folder);
    }
  });
});

suite('Git history of a repository without commits', () => {
  let gitPath: string;
  let cwd: string;

  beforeAll(async () => {
    const repository = await tempRepository(tempFolder('empty'));
    gitPath = repository.gitPath;
    cwd = repository.root;
  });

  afterAll(() => removeFolder(cwd));

  test('has no HEAD and an empty history', async () => {
    assert.strictEqual(await headCommit(gitPath, cwd), undefined);
    assert.deepStrictEqual(entriesOf(await listHistory(gitPath, cwd)), []);
  });
});
