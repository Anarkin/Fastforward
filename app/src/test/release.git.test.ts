import * as assert from 'node:assert';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

const script = path.join(__dirname, '..', '..', 'release.mjs');

const fakeNpm = `const fs = require('node:fs');
const version = process.argv[3];
for (const file of ['package.json', 'package-lock.json']) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...json, version }));
}
`;

async function failingHook(
  repository: TempRepository,
  gitDir: string,
  name: string,
): Promise<void> {
  const hooks = path.join(gitDir, 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  fs.writeFileSync(path.join(hooks, name), '#!/bin/sh\nexit 1\n', {
    mode: 0o755,
  });
  await repository.git('config', 'core.hooksPath', hooks);
}

suite('Release', () => {
  let folder: string;
  let remote: TempRepository;
  let local: TempRepository;
  let start: string;

  beforeEach(async () => {
    folder = tempFolder('release');
    remote = await tempRepository(path.join(folder, 'remote.git'), {
      bare: true,
    });
    local = await tempRepository(path.join(folder, 'local'));
    await local.commit('start', {
      'package.json': JSON.stringify({ version: '6.0.0' }),
      'package-lock.json': JSON.stringify({ version: '6.0.0' }),
    });
    await local.git('config', 'user.name', 'Test');
    await local.git('config', 'user.email', 'test@example.com');
    await local.git('remote', 'add', 'origin', remote.root);
    await local.git('push', '-u', 'origin', 'main');
    [start] = await local.resolve('HEAD');
    fs.writeFileSync(path.join(folder, 'npm.js'), fakeNpm);
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
            env: { ...process.env, npm_execpath: path.join(folder, 'npm.js') },
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

  test('pushes the release commit and its tag', async () => {
    assert.strictEqual(await release(), true);
    assert.strictEqual(
      await remote.git('log', '-1', '--format=%s', 'main'),
      'chore(release): 7.0.0\n',
    );
    assert.deepStrictEqual(
      await remote.resolve('v7.0.0^{commit}'),
      await local.resolve('HEAD'),
    );
  });

  test('says that installed apps update to the release only once its draft is published', async () => {
    const { told } = await releasing();
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
    await local.commit('pushed from elsewhere');
    await local.git('push', '-q', 'origin', 'main');
    const [pushed] = await local.resolve('HEAD');
    await local.git('reset', '-q', '--hard', start);
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
    await failingHook(local, path.join(local.root, '.git'), 'pre-commit');
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
    await failingHook(remote, remote.root, 'pre-receive');
    assert.strictEqual(await release(), false);
    await assertUndone();
    assert.strictEqual(await local.git('tag', '--list'), '');
  });
});
