import * as assert from 'node:assert';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
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

function failingHook(repository: string, name: string): void {
  fs.writeFileSync(
    path.join(repository, 'hooks', name),
    '#!/bin/sh\nexit 1\n',
    {
      mode: 0o755,
    },
  );
}

suite('Release', function () {
  this.timeout(30_000);

  let folder: string;
  let remote: TempRepository;
  let local: TempRepository;
  let start: string;

  setup(async () => {
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

  teardown(() => removeFolder(folder));

  const release = () =>
    new Promise<boolean>((resolve) => {
      execFile(
        process.execPath,
        [script, '7.0.0'],
        {
          cwd: local.root,
          env: { ...process.env, npm_execpath: path.join(folder, 'npm.js') },
        },
        (error) => resolve(error === null),
      );
    });

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
