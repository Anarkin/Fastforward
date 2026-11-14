import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { createServer } from 'node:http';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  fetchAllRemotes,
  pushRef,
  remotesNotFetched,
} from '../../../../../../tools/git/main/cli/repository';
import { gitErrorText } from '../../../../../../tools/git/main/cli/errorText';
import { renamingRepository } from '../../../../../helpers/gitFixtures';
import {
  removeFolder,
  savedEnv,
  tempFolder,
  tempRepository,
  withEnv,
  type TempRepository,
} from '../../../../../helpers/repositories';

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

  test('keeps fetching and pushing while git prints anything, however long that takes, giving up only once it prints nothing for the whole timeout', async () => {
    const folder = tempFolder('slow-remote');
    const slowly = (command: string, saying: string): string => {
      const script = path
        .join(folder, `${command}-${saying ? 'chatty' : 'quiet'}.sh`)
        .replaceAll('\\', '/');
      fs.writeFileSync(
        script,
        `#!/bin/sh\ni=0\nwhile [ $i -lt 12 ]; do ${saying}sleep 0.2; i=$((i+1)); done\nexec git ${command} "$@"\n`,
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
});
