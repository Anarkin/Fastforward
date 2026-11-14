import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  withEnv,
} from './repositories';

suite('Test repository', () => {
  test("commits whatever the user's own git config says, which may sign commits or run hooks", async () => {
    const folder = tempFolder('own-config');
    const config = path.join(folder, '.gitconfig');
    const hooks = path.join(folder, 'hooks');
    fs.mkdirSync(hooks);
    fs.writeFileSync(path.join(hooks, 'pre-commit'), '#!/bin/sh\nexit 1\n', {
      mode: 0o755,
    });
    fs.writeFileSync(
      config,
      `[commit]\n\tgpgSign = true\n[gpg]\n\tprogram = missing-gpg\n[core]\n\thooksPath = ${hooks.replaceAll('\\', '/')}\n`,
    );
    try {
      await withEnv({ GIT_CONFIG_GLOBAL: config }, async () => {
        const repository = await tempRepository(
          path.join(folder, 'repository'),
        );
        await repository.commit('unsigned');
      });
    } finally {
      removeFolder(folder);
    }
  });

  test('copies a repository whole, its commits made after those it was copied with and its index fresh, so no file reads as touched, leaving the original as it was', async () => {
    const folder = tempFolder('copied');
    try {
      const original = await tempRepository(path.join(folder, 'original'));
      await original.commit('first', { 'kept.txt': 'kept\n' });
      const copied = await original.copy(path.join(folder, 'copy'));
      await copied.commit('second');
      assert.strictEqual(await copied.git('diff-files', '--name-only'), '');
      const [second, first] = (await copied.git('log', '--format=%ct'))
        .trim()
        .split('\n')
        .map(Number);
      assert.ok(first < second, `${first} ${second}`);
      assert.strictEqual(
        (await original.git('log', '--format=%s')).trim(),
        'first',
      );
    } finally {
      removeFolder(folder);
    }
  });

  test('imports commits onto a ref from the commit given in one go, each with its files and dated after the commits made before, giving their hashes', async () => {
    const folder = tempFolder('imported');
    try {
      const repository = await tempRepository(folder);
      await repository.commit('first', { 'kept.txt': 'kept\n' });
      const hashes = await repository.importCommits('refs/heads/side', 'main', [
        { message: 'one', files: { 'dir/one.txt': 'one\n' } },
        { message: 'two' },
      ]);
      assert.deepStrictEqual(
        await repository.resolve('side~1', 'side'),
        hashes,
      );
      assert.deepStrictEqual(
        (await repository.git('log', '--format=%s', 'side')).trim().split('\n'),
        ['two', 'one', 'first'],
      );
      const [first, one, two] = (
        await repository.git('log', '--reverse', '--format=%ct', 'side')
      )
        .trim()
        .split('\n')
        .map(Number);
      assert.ok(first < one && one < two, `${first} ${one} ${two}`);
      assert.strictEqual(
        await repository.git('show', 'side:dir/one.txt'),
        'one\n',
      );
      assert.strictEqual(
        await repository.git('show', 'side:kept.txt'),
        'kept\n',
      );
    } finally {
      removeFolder(folder);
    }
  });

  test("makes its repositories with the system's config, whose defaults the app reads too", async () => {
    const folder = tempFolder('system-config');
    const config = path.join(folder, 'gitconfig');
    fs.writeFileSync(config, '[fastforward]\n\tprobe = system\n');
    try {
      await withEnv({ GIT_CONFIG_SYSTEM: config }, async () => {
        const repository = await tempRepository(
          path.join(folder, 'repository'),
        );
        assert.strictEqual(
          (await repository.git('config', 'fastforward.probe')).trim(),
          'system',
        );
      });
    } finally {
      removeFolder(folder);
    }
  });
});
