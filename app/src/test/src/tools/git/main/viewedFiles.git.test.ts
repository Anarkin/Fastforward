import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { viewedFile } from '../../../../../tools/git/main/viewedFiles';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';

suite('Repository files', () => {
  let parent: string;
  let gitPath: string;
  let repository: TempRepository;
  let cwd: string;

  beforeAll(async () => {
    parent = tempFolder('files');
    repository = await tempRepository(path.join(parent, 'repository'));
    gitPath = repository.gitPath;
    cwd = repository.root;
    await repository.commit('initial', { 'src/tracked.txt': 'one\n' });
    fs.writeFileSync(path.join(cwd, 'src', 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'new\n');
  });

  afterAll(() => removeFolder(parent));

  test('gives a file to view from the working tree where it is, and from a commit as a copy kept by its blob, written once', async () => {
    const copies = path.join(parent, 'viewed');
    const blob = (
      await repository.git('rev-parse', 'HEAD:src/tracked.txt')
    ).trim();

    assert.deepStrictEqual(
      await viewedFile(gitPath, cwd, 'src/tracked.txt', undefined, copies),
      { kind: 'file', file: path.join(cwd, 'src', 'tracked.txt') },
    );
    const committed = await viewedFile(
      gitPath,
      cwd,
      'src/tracked.txt',
      blob,
      copies,
    );
    assert.deepStrictEqual(committed, {
      kind: 'file',
      file: path.join(copies, blob, 'tracked.txt'),
    });
    assert.strictEqual(
      fs.readFileSync(path.join(copies, blob, 'tracked.txt'), 'utf8'),
      'one\n',
    );
    fs.writeFileSync(path.join(copies, blob, 'tracked.txt'), 'kept');
    await viewedFile(gitPath, cwd, 'src/tracked.txt', blob, copies);
    assert.strictEqual(
      fs.readFileSync(path.join(copies, blob, 'tracked.txt'), 'utf8'),
      'kept',
    );
  });

  test('gives a copy of a blob asked for many times at once, as two copies at once clashed on one file', async () => {
    const copies = path.join(parent, 'viewed-at-once');
    const blob = (
      await repository.git('rev-parse', 'HEAD:src/tracked.txt')
    ).trim();
    const viewed = await Promise.all(
      Array.from({ length: 20 }, () =>
        viewedFile(gitPath, cwd, 'src/tracked.txt', blob, copies),
      ),
    );
    for (const each of viewed) {
      assert.deepStrictEqual(each, {
        kind: 'file',
        file: path.join(copies, blob, 'tracked.txt'),
      });
    }
    assert.deepStrictEqual(fs.readdirSync(path.join(copies, blob)), [
      'tracked.txt',
    ]);
  });

  test('gives a copy of a blob whose name Windows takes no file by, as a file another system named so could not be viewed', async () => {
    const copies = path.join(parent, 'viewed-named');
    const blob = (
      await repository.git('rev-parse', 'HEAD:src/tracked.txt')
    ).trim();
    const viewed = await viewedFile(
      gitPath,
      cwd,
      'src/what?.txt',
      blob,
      copies,
    );
    assert.ok(viewed.kind === 'file');
    assert.strictEqual(
      path.basename(viewed.file),
      process.platform === 'win32' ? 'what_.txt' : 'what?.txt',
    );
    assert.strictEqual(fs.readFileSync(viewed.file, 'utf8'), 'one\n');
  });

  test('gives a copy of a blob whose name Windows keeps for a device or ends in a dot or a space, under a name Windows takes, keeping its extension', async () => {
    const copies = path.join(parent, 'viewed-reserved');
    const blob = (
      await repository.git('rev-parse', 'HEAD:src/tracked.txt')
    ).trim();
    const names = ['aux.c', 'CON', 'com1.txt', 'lpt9', 'notes ', 'ends.'];
    const viewed = await Promise.all(
      names.map((name) =>
        viewedFile(gitPath, cwd, `src/${name}`, blob, copies),
      ),
    );
    assert.deepStrictEqual(
      viewed.map((each) =>
        each.kind === 'file' ? path.basename(each.file) : each.kind,
      ),
      process.platform === 'win32'
        ? ['_aux.c', '_CON', '_com1.txt', '_lpt9', 'notes_', 'ends_']
        : names,
    );
    for (const each of viewed) {
      assert.ok(each.kind === 'file');
      assert.strictEqual(fs.readFileSync(each.file, 'utf8'), 'one\n');
    }
  });

  test('gives no file to view outside the repository, missing from the working tree, or of a blob it does not have', async () => {
    const copies = path.join(parent, 'viewed');
    await assert.rejects(
      viewedFile(gitPath, cwd, '../outside.txt', undefined, copies),
    );
    assert.deepStrictEqual(
      await viewedFile(gitPath, cwd, 'src/missing.txt', undefined, copies),
      { kind: 'missing' },
    );
    assert.deepStrictEqual(
      await viewedFile(gitPath, cwd, 'src/tracked.txt', '1'.repeat(40), copies),
      { kind: 'missing' },
    );
    assert.deepStrictEqual(
      await viewedFile(gitPath, cwd, 'src/tracked.txt', 'not-a-hash', copies),
      { kind: 'missing' },
    );
    assert.ok(!fs.existsSync(path.join(copies, '1'.repeat(40))));
  });
});
