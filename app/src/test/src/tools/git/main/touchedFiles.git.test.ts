import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { withoutTouched } from '../../../../../tools/git/main/touchedFiles';
import { workingTreeFiles } from '../../../../../tools/git/main/workingTree';
import { workingTreePatch } from '../../../../../tools/git/main/workingTreePatch';
import {
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('Files touched but unchanged', () => {
  let repository: TempRepository;
  let gitPath: string;
  let cwd: string;
  let index: string;
  let blob: string;
  const zero = '0'.repeat(40);
  const modified = (file: string, object: string, newId = zero) => ({
    oldMode: '100644',
    newMode: '100644',
    oldId: object,
    newId,
    linesCounted: true,
    file: {
      status: 'M' as const,
      path: file,
      oldPath: undefined,
      insertions: 0,
      deletions: 0,
    },
  });

  beforeAll(async () => {
    repository = await tempRepository(tempFolder('touched'));
    gitPath = repository.gitPath;
    cwd = repository.root;
    index = path.join(cwd, '.git', 'index');
    await repository.git('config', 'core.autocrlf', 'true');
    await repository.commit('initial', {
      'text.txt': 'text\n',
      'binary.bin': '\0\x01\x02',
      'crlf.txt': 'one\r\ntwo\r\n',
      'changed.txt': 'old\n',
      'a.txt': 'one\n',
    });
    [blob] = await repository.resolve('HEAD:a.txt');
    fs.writeFileSync(path.join(cwd, 'changed.txt'), 'new\n');
    const past = new Date(Date.UTC(2020, 0, 1));
    for (const file of ['text.txt', 'binary.bin', 'crlf.txt', 'changed.txt']) {
      fs.utimesSync(path.join(cwd, file), past, past);
    }
  });

  afterAll(() => removeFolder(cwd));

  test('lists and diffs only the changed file, leaving the index for a commit made meanwhile to lock', async () => {
    const before = fs.readFileSync(index);
    const workingTree = await workingTreeFiles(gitPath, cwd);
    assert.deepStrictEqual(
      workingTree.files.map((file) => [file.status, file.path]),
      [['M', 'changed.txt']],
    );
    const patch = await workingTreePatch(gitPath, cwd, workingTree);
    assert.deepStrictEqual(
      [...patch.matchAll(/^diff --git a\/(\S+)/gm)].map((match) => match[1]),
      ['changed.txt'],
    );
    assert.ok(fs.readFileSync(index).equals(before));
  });

  test('leaves out files only touched, whatever their names hold', async (context) => {
    if (process.platform === 'win32') {
      context.skip();
    }
    const names = ['"notes".md', 'Icon\r', 'two\nlines', 'back\\slash'];
    for (const name of names) {
      fs.writeFileSync(path.join(repository.root, name), `${name}\n`);
    }
    await repository.git('add', '--all', '--', '.', ':!changed.txt');
    await repository.git('commit', '-m', 'names');
    const ids = await repository.resolve(
      ...names.map((name) => `HEAD:${name}`),
    );
    const files = await withoutTouched(repository.gitPath, repository.root, [
      ...names.map((name, i) => modified(name, ids[i])),
      modified('a.txt', blob),
    ]);
    assert.deepStrictEqual(files, []);
  });

  test('keeps a file gone before it is read as modified, still leaving out the touched ones', async () => {
    const files = await withoutTouched(repository.gitPath, repository.root, [
      modified('a.txt', blob),
      modified('gone.txt', blob),
    ]);
    assert.deepStrictEqual(
      files.map((file) => file.path),
      ['gone.txt'],
    );
  });

  test('reads only the files git could not tell changed, not ones whose new text it already has', async () => {
    const files = await withoutTouched(repository.gitPath, repository.root, [
      modified('gone.txt', blob, '1'.repeat(40)),
      modified('a.txt', blob),
    ]);
    assert.deepStrictEqual(
      files.map((file) => file.path),
      ['gone.txt'],
    );
  });

  test('keeps many files gone before they are read as modified, which git would stop reading at, still leaving out the touched ones', async () => {
    const many = Array.from({ length: 20_000 }, (_, i) =>
      modified(`gone/${i}.txt`, blob),
    );
    const files = await withoutTouched(repository.gitPath, repository.root, [
      ...many,
      modified('a.txt', blob),
    ]);
    assert.strictEqual(files.length, many.length);
    assert.ok(!files.some((file) => file.path === 'a.txt'));
  });
});

suite(
  'Files touched but unchanged, committed with CRLF before autocrlf was on',
  () => {
    test('leaves out the touched file, which git does not count as changed, but keeps a changed binary file, whose lines git does not count', async () => {
      const repository = await tempRepository(tempFolder('touched-crlf'));
      const cwd = repository.root;
      try {
        await repository.git('config', 'core.autocrlf', 'false');
        await repository.commit('initial', {
          'crlf.txt': 'one\r\ntwo\r\n',
          'binary.bin': '\0\x01\x02',
        });
        await repository.git('config', 'core.autocrlf', 'true');
        fs.writeFileSync(path.join(cwd, 'binary.bin'), '\0\x01\x03');
        const past = new Date(Date.UTC(2020, 0, 1));
        for (const file of ['crlf.txt', 'binary.bin']) {
          fs.utimesSync(path.join(cwd, file), past, past);
        }
        const workingTree = await workingTreeFiles(repository.gitPath, cwd);
        assert.deepStrictEqual(
          workingTree.files.map((file) => [file.status, file.path]),
          [['M', 'binary.bin']],
        );
      } finally {
        removeFolder(cwd);
      }
    });
  },
);
