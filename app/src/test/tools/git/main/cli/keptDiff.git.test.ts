import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  showFiles,
  commitPatch,
  type PatchScope,
} from '../../../../../tools/git/main/cli/diff';
import {
  keepGitRunningWhile,
  keptGits,
} from '../../../../../tools/git/main/cli/run';
import { patchByteBudget } from '../../../../../tools/git/shared/protocol';
import {
  gitsStarted,
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../repositories';

const scopes: PatchScope[] = [
  {},
  { ignoreWhitespace: true },
  { entireFile: true },
];

suite('Commit diffs read through a git kept running', () => {
  let folder: string;
  let repository: TempRepository;
  let commits: string[];

  beforeAll(async () => {
    folder = tempFolder('kept-diff');
    repository = await tempRepository(folder);
    const { root } = repository;
    await repository.commit('root', {
      'a.txt': 'one\ntwo\nthree\n',
      'moved.txt': 'line 1\nline 2\nline 3\nline 4\nline 5\n',
      'tool.sh': 'echo hi\n',
    });
    await repository.commit('change', { 'a.txt': 'one\n2\nthree\n' });
    await repository.git('mv', 'moved.txt', 'renamed.txt');
    await repository.commit('rename', {
      'renamed.txt': 'line 1\nline 2\nline 3\nline 4\nline five\n',
    });
    await repository.commit('binary', {
      'image.bin': Buffer.from([0, 1, 2, 3]).toString('latin1'),
    });
    await repository.git('update-index', '--chmod=+x', 'tool.sh');
    await repository.git('commit', '-q', '-m', 'mode');
    await repository.git('commit', '-q', '--allow-empty', '-m', 'empty');
    await repository.commit('whitespace', { 'a.txt': 'one\n  2\nthree\n' });
    await repository.git('checkout', '-q', '-b', 'side', 'HEAD~2');
    fs.writeFileSync(path.join(root, 'side.txt'), 'side\n');
    await repository.git('add', 'side.txt');
    await repository.git('commit', '-q', '-m', 'side');
    await repository.git('checkout', '-q', '-');
    await repository.git('merge', '-q', '--no-edit', 'side');
    commits = (await repository.git('rev-list', '--first-parent', 'HEAD'))
      .trim()
      .split('\n');
  });

  afterAll(() => {
    keepGitRunningWhile(() => false);
    keptGits.stopAll();
    removeFolder(folder);
  });

  async function read(kept: boolean) {
    keepGitRunningWhile(() => kept);
    try {
      const { gitPath, root } = repository;
      const results: unknown[] = [];
      for (const hash of commits) {
        results.push(await showFiles(gitPath, root, hash));
        for (const scope of scopes) {
          const { exited: _, ...patch } = await commitPatch(
            gitPath,
            root,
            hash,
            scope,
          );
          results.push(patch);
        }
      }
      return results;
    } finally {
      keepGitRunningWhile(() => false);
    }
  }

  test('gives the files and the patch git show gives for every kind of commit, a root, a rename, a binary file, a mode change, an empty commit, whitespace alone and a merge against its first parent, in each scope', async () => {
    const started = await read(false);
    const kept = await read(true);

    assert.strictEqual(commits.length, 8);
    assert.deepStrictEqual(kept, started);
  });

  test('gives the same files and patch however often a commit is read again, as git diff-tree reading commits from its input diffs a commit only the first time, which showed no changes for a commit selected again', async () => {
    const started = await read(false);
    const first = await read(true);
    const again = await gitsStarted(() => read(true));

    assert.deepStrictEqual(first, started);
    assert.deepStrictEqual(again.result, started);
  });

  test('starts no git for the commits read again but the root, which git shows the first time only, read by a git started for it', async () => {
    await read(true);
    const again = await gitsStarted(() => read(true));

    assert.strictEqual(again.gits, 1 + scopes.length);
  });

  test('stops reading a patch past its budget as a git started for it does, stopping the git kept so the rest it prints is not read', async () => {
    const large = tempFolder('kept-large');
    try {
      const big = await tempRepository(large);
      await big.commit('large', {
        'large.txt': `${'x'.repeat(200)}\n`.repeat(
          Math.ceil((patchByteBudget * 2) / 201),
        ),
      });
      const [hash = ''] = await big.resolve('HEAD');
      keepGitRunningWhile(() => false);
      const { exited: _started, ...started } = await commitPatch(
        big.gitPath,
        big.root,
        hash,
      );
      keepGitRunningWhile(() => true);
      const { exited: _kept, ...kept } = await commitPatch(
        big.gitPath,
        big.root,
        hash,
      );
      const after = await showFiles(big.gitPath, big.root, hash);

      assert.strictEqual(started.stopped, true);
      assert.deepStrictEqual(kept, started);
      assert.deepStrictEqual(
        after.map((file) => file.path),
        ['large.txt'],
      );
    } finally {
      keepGitRunningWhile(() => false);
      keptGits.stopAll();
      removeFolder(large);
    }
  });
});
