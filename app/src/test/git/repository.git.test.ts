import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { createServer } from 'node:http';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  fetchAllRemotes,
  pushRef,
  readHead,
  readRefs,
  repositoryRoot,
} from '../../git/repository';
import { gitErrorText } from '../../git/errorText';
import { renamingRepository } from '../gitFixtures';
import {
  asIfOwnedByAnother,
  gitsStarted,
  removeFolder,
  savedEnv,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../repositories';

suite('Git repository', () => {
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;
  let rename: string;
  let blob: string;

  beforeAll(async () => {
    ({ temp, rename, blob } = await renamingRepository('repository'));
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

  test('finds the root of the repository a folder is in, spelled the way the folder was given, or none', async () => {
    fs.mkdirSync(path.join(cwd, 'inner'), { recursive: true });
    assert.strictEqual(
      await repositoryRoot(gitPath, path.join(cwd, 'inner')),
      path.resolve(cwd),
    );
    const outside = tempFolder('outside');
    try {
      const link = path.join(outside, 'link');
      fs.symlinkSync(cwd, link, 'junction');
      assert.strictEqual(
        await repositoryRoot(gitPath, path.join(link, 'inner')),
        link,
      );
      assert.strictEqual(await repositoryRoot(gitPath, outside), undefined);
    } finally {
      removeFolder(outside);
    }
  });

  test('finds the root of the repository a folder is in through a link to it, which git follows before going up', async () => {
    fs.mkdirSync(path.join(cwd, 'sub', 'deep'), { recursive: true });
    const outside = tempFolder('link');
    try {
      const link = path.join(outside, 'link');
      fs.symlinkSync(path.join(cwd, 'sub', 'deep'), link, 'junction');
      const root = await repositoryRoot(gitPath, link);
      assert.ok(root !== undefined);
      assert.strictEqual(
        fs.realpathSync.native(root),
        fs.realpathSync.native(cwd),
      );
    } finally {
      removeFolder(outside);
    }
  });

  test('finds no root in a folder that is gone', async () => {
    const gone = tempFolder('gone');
    removeFolder(gone);
    assert.strictEqual(await repositoryRoot(gitPath, gone), undefined);
  });

  test('says what git said when it refuses a repository, not that there is none', async () => {
    await asIfOwnedByAnother(cwd, () =>
      assert.rejects(repositoryRoot(gitPath, cwd), (error) => {
        assert.match(gitErrorText(error), /^fatal: detected dubious ownership/);
        return true;
      }),
    );
  });

  test('finds no root in a bare repository or a git folder, which have no working tree', async () => {
    const bare = await tempRepository(tempFolder('bare'), { bare: true });
    try {
      assert.strictEqual(await repositoryRoot(gitPath, bare.root), undefined);
      assert.strictEqual(
        await repositoryRoot(gitPath, path.join(cwd, '.git')),
        undefined,
      );
    } finally {
      removeFolder(bare.root);
    }
  });

  test('tells whether a fetch changed any ref: moved, made or pruned', async () => {
    const folder = tempFolder('fetched');
    try {
      const upstream = await tempRepository(path.join(folder, 'upstream'));
      await upstream.commit('one');
      await upstream.git('branch', 'gone');
      const local = await tempRepository(path.join(folder, 'local'));
      await local.git('remote', 'add', 'origin', upstream.root);
      const fetched = () => fetchAllRemotes(gitPath, local.root);
      assert.strictEqual(await fetched(), true, 'the first fetch');
      assert.strictEqual(await fetched(), false, 'nothing new');
      for (const [what, change] of Object.entries({
        'a commit': () => upstream.commit('two'),
        'a tag': () => upstream.git('tag', 'v1'),
        'a branch': () => upstream.git('branch', 'feature'),
        'a branch deleted': () => upstream.git('branch', '-D', 'gone'),
      })) {
        await change();
        assert.strictEqual(await fetched(), true, what);
        assert.strictEqual(await fetched(), false, `nothing after ${what}`);
      }
    } finally {
      removeFolder(folder);
    }
  });

  test("prunes the remote branches of a remote whose refspecs all write under refs/remotes, but leaves another remote's refspec writing tags to the user's settings, keeping a tag of theirs", async () => {
    const folder = tempFolder('pruned');
    try {
      const upstream = await tempRepository(path.join(folder, 'upstream'));
      await upstream.commit('one');
      await upstream.git('branch', 'gone');
      const local = await tempRepository(path.join(folder, 'local'));
      for (const remote of ['origin', 'my.fork']) {
        await local.git('remote', 'add', remote, upstream.root);
      }
      await local.git(
        'config',
        '--add',
        'remote.origin.fetch',
        '+refs/tags/*:refs/tags/*',
      );
      await fetchAllRemotes(gitPath, local.root);
      await local.git('tag', 'mine', 'refs/remotes/origin/main');
      await upstream.git('branch', '-D', 'gone');
      await fetchAllRemotes(gitPath, local.root);
      assert.deepStrictEqual(
        (
          await local.git(
            'for-each-ref',
            '--format=%(refname)',
            'refs/remotes/my.fork/gone',
            'refs/remotes/origin/gone',
            'refs/tags',
          )
        )
          .trim()
          .split('\n'),
        ['refs/remotes/origin/gone', 'refs/tags/mine'],
      );
    } finally {
      removeFolder(folder);
    }
  });

  test("keeps the branches and stash of a mirror's worktree, which the mirror's refspec writes to", async () => {
    const folder = tempFolder('mirror');
    try {
      const upstream = await tempRepository(path.join(folder, 'upstream'));
      await upstream.commit('one');
      const mirror = path.join(folder, 'mirror.git');
      const worktree = path.join(folder, 'worktree');
      await upstream.git('clone', '-q', '--mirror', upstream.root, mirror);
      await upstream.git(
        '-C',
        mirror,
        'worktree',
        'add',
        '-q',
        '-b',
        'mine',
        worktree,
      );
      fs.writeFileSync(path.join(worktree, 'work.txt'), 'work\n');
      await upstream.git('-C', worktree, 'add', 'work.txt');
      await upstream.git('-C', worktree, 'commit', '-q', '-m', 'work');
      fs.writeFileSync(path.join(worktree, 'work.txt'), 'more work\n');
      await upstream.git('-C', worktree, 'stash', '-q');
      await fetchAllRemotes(gitPath, worktree);
      assert.deepStrictEqual(
        (
          await upstream.git(
            '-C',
            worktree,
            'for-each-ref',
            '--format=%(refname)',
            'refs/heads/mine',
            'refs/stash',
          )
        )
          .trim()
          .split('\n'),
        ['refs/heads/mine', 'refs/stash'],
      );
    } finally {
      removeFolder(folder);
    }
  });

  test('leaves pruning to the user where they set it for every remote or for one', async () => {
    const folder = tempFolder('prune-set');
    try {
      const upstream = await tempRepository(path.join(folder, 'upstream'));
      await upstream.commit('one');
      const local = await tempRepository(path.join(folder, 'local'));
      await local.git('remote', 'add', 'origin', upstream.root);
      const gone = async () =>
        (
          await local.git(
            'for-each-ref',
            '--format=%(refname)',
            'refs/remotes/origin/gone',
          )
        ).trim();
      for (const setting of ['fetch.prune', 'remote.origin.prune']) {
        await upstream.git('branch', 'gone');
        await fetchAllRemotes(gitPath, local.root);
        await upstream.git('branch', '-D', 'gone');
        await local.git('config', setting, 'false');
        await fetchAllRemotes(gitPath, local.root);
        assert.strictEqual(await gone(), 'refs/remotes/origin/gone', setting);
        await local.git('config', '--unset', setting);
        await fetchAllRemotes(gitPath, local.root);
        assert.strictEqual(await gone(), '', `${setting} unset`);
      }
    } finally {
      removeFolder(folder);
    }
  });

  test('gives up on a fetch that prints nothing for 5 minutes, saying it stalled', async () => {
    await temp.git('remote', 'add', 'stalled', 'ssh://stalled.invalid/x');
    await temp.git('config', 'core.sshCommand', "sh -c 'sleep 15' --");
    const original = globalThis.setTimeout;
    const waits: number[] = [];
    Reflect.set(
      globalThis,
      'setTimeout',
      (handler: () => void, ms: number, ...rest: unknown[]) => {
        waits.push(ms);
        return original(handler, ms === 300_000 ? 500 : ms, ...rest);
      },
    );
    try {
      const started = performance.now();
      await assert.rejects(
        fetchAllRemotes(gitPath, cwd),
        /git fetch printed nothing for 300 seconds, so it was stopped/,
      );
      assert.ok(performance.now() - started < 5000);
      assert.ok(waits.includes(300_000), waits.join(' '));
    } finally {
      Reflect.set(globalThis, 'setTimeout', original);
      await temp.git('config', '--unset', 'core.sshCommand');
      await temp.git('remote', 'remove', 'stalled');
    }
  });

  test('keeps fetching and pushing while git prints anything, however long that takes, giving up only once it prints nothing for the whole timeout', async () => {
    const folder = tempFolder('slow-remote');
    const slowly = (command: string, saying: string): string => {
      const script = path
        .join(folder, `${command}-${saying ? 'chatty' : 'quiet'}.sh`)
        .replaceAll('\\', '/');
      fs.writeFileSync(
        script,
        `#!/bin/sh\ni=0\nwhile [ $i -lt 15 ]; do ${saying}sleep 0.2; i=$((i+1)); done\nexec git ${command} "$@"\n`,
        { mode: 0o755 },
      );
      return script;
    };
    try {
      const upstream = await tempRepository(path.join(folder, 'upstream'), {
        bare: true,
      });
      const local = await tempRepository(path.join(folder, 'local'));
      await local.commit('one');
      await local.git('remote', 'add', 'origin', upstream.root);
      const chatty = 'echo working >&2; ';
      const options = { timeout: 2000 };
      const push = () =>
        pushRef(
          gitPath,
          local.root,
          'origin',
          'refs/heads/main',
          'refs/heads/main',
          options,
        );
      await local.git(
        'config',
        'remote.origin.receivepack',
        slowly('receive-pack', chatty),
      );
      await push();
      await local.git(
        'config',
        'remote.origin.uploadpack',
        slowly('upload-pack', chatty),
      );
      await assert.doesNotReject(fetchAllRemotes(gitPath, local.root, options));
      await local.commit('two');
      await local.git(
        'config',
        'remote.origin.receivepack',
        slowly('receive-pack', ''),
      );
      await assert.rejects(
        push(),
        /git push printed nothing for 2 seconds, so it was stopped/,
      );
      await local.git(
        'config',
        'remote.origin.uploadpack',
        slowly('upload-pack', ''),
      );
      await assert.rejects(
        fetchAllRemotes(gitPath, local.root, options),
        /git fetch printed nothing for 2 seconds, so it was stopped/,
      );
    } finally {
      removeFolder(folder);
    }
  });

  test('lets only an interactive fetch ask for credentials with a program the user set, in any of the ways git takes one', async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests++;
      response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="locked"' });
      response.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    assert.ok(typeof address === 'object' && address !== null);
    await temp.git(
      'remote',
      'add',
      'locked',
      `http://127.0.0.1:${address.port}/x`,
    );
    await temp.git('config', 'credential.helper', '');
    const folder = tempFolder('askpass');
    const variables = ['GIT_ASKPASS', 'SSH_ASKPASS'];
    const restoreEnv = savedEnv(variables);
    try {
      for (const way of ['GIT_ASKPASS', 'core.askPass', 'SSH_ASKPASS']) {
        const asked = path.join(folder, `asked-${way}`).replaceAll('\\', '/');
        const askpass = path
          .join(folder, `askpass-${way}.sh`)
          .replaceAll('\\', '/');
        fs.writeFileSync(
          askpass,
          `#!/bin/sh\necho "$1" >> '${asked}'\necho x\n`,
          { mode: 0o755 },
        );
        for (const name of variables) {
          delete process.env[name];
        }
        if (way === 'core.askPass') {
          await temp.git('config', way, askpass);
        } else {
          process.env[way] = askpass;
        }
        try {
          requests = 0;
          await assert.rejects(
            fetchAllRemotes(gitPath, cwd, { interactive: false }),
            /could not read Username for '.*': terminal prompts disabled/,
          );
          assert.ok(requests > 0, way);
          assert.strictEqual(fs.existsSync(asked), false, way);
          await assert.rejects(
            fetchAllRemotes(gitPath, cwd),
            /Authentication failed/,
          );
          assert.match(fs.readFileSync(asked, 'utf8'), /^Username/, way);
        } finally {
          if (way === 'core.askPass') {
            await temp.git('config', '--unset', way);
          }
        }
      }
    } finally {
      restoreEnv();
      await temp.git('config', '--unset', 'credential.helper');
      await temp.git('remote', 'remove', 'locked');
      await new Promise((resolve) => server.close(resolve));
      removeFolder(folder);
    }
  });
});
