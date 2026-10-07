import * as fs from 'node:fs';
import * as path from 'node:path';
import { removeFolder, tempFolder, tempRepository } from './repositories';

suite('Test repository', function () {
  this.timeout(20_000);

  test("commits whatever the user's own git config says, which may sign commits", async () => {
    const folder = tempFolder('own-config');
    const own = process.env.GIT_CONFIG_GLOBAL;
    const config = path.join(folder, '.gitconfig');
    fs.writeFileSync(
      config,
      '[commit]\n\tgpgSign = true\n[gpg]\n\tprogram = missing-gpg\n',
    );
    process.env.GIT_CONFIG_GLOBAL = config;
    try {
      const repository = await tempRepository(path.join(folder, 'repository'));
      await repository.commit('unsigned');
    } finally {
      if (own === undefined) {
        delete process.env.GIT_CONFIG_GLOBAL;
      } else {
        process.env.GIT_CONFIG_GLOBAL = own;
      }
      removeFolder(folder);
    }
  });
});
