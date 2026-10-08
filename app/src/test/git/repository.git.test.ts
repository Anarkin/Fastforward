import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { createServer } from 'node:http';
import * as path from 'node:path';
import {
  fetchAllRemotes,
  readHead,
  readRefs,
  repositoryRoot,
} from '../../git/repository';
import { gitErrorText } from '../../git/errorText';
import { renamingRepository } from '../gitFixtures';
import {
  asIfOwnedByAnother,
  removeFolder,
  savedEnv,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../repositories';

suite('Git repository', function () {
  this.timeout(20_000);
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;
  let rename: string;
  let blob: string;

  suiteSetup(async () => {
    ({ temp, rename, blob } = await renamingRepository('repository'));
    gitPath = temp.gitPath;
    cwd = temp.root;
  });

  suiteTeardown(() => removeFolder(cwd));

  test("lists branches, remote branches and tags, but not a remote's HEAD", async () => {
    await temp.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
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
        ['branch main', 'remote origin/main', 'tag v1', 'tag v2'],
      );
      assert.deepStrictEqual(
        new Set(refs.map((ref) => ref.commit)),
        new Set([rename]),
      );
    } finally {
      await temp.git('symbolic-ref', '-d', 'refs/remotes/origin/HEAD');
      await temp.git('update-ref', '-d', 'refs/remotes/origin/main');
      await temp.git('tag', '-d', 'v1', 'v2');
    }
  });

  test('reads the date of the commit each ref points at, not of the annotated tag pointing at it', async () => {
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
    await asIfOwnedByAnother(() =>
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

  test('gives up on a fetch that stalls', async () => {
    await temp.git('remote', 'add', 'stalled', 'ssh://stalled.invalid/x');
    await temp.git('config', 'core.sshCommand', "sh -c 'sleep 15' --");
    try {
      const started = performance.now();
      await assert.rejects(
        fetchAllRemotes(gitPath, cwd, { timeout: 500 }),
        /git fetch timed out/,
      );
      assert.ok(performance.now() - started < 5000);
    } finally {
      await temp.git('config', '--unset', 'core.sshCommand');
      await temp.git('remote', 'remove', 'stalled');
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
