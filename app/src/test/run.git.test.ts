import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runGit } from '../git/run';
import { removeFolder, tempFolder, tempRepository } from './repositories';

suite('Running git in a repository', () => {
  let folder: string;

  setup(() => {
    folder = tempFolder('run');
  });

  teardown(() => removeFolder(folder));

  test('reads the status and the changes without rewriting the index, even for a file touched since it was staged', async function () {
    this.timeout(20_000);
    const repository = await tempRepository(folder);
    await repository.commit('first', { 'a.txt': 'a\n' });
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(folder, 'a.txt'), later, later);
    const index = path.join(folder, '.git', 'index');
    const before = fs.readFileSync(index);
    const run = (...args: string[]) => runGit(repository.gitPath, folder, args);
    assert.strictEqual(await run('status', '--porcelain'), '');
    assert.strictEqual(await run('diff'), '');
    assert.deepStrictEqual(fs.readFileSync(index), before);
  });
});
