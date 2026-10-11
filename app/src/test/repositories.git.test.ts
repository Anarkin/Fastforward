import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  withEnv,
} from './repositories';

suite('Test repository', function () {
  this.timeout(20_000);

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
