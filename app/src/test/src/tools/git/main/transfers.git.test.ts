import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { createServer } from 'node:http';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  fetchAllRemotes,
  listRemoteTags,
  pushRef,
  remotesNotFetched,
} from '../../../../../tools/git/main/transfers';
import { gitErrorText } from '../../../../../lib/main/errorText';
import { waitFor } from '../../../../helpers/fixtures';
import { renamingRepository } from '../../../../helpers/gitFixtures';
import {
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';
import { savedEnv, withEnv } from '../../../../helpers/env';

suite('Git repository', () => {
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;

  beforeAll(async () => {
    ({ temp } = await renamingRepository('repository'));
    gitPath = temp.gitPath;
    cwd = temp.root;
  });

  afterAll(() => removeFolder(cwd));

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

  test('keeps fetching and pushing while git prints anything, however long that takes, giving up only once it prints nothing for the whole timeout, the git that prints given three times the timeout of the quiet one, as a machine kept busy by other tests took over two seconds to start the programs between two prints and a git that was printing was stopped', async () => {
    const folder = tempFolder('slow-remote');
    const slowly = (
      command: string,
      saying: string,
      { timeout }: { readonly timeout: number },
    ): string => {
      const script = path
        .join(folder, `${command}-${saying ? 'chatty' : 'quiet'}.sh`)
        .replaceAll('\\', '/');
      fs.writeFileSync(
        script,
        `#!/bin/sh\ni=0\nwhile [ $i -lt ${Math.ceil(timeout / 200) + 2} ]; do ${saying}sleep 0.2; i=$((i+1)); done\nexec git ${command} "$@"\n`,
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
      const whilePrinting = { timeout: 6000 };
      const whileQuiet = { timeout: 2000 };
      const push = (options: { readonly timeout: number }) =>
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
        slowly('receive-pack', chatty, whilePrinting),
      );
      await push(whilePrinting);
      await local.git(
        'config',
        'remote.origin.uploadpack',
        slowly('upload-pack', chatty, whilePrinting),
      );
      await assert.doesNotReject(
        fetchAllRemotes(gitPath, local.root, whilePrinting),
      );
      await local.commit('two');
      await local.git(
        'config',
        'remote.origin.receivepack',
        slowly('receive-pack', '', whileQuiet),
      );
      await assert.rejects(
        push(whileQuiet),
        /git push printed nothing for 2 seconds, so it was stopped/,
      );
      await local.git(
        'config',
        'remote.origin.uploadpack',
        slowly('upload-pack', '', whileQuiet),
      );
      await assert.rejects(
        fetchAllRemotes(gitPath, local.root, whileQuiet),
        /git fetch printed nothing for 2 seconds, so it was stopped/,
      );
    } finally {
      removeFolder(folder);
    }
  }, 120_000);

  test('says why a fetch failed without the progress git printed before it, keeping the lines ssh ends with a carriage return', async () => {
    const folder = tempFolder('failing-remote');
    try {
      const local = await tempRepository(path.join(folder, 'local'));
      const failing = path
        .join(folder, 'failing-upload-pack.sh')
        .replaceAll('\\', '/');
      fs.writeFileSync(
        failing,
        "#!/bin/sh\nprintf 'remote: Enumerating objects: 2, done.\\nReceiving objects:  50%% (1/2)\\rReceiving objects: 100%% (2/2), done.\\nssh: Could not resolve hostname nowhere: Name or service not known\\r\\nfatal: the pack broke\\n' >&2\nexit 1\n",
        { mode: 0o755 },
      );
      await local.git('remote', 'add', 'origin', path.join(folder, 'any'));
      await local.git('config', 'remote.origin.uploadpack', failing);
      const error: unknown = await fetchAllRemotes(gitPath, local.root).then(
        () => undefined,
        (failed: unknown) => failed,
      );
      const said = gitErrorText(error);
      assert.match(
        said,
        /^ssh: Could not resolve hostname nowhere: Name or service not known$/m,
      );
      assert.match(said, /^fatal: the pack broke$/m);
      assert.doesNotMatch(said, /objects/);
    } finally {
      removeFolder(folder);
    }
  });

  test("fetches with git's messages in English, leaving the user's locale to ssh and the hooks, as which remotes could not be fetched is read from what git says", async () => {
    const folder = tempFolder('fetch-language');
    const seen = path.join(folder, 'seen.txt').replaceAll('\\', '/');
    try {
      const local = await tempRepository(path.join(folder, 'local'));
      await local.git('remote', 'add', 'gone', 'ssh://gone.invalid/x');
      await local.git('remote', 'add', 'missing', path.join(folder, 'missing'));
      await local.git(
        'config',
        'core.sshCommand',
        `echo "[$LANGUAGE][$LC_ALL]" > '${seen}'; false`,
      );
      await withEnv({ LANGUAGE: 'de', LC_ALL: 'de_DE.UTF-8' }, () =>
        assert.rejects(fetchAllRemotes(gitPath, local.root), (error) => {
          assert.deepStrictEqual(
            remotesNotFetched(gitErrorText(error)).toSorted(),
            ['gone', 'missing'],
          );
          return true;
        }),
      );
      assert.strictEqual(
        fs.readFileSync(seen, 'utf8').trim(),
        '[C][de_DE.UTF-8]',
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

  suite(
    'fetching from remotes in folders of their own',
    { concurrent: true, timeout: 60_000 },
    () => {
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
            assert.strictEqual(
              await gone(),
              'refs/remotes/origin/gone',
              setting,
            );
            await local.git('config', '--unset', setting);
            await fetchAllRemotes(gitPath, local.root);
            assert.strictEqual(await gone(), '', `${setting} unset`);
          }
        } finally {
          removeFolder(folder);
        }
      });

      test('prunes the remote branches of a remote but keeps a tag of the user, though they set tags to be pruned for every remote or for one, as git prunes tags only once told to prune', async () => {
        const folder = tempFolder('prune-tags');
        try {
          const upstream = await tempRepository(path.join(folder, 'upstream'));
          await upstream.commit('one');
          const local = await tempRepository(path.join(folder, 'local'));
          await local.git('remote', 'add', 'origin', upstream.root);
          for (const setting of [
            'fetch.pruneTags',
            'remote.origin.pruneTags',
          ]) {
            await upstream.git('branch', 'gone');
            await fetchAllRemotes(gitPath, local.root);
            await local.git('tag', 'mine', 'refs/remotes/origin/main');
            await upstream.git('branch', '-D', 'gone');
            await local.git('config', setting, 'true');
            await fetchAllRemotes(gitPath, local.root);
            assert.deepStrictEqual(
              (
                await local.git(
                  'for-each-ref',
                  '--format=%(refname)',
                  'refs/remotes/origin/gone',
                  'refs/tags',
                )
              )
                .trim()
                .split('\n'),
              ['refs/tags/mine'],
              setting,
            );
            await local.git('config', '--unset', setting);
            await local.git('tag', '-d', 'mine');
          }
        } finally {
          removeFolder(folder);
        }
      });

      test("runs no maintenance of git's own after a fetch, as one stopped midway on Windows left its locks behind", async () => {
        const folder = tempFolder('fetch-maintenance');
        try {
          const upstream = await tempRepository(path.join(folder, 'upstream'));
          await upstream.commit('one');
          const local = await tempRepository(path.join(folder, 'local'));
          await local.git('remote', 'add', 'origin', upstream.root);
          for (const [key, value] of [
            ['maintenance.autoDetach', 'false'],
            ['maintenance.gc.enabled', 'false'],
            ['maintenance.commit-graph.enabled', 'true'],
            ['maintenance.commit-graph.auto', '-1'],
          ]) {
            await local.git('config', key, value);
          }
          await fetchAllRemotes(gitPath, local.root);
          assert.deepStrictEqual(
            fs.readdirSync(path.join(local.root, '.git', 'objects', 'info')),
            [],
          );
        } finally {
          removeFolder(folder);
        }
      });

      test('leaves no ref locked once a fetch is stopped while it writes the refs, as Windows stops git with no chance to remove its locks, and every later fetch failed', async () => {
        const folder = tempFolder('fetch-stopped');
        const started = path.join(folder, 'started').replaceAll('\\', '/');
        try {
          const upstream = await tempRepository(path.join(folder, 'upstream'));
          await upstream.commit('one');
          await upstream.git('tag', 'v1');
          const local = await tempRepository(path.join(folder, 'local'));
          await local.git('remote', 'add', 'origin', upstream.root);
          const hook = path.join(
            local.root,
            '.git',
            'hooks',
            'reference-transaction',
          );
          fs.mkdirSync(path.dirname(hook), { recursive: true });
          fs.writeFileSync(
            hook,
            `#!/bin/sh\nif [ "$1" = prepared ]; then echo > '${started}'; sleep 15; fi\n`,
            { mode: 0o755 },
          );
          const stop = new AbortController();
          const fetching = assert.rejects(
            fetchAllRemotes(gitPath, local.root, { stop: stop.signal }),
          );
          await waitFor(() => fs.existsSync(started), 'the refs to be locked');
          stop.abort();
          await fetching;
          const locks = fs
            .readdirSync(path.join(local.root, '.git'), { recursive: true })
            .map(String)
            .filter((entry) => entry.endsWith('.lock'));
          assert.deepStrictEqual(locks, []);
          fs.rmSync(hook);
          assert.strictEqual(await fetchAllRemotes(gitPath, local.root), true);
        } finally {
          removeFolder(folder);
        }
      });
    },
  );
});

suite('Git remote tags', () => {
  let folder: string;
  let repository: TempRepository;
  let remote: TempRepository;

  beforeAll(async () => {
    folder = tempFolder('remote-tags');
    remote = await tempRepository(path.join(folder, 'remote'), { bare: true });
    repository = await tempRepository(path.join(folder, 'local'));
    await repository.commit('a');
    await repository.commit('b');
    await repository.git('remote', 'add', 'origin', remote.root);
  });

  afterAll(() => removeFolder(folder));

  test("lists a remote's tags by the commit each points at, an annotated one by its commit rather than the tag object", async () => {
    const [a, b] = await repository.resolve('main~1', 'main');
    await repository.git('tag', 'light', a);
    await repository.git('tag', '-a', 'annotated', '-m', 'release', b);
    await repository.git('push', 'origin', 'main', '--tags');
    assert.deepStrictEqual(
      await listRemoteTags(repository.gitPath, repository.root, 'origin'),
      new Map([
        ['annotated', b],
        ['light', a],
      ]),
    );
  });

  test('lists no tags of a remote that has none', async () => {
    const empty = await tempRepository(path.join(folder, 'empty'), {
      bare: true,
    });
    await repository.git('remote', 'add', 'empty', empty.root);
    try {
      assert.deepStrictEqual(
        await listRemoteTags(repository.gitPath, repository.root, 'empty'),
        new Map(),
      );
    } finally {
      await repository.git('remote', 'remove', 'empty');
    }
  });

  test('fails for a remote it cannot reach, rather than saying it has no tags', async () => {
    await repository.git('remote', 'add', 'gone', path.join(folder, 'nowhere'));
    try {
      await assert.rejects(
        listRemoteTags(repository.gitPath, repository.root, 'gone'),
      );
    } finally {
      await repository.git('remote', 'remove', 'gone');
    }
  });
});
