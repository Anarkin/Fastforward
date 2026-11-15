import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { ignoredPaths } from '../../../../../tools/git/main/ignoredFiles';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('Telling the ignored paths', () => {
  let ignoring: TempRepository;

  beforeAll(async () => {
    ignoring = await tempRepository(tempFolder('ignored'));
    fs.writeFileSync(
      path.join(ignoring.root, '.gitignore'),
      'ignored/\n/build\n',
    );
    fs.mkdirSync(path.join(ignoring.root, 'ignored'));
  });

  afterAll(() => removeFolder(ignoring.root));

  test('tells the ignored folders', async () => {
    const kept = path.join(ignoring.root, 'kept');
    fs.mkdirSync(kept);
    const ignored = path.join(ignoring.root, 'ignored');
    assert.deepStrictEqual(
      await ignoredPaths(ignoring.gitPath, ignoring.root, [kept, ignored]),
      [ignored],
    );
  });

  test('tells the ignored folders among ones named like pathspec magic', async () => {
    fs.appendFileSync(path.join(ignoring.root, '.gitignore'), ':!tmp\n');
    const magic = path.join(ignoring.root, ':!tmp');
    assert.deepStrictEqual(
      await ignoredPaths(ignoring.gitPath, ignoring.root, [
        path.join(ignoring.root, ':-)'),
        magic,
        path.join(ignoring.root, 'ignored'),
      ]),
      [magic, path.join(ignoring.root, 'ignored')],
    );
  });

  test('tells a path named like pathspec magic from the ignored one it names', async () => {
    const build = path.join(ignoring.root, 'build');
    assert.deepStrictEqual(
      await ignoredPaths(ignoring.gitPath, ignoring.root, [
        path.join(ignoring.root, ':build'),
        build,
      ]),
      [build],
    );
  });
});
