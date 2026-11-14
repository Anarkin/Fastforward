import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  showFiles,
  commitPatch,
  type PatchScope,
} from '../../../../../tools/git/main/cli/diff';
import { keptFirstParent } from '../../../../../tools/git/main/cli/files';
import {
  keepGitRunningWhile,
  keptGits,
  runGit,
} from '../../../../../tools/git/main/cli/run';
import { patchByteBudget } from '../../../../../tools/git/shared/protocol';
import {
  gitsStarted,
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../support/repositories';

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

  test('gives the patch git show gives whatever the diff config of the repository says, as diff-tree reads less of it than git show', async () => {
    const { root } = repository;
    const order = path.join(tempFolder('kept-order'), 'order');
    fs.writeFileSync(order, 'tool.sh\n*\n');
    const config = [
      ['diff.context', '1'],
      ['diff.interHunkContext', '5'],
      ['diff.orderFile', order],
      ['diff.indentHeuristic', 'false'],
    ];
    for (const [key = '', value = ''] of config) {
      await repository.git('config', key, value);
    }
    try {
      const started = await read(false);
      const kept = await read(true);

      assert.deepStrictEqual(kept, started);
    } finally {
      for (const [key = ''] of config) {
        await repository.git('config', '--unset', key);
      }
      removeFolder(path.dirname(order));
      keptGits.stopIn(root);
    }
  });

  test('reads the files of a commit and of those after it right though a file is named as what ends an answer, as a file can be named as the marker', async () => {
    const { gitPath, root } = repository;
    const [blob = ''] = await repository.resolve('HEAD:a.txt');
    const tree = async (...names: string[]) =>
      (
        await runGit(gitPath, root, ['mktree', '-z'], {
          input: names.map((name) => `100644 blob ${blob}\t${name}\0`).join(''),
        })
      ).trim();
    const commit = async (made: string, ...parents: string[]) =>
      (
        await repository.git(
          'commit-tree',
          made,
          ...parents.flatMap((parent) => ['-p', parent]),
          '-m',
          'named',
        )
      ).trim();
    const forged = '\u0001fastforward-diff-tree x';
    const base = await commit(await tree('z.txt'));
    const named = await commit(await tree(forged, 'z.txt'), base);
    const after = await commit(await tree(forged, 'n.txt', 'z.txt'), named);
    const files = async (kept: boolean) => {
      keepGitRunningWhile(() => kept);
      try {
        return [
          await showFiles(gitPath, root, named),
          await showFiles(gitPath, root, after),
        ].map((changes) => changes.map((change) => change.path));
      } finally {
        keepGitRunningWhile(() => false);
      }
    };

    const started = await files(false);
    assert.deepStrictEqual(started, [[forged], ['n.txt']]);
    assert.deepStrictEqual(await files(true), started);
  });

  test('starts no git for a commit no longer wanted, as on closing its tab, rejecting as asked rather than reading it to the end', async () => {
    const { gitPath, root } = repository;
    const [hash = ''] = commits;
    const reason = new Error('closed');
    keptGits.stopIn(root);
    keepGitRunningWhile(() => true);
    try {
      const { result, gits } = await gitsStarted(() =>
        Promise.allSettled([
          showFiles(gitPath, root, hash, AbortSignal.abort(reason)),
          commitPatch(gitPath, root, hash, {}, AbortSignal.abort(reason)),
        ]),
      );

      assert.deepStrictEqual(
        result.map((settled) =>
          settled.status === 'rejected' ? settled.reason : settled.value,
        ),
        [reason, reason],
      );
      assert.strictEqual(gits, 0);
    } finally {
      keepGitRunningWhile(() => false);
    }
  });

  test('names no first parent for a tag, which diff-tree would not answer for, holding up the requests after it', async () => {
    const { gitPath, root } = repository;
    await repository.git('tag', '-a', '-m', 'tagged', 'tagged', 'HEAD');
    keepGitRunningWhile(() => true);
    try {
      const [tag = ''] = await repository.resolve('refs/tags/tagged');
      const [head = ''] = await repository.resolve('HEAD');

      assert.notStrictEqual(tag, head);
      assert.strictEqual(await keptFirstParent(gitPath, root, tag), undefined);
      assert.ok(await keptFirstParent(gitPath, root, head));
    } finally {
      keepGitRunningWhile(() => false);
      await repository.git('tag', '-d', 'tagged');
    }
  });

  test('stops reading a patch past its budget as a git started for it does, stopping the git kept so the rest it prints is not read', async () => {
    const large = tempFolder('kept-large');
    try {
      const big = await tempRepository(large);
      await big.commit('small', { 'small.txt': 'small\n' });
      await big.commit('large', {
        'large.txt': `${'x'.repeat(200)}\n`.repeat(
          Math.ceil((patchByteBudget * 2) / 201),
        ),
      });
      await big.commit('after', { 'small.txt': 'after\n' });
      const [hash = '', next = ''] = await big.resolve('HEAD~1', 'HEAD');
      const patch = async (of: string) => {
        const { exited: _, ...patched } = await commitPatch(
          big.gitPath,
          big.root,
          of,
        );
        return patched;
      };
      keepGitRunningWhile(() => false);
      const started = await patch(hash);
      const startedNext = await patch(next);
      keepGitRunningWhile(() => true);
      const kept = await patch(hash);
      const again = [await patch(hash), await patch(next)];
      const after = await showFiles(big.gitPath, big.root, hash);

      assert.strictEqual(started.stopped, true);
      assert.deepStrictEqual(kept, started);
      assert.deepStrictEqual(again, [started, startedNext]);
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
