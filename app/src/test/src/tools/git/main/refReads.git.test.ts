import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { readHead, readRefs } from '../../../../../tools/git/main/refReads';
import { renamingRepository } from '../../../../helpers/gitFixtures';
import {
  gitsStarted,
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';

suite('Git refs', () => {
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;
  let rename: string;
  let blob: string;

  beforeAll(async () => {
    ({ temp, rename, blob } = await renamingRepository('refReads'));
    gitPath = temp.gitPath;
    cwd = temp.root;
  });

  afterAll(() => removeFolder(cwd));

  test("lists branches, remote branches and tags, but not a remote's HEAD, though a branch on it may be named HEAD", async () => {
    await temp.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    await temp.git('update-ref', 'refs/remotes/origin/feature/HEAD', 'HEAD');
    await temp.git(
      'symbolic-ref',
      'refs/remotes/origin/HEAD',
      'refs/remotes/origin/main',
    );
    await temp.git('tag', 'v1');
    await temp.git('tag', '-a', '-m', 'annotated', 'v2');
    try {
      const { refs } = await readRefs(gitPath, cwd);
      assert.deepStrictEqual(
        refs.map(({ kind, name }) => `${kind} ${name}`).toSorted(),
        [
          'branch main',
          'remote origin/feature/HEAD',
          'remote origin/main',
          'tag v1',
          'tag v2',
        ],
      );
      assert.deepStrictEqual(
        new Set(refs.map((ref) => ref.commit)),
        new Set([rename]),
      );
    } finally {
      await temp.git('symbolic-ref', '-d', 'refs/remotes/origin/HEAD');
      await temp.git('update-ref', '-d', 'refs/remotes/origin/main');
      await temp.git('update-ref', '-d', 'refs/remotes/origin/feature/HEAD');
      await temp.git('tag', '-d', 'v1', 'v2');
    }
  });

  test('reads how far each branch is ahead of and behind its upstream, or that the upstream is gone, and nothing for a branch without one', async () => {
    const [base] = await temp.resolve('HEAD~1');
    const tree = (await temp.git('rev-parse', 'HEAD~1^{tree}')).trim();
    const apart = (
      await temp.git('commit-tree', tree, '-p', base, '-m', 'apart')
    ).trim();
    await temp.git('remote', 'add', 'origin', 'https://example.com/x.git');
    await temp.git('update-ref', 'refs/remotes/origin/main', base);
    await temp.git('update-ref', 'refs/remotes/origin/next', 'HEAD');
    const tracking = async (
      branch: string,
      start: string,
      upstream?: string,
    ) => {
      await temp.git('branch', branch, start);
      if (upstream) {
        await temp.git('branch', `--set-upstream-to=${upstream}`, branch);
      }
    };
    try {
      await temp.git('branch', '--set-upstream-to=origin/main', 'main');
      await tracking('lagging', base, 'origin/next');
      await tracking('apart', apart, 'origin/next');
      await tracking('even', 'HEAD', 'origin/next');
      await tracking('alone', 'HEAD');
      await tracking('follower', base, 'main');
      await tracking('orphaned', 'HEAD', 'origin/next');
      await temp.git('config', 'branch.orphaned.merge', 'refs/heads/deleted');
      const { refs } = await readRefs(gitPath, cwd);
      assert.deepStrictEqual(
        Object.fromEntries(
          refs
            .filter((ref) => ref.kind === 'branch')
            .map((ref) => [ref.name, ref.tracking]),
        ),
        {
          alone: undefined,
          apart: { upstream: 'origin/next', ahead: 1, behind: 1 },
          even: { upstream: 'origin/next', ahead: 0, behind: 0 },
          follower: { upstream: 'main', ahead: 0, behind: 1 },
          lagging: { upstream: 'origin/next', ahead: 0, behind: 1 },
          main: { upstream: 'origin/main', ahead: 1, behind: 0 },
          orphaned: { upstream: 'origin/deleted', gone: true },
        },
      );
    } finally {
      await temp.git('branch', '--unset-upstream', 'main');
      await temp.git(
        'branch',
        '-D',
        'lagging',
        'apart',
        'even',
        'alone',
        'follower',
        'orphaned',
      );
      await temp.git('remote', 'remove', 'origin');
    }
  });

  test('reads the date of the commit each ref points at, not of the annotated tag pointing at it, nor of when the ref was made or moved', async () => {
    const [second] = await temp.resolve('HEAD~1');
    await temp.git('tag', '-a', '-m', 'annotated', 'v1', second);
    try {
      const { dates } = await readRefs(gitPath, cwd);
      const dateOf = async (commit: string) =>
        Number((await temp.git('log', '-1', '--format=%ct', commit)).trim());
      assert.deepStrictEqual(
        dates,
        new Map([
          [rename, await dateOf(rename)],
          [second, await dateOf(second)],
        ]),
      );
    } finally {
      await temp.git('tag', '-d', 'v1');
    }
  });

  test('leaves out the tags that point at a tree or a blob', async () => {
    await temp.git('tag', 'tree', 'HEAD^{tree}');
    await temp.git('tag', '-a', '-m', 'blob', 'blob', blob);
    try {
      const { refs } = await readRefs(gitPath, cwd);
      assert.deepStrictEqual(
        refs.map(({ kind, name }) => `${kind} ${name}`),
        ['branch main'],
      );
    } finally {
      await temp.git('tag', '-d', 'tree', 'blob');
    }
  });

  test('reads the branch HEAD is on, or only its commit when detached', async () => {
    assert.deepStrictEqual(await readHead(gitPath, cwd), {
      name: 'main',
      commit: rename,
    });
    await temp.git('checkout', '-q', '--detach');
    try {
      assert.deepStrictEqual(await readHead(gitPath, cwd), {
        name: undefined,
        commit: rename,
      });
    } finally {
      await temp.git('checkout', '-q', 'main');
    }
  });

  test("reads the refs with one git each for HEAD's branch, HEAD's commit together with the shallow file, the refs, the remotes and the stashes", async () => {
    const folder = tempFolder('repository');
    try {
      const shallow = await tempRepository(path.join(folder, 'shallow'));
      await shallow.commit('one');
      await shallow.commit('two');
      const [head] = await shallow.resolve('HEAD');
      fs.writeFileSync(path.join(shallow.root, '.git', 'shallow'), `${head}\n`);
      await readRefs(gitPath, shallow.root);
      const { result, gits } = await gitsStarted(() =>
        readRefs(gitPath, shallow.root),
      );
      assert.strictEqual(result.shallow, `${head}\n`);
      assert.strictEqual(gits, 5);
    } finally {
      removeFolder(folder);
    }
  });

  test('tells whether the repository has a commit-graph, in one file or split, from a linked worktree too, as without one git sorts the whole history to read its newest commits', async () => {
    const folder = tempFolder('commitGraph');
    try {
      const repository = await tempRepository(path.join(folder, 'main'));
      await repository.commit('one');
      const linked = path.join(folder, 'linked');
      await repository.git('worktree', 'add', '-q', '--detach', linked);
      assert.strictEqual(
        (await readRefs(gitPath, repository.root)).commitGraph,
        false,
      );
      await repository.git('commit-graph', 'write', '--reachable');
      assert.strictEqual(
        (await readRefs(gitPath, repository.root)).commitGraph,
        true,
      );
      assert.strictEqual((await readRefs(gitPath, linked)).commitGraph, true);
      fs.rmSync(
        path.join(repository.root, '.git', 'objects', 'info', 'commit-graph'),
      );
      await repository.git('commit-graph', 'write', '--reachable', '--split');
      assert.strictEqual(
        (await readRefs(gitPath, repository.root)).commitGraph,
        true,
      );
    } finally {
      removeFolder(folder);
    }
  });

  test('tells which remote a remote branch is of, even one with a slash in its name', async () => {
    await temp.git('remote', 'add', 'team/fork', cwd);
    await temp.git('update-ref', 'refs/remotes/team/fork/main', 'HEAD');
    try {
      const { refs } = await readRefs(gitPath, cwd);
      assert.deepStrictEqual(
        refs.filter((ref) => ref.kind === 'remote'),
        [
          {
            kind: 'remote',
            name: 'team/fork/main',
            remote: 'team/fork',
            commit: rename,
          },
        ],
      );
    } finally {
      await temp.git('remote', 'remove', 'team/fork');
    }
  });

  test('reads the branch HEAD is on by its name, even with a tag of that name', async () => {
    await temp.git('tag', 'main');
    try {
      assert.strictEqual((await readHead(gitPath, cwd))?.name, 'main');
    } finally {
      await temp.git('tag', '-d', 'main');
    }
  });
});
