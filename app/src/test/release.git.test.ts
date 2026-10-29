import * as assert from 'node:assert';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import {
  commitAtTime,
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

const script = path.join(__dirname, '..', '..', 'scripts', 'release.mts');

const fakeNpm = `const fs = require('node:fs');
const version = process.argv[3];
for (const file of ['package.json', 'package-lock.json']) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...json, version }));
}
`;

function failingHook(gitDir: string, name: string): void {
  const hooks = path.join(gitDir, 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  fs.writeFileSync(path.join(hooks, name), '#!/bin/sh\nexit 1\n', {
    mode: 0o755,
  });
}

const identity = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

suite('Release', () => {
  let template: string;
  let templateRemote: TempRepository;
  let templateLocal: TempRepository;
  let npm: string;
  let start: string;
  let folder: string;
  let remote: TempRepository;
  let local: TempRepository;

  beforeAll(async () => {
    template = tempFolder('release');
    templateRemote = await tempRepository(path.join(template, 'remote.git'), {
      bare: true,
    });
    templateLocal = await tempRepository(path.join(template, 'local'));
    await templateLocal.commit('start', {
      'package.json': JSON.stringify({ version: '6.0.0' }),
      'package-lock.json': JSON.stringify({ version: '6.0.0' }),
    });
    await templateLocal.git('remote', 'add', 'origin', '../remote.git');
    await templateLocal.git('push', '-u', 'origin', 'main');
    [start] = await templateLocal.resolve('HEAD');
    npm = path.join(template, 'npm.js');
    fs.writeFileSync(npm, fakeNpm);
  });

  afterAll(() => removeFolder(template));

  beforeEach(async () => {
    folder = tempFolder('release');
    remote = await templateRemote.copy(path.join(folder, 'remote.git'));
    local = await templateLocal.copy(path.join(folder, 'local'));
  });

  afterEach(() => removeFolder(folder));

  const releasing = () =>
    new Promise<{ released: boolean; said: string; told: string }>(
      (resolve) => {
        execFile(
          process.execPath,
          [script, '7.0.0'],
          {
            cwd: local.root,
            env: { ...process.env, ...identity, npm_execpath: npm },
          },
          (error, stdout, stderr) =>
            resolve({ released: error === null, said: stderr, told: stdout }),
        );
      },
    );

  const release = async () => (await releasing()).released;

  const assertUndone = async () => {
    assert.deepStrictEqual(await local.resolve('HEAD'), [start]);
    assert.strictEqual(await local.git('status', '--porcelain'), '');
    assert.strictEqual(
      fs.readFileSync(path.join(local.root, 'package.json'), 'utf8'),
      JSON.stringify({ version: '6.0.0' }),
    );
  };

  test('pushes the release commit and its tag, saying that installed apps update to the release only once its draft is published', async () => {
    const { released, told } = await releasing();
    assert.strictEqual(released, true);
    assert.strictEqual(
      await remote.git('log', '-1', '--format=%s', 'main'),
      'chore(release): 7.0.0\n',
    );
    assert.deepStrictEqual(
      await remote.resolve('v7.0.0^{commit}'),
      await local.resolve('HEAD'),
    );
    assert.match(told, /v7\.0\.0[^]*draft release[^]*publish/);
  });

  test('refuses to release from a branch other than main, leaving everything as it was', async () => {
    await local.git('switch', '-q', '-c', 'feature');
    await local.git('push', '-q', '-u', 'origin', 'feature');
    assert.strictEqual(await release(), false);
    await assertUndone();
    assert.strictEqual(await remote.git('tag', '--list'), '');
  });

  test('refuses to release over uncommitted changes, leaving them as they were, as the undo would discard them', async () => {
    const readme = path.join(local.root, 'README.md');
    fs.writeFileSync(readme, 'edited\n');
    await local.git('add', 'README.md');
    fs.writeFileSync(readme, 'edited again\n');
    assert.strictEqual(await release(), false);
    assert.deepStrictEqual(await local.resolve('HEAD'), [start]);
    assert.strictEqual(fs.readFileSync(readme, 'utf8'), 'edited again\n');
    assert.strictEqual(
      await local.git('diff', '--cached', '--name-only'),
      'README.md\n',
    );
    assert.strictEqual(await remote.git('tag', '--list'), '');
  });

  test('refuses to release behind the commits on the remote, leaving everything as it was', async () => {
    const pushed = await commitAtTime(local, start, 1, 'pushed from elsewhere');
    await local.git('update-ref', 'refs/remotes/origin/main', pushed);
    await commitAtTime(remote, start, 1, 'pushed from elsewhere');
    await remote.git('update-ref', 'refs/heads/main', pushed);
    const { released, said } = await releasing();
    assert.deepStrictEqual(
      { released, said },
      {
        released: false,
        said: 'Pull the commits on the remote before releasing.\n',
      },
    );
    await assertUndone();
    assert.deepStrictEqual(await remote.resolve('main'), [pushed]);
    assert.strictEqual(await remote.git('tag', '--list'), '');
  });

  test('undoes the version bump when the commit fails', async () => {
    failingHook(path.join(local.root, '.git'), 'pre-commit');
    assert.strictEqual(await release(), false);
    await assertUndone();
  });

  test('undoes the release commit, keeping the tag already there, when the tag fails', async () => {
    await local.git('tag', 'v7.0.0');
    assert.strictEqual(await release(), false);
    await assertUndone();
    assert.deepStrictEqual(await local.resolve('v7.0.0'), [start]);
  });

  test('undoes the release commit and its tag when the push fails', async () => {
    failingHook(remote.root, 'pre-receive');
    assert.strictEqual(await release(), false);
    await assertUndone();
    assert.strictEqual(await local.git('tag', '--list'), '');
  });
});
