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

  test("commits whatever the user's own git config says, which may sign commits", async () => {
    const folder = tempFolder('own-config');
    const config = path.join(folder, '.gitconfig');
    fs.writeFileSync(
      config,
      '[commit]\n\tgpgSign = true\n[gpg]\n\tprogram = missing-gpg\n',
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
});
