import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { Archives, type Opening } from '../tools/commander/main/archives';
import {
  sevenZipAt,
  sevenZipProgram,
  sevenZipReader,
} from '../tools/commander/main/sevenZip';
import { removeFolder, tempFolder } from './repositories';

interface PlannedFile {
  readonly kind: string;
  readonly path: string;
  readonly content?: () => string | Buffer;
}

interface FilesPlan {
  readonly plan: (options: {
    readonly platform: 'win32' | 'darwin' | 'linux';
  }) => { readonly items: readonly PlannedFile[] };
}

const appFolder = path.join(__dirname, '..', '..');

const sevenZip = sevenZipAt(
  sevenZipProgram({
    packaged: false,
    resourcesPath: '',
    appPath: appFolder,
    platform: process.platform,
    arch: process.arch,
  }),
);

const project = ['README.md', 'docs', 'src', 'ünïcödé – 名前.txt'];

const passwordAsked = (opening: Opening) =>
  opening.kind === 'refused'
    ? [opening.needsPassword, opening.passwordOf]
    : opening.kind;

suite('Archives of the playground of files', () => {
  let folder: string;
  let archives: Archives;
  let works = 0;

  const at = (name: string) => path.join(folder, 'archives', name);

  const rootOf = async (name: string) => {
    const opened: Opening = await archives.open(at(name));
    assert.strictEqual(opened.kind, 'opened', name);
    return opened.archive.tree
      .entries([])
      ?.map((entry) => entry.name)
      .toSorted((one, other) => one.localeCompare(other));
  };

  beforeAll(async () => {
    folder = tempFolder('archives-playground');
    const { plan }: FilesPlan = await import(
      pathToFileURL(
        path.join(appFolder, 'scripts', 'playground', 'filesPlan.mts'),
      ).href
    );
    const platform =
      process.platform === 'win32' || process.platform === 'darwin'
        ? process.platform
        : 'linux';
    for (const item of plan({ platform }).items) {
      if (
        item.kind === 'file' &&
        item.path.startsWith('archives/') &&
        item.content !== undefined
      ) {
        const file = path.join(folder, ...item.path.split('/'));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, item.content());
      }
    }
    archives = new Archives(sevenZipReader(sevenZip), process.platform, () => {
      const work = path.join(folder, `work-${++works}`);
      fs.mkdirSync(work);
      return Promise.resolve(work);
    });
  });

  afterAll(() => {
    removeFolder(folder);
  });

  test('opens the zip of a project with its folders, the empty one too, and its tar plain or compressed as the files of the tar', async () => {
    assert.deepStrictEqual(await rootOf('project.zip'), [
      'docs',
      'empty-folder',
      'README.md',
      'src',
      'ünïcödé – 名前.txt',
    ]);
    for (const name of [
      'project.tar',
      'project.tar.gz',
      'project.tgz',
      'project.tar.zst',
    ]) {
      assert.deepStrictEqual(
        await rootOf(name),
        project.toSorted((one, other) => one.localeCompare(other)),
        name,
      );
    }
  });

  test('opens a document made of a zip, one compressed file, a zip holding a zip, an empty zip, deep folders and many files', async () => {
    assert.ok((await rootOf('report.docx'))?.includes('word'));
    assert.deepStrictEqual(await rootOf('notes.txt.gz'), ['notes.txt']);
    assert.deepStrictEqual(await rootOf('nested.zip'), [
      'beside-it.txt',
      'inner.zip',
    ]);
    assert.deepStrictEqual(await rootOf('empty.zip'), []);
    assert.deepStrictEqual(await rootOf('deep.zip'), ['level-1']);
    assert.strictEqual((await rootOf('many-files.zip'))?.length, 50);
    assert.strictEqual((await rootOf('windows-cp852.zip'))?.length, 2);
  });

  test('opens the zip inside the nested zip as the archive it is, by a path through both', async () => {
    const outer = await archives.open(at('nested.zip'));
    assert.ok(outer.kind === 'opened');
    const inner = path.join(at('nested.zip'), 'inner.zip');
    const opened = await archives.openInside(inner, outer.archive, 'inner.zip');
    assert.ok(opened.kind === 'opened');
    assert.deepStrictEqual(
      opened.archive.tree
        .entries([])
        ?.map((entry) => entry.name)
        .toSorted((one, other) => one.localeCompare(other)),
      ['docs', 'empty-folder', 'README.md', 'src', 'ünïcödé – 名前.txt'],
    );
  });

  test('keeps the names that would reach outside the folder they are extracted into within the archive', async () => {
    const root = (await rootOf('hostile-names.zip')) ?? [];
    for (const name of ['outside.txt', 'further-outside.txt', 'rooted.txt']) {
      assert.ok(root.includes(name), name);
    }
    assert.ok(!root.some((name) => name === '..' || name.startsWith('../')));
  });

  test('encrypts the zip whose password is playground, as 7-Zip reads it with that password alone', async () => {
    const opened = await archives.open(at('encrypted.zip'));
    assert.ok(opened.kind === 'opened');
    assert.strictEqual(
      (await sevenZip(['t', '-pplayground', '--', at('encrypted.zip')])).code,
      0,
    );
    assert.notStrictEqual(
      (await sevenZip(['t', '-pwrong', '--', at('encrypted.zip')])).code,
      0,
    );
  });

  test('needs the password playground for the 7z whose names are encrypted, refusing a wrong one, and opens it once given', async () => {
    const names = at('encrypted-names.7z');
    assert.deepStrictEqual(passwordAsked(await archives.open(names)), [
      true,
      names,
    ]);
    archives.usePassword(names, 'wrong');
    assert.deepStrictEqual(passwordAsked(await archives.open(names)), [
      true,
      names,
    ]);
    archives.usePassword(names, 'playground');
    assert.deepStrictEqual(
      await rootOf('encrypted-names.7z'),
      project.toSorted((one, other) => one.localeCompare(other)),
    );
  });

  test('takes the plain files out of the zip only partly encrypted without a password, and the encrypted ones with playground', async () => {
    const partly = at('partly-encrypted.zip');
    const opened = await archives.open(partly);
    assert.ok(opened.kind === 'opened');
    const plain = await archives.extract(opened.archive, ['README.md']);
    assert.strictEqual(plain.kind, 'extracted');
    const locked = await archives.extract(opened.archive, ['docs/guide.md']);
    assert.ok(locked.kind === 'refused');
    assert.strictEqual(locked.needsPassword, true);
    archives.usePassword(partly, 'playground');
    const unlocked = await archives.extract(opened.archive, ['docs/guide.md']);
    assert.ok(unlocked.kind === 'extracted');
    assert.ok(fs.existsSync(path.join(unlocked.folder, 'docs', 'guide.md')));
  });

  test('needs the password playground of the encrypted zip to take out the 7z inside it, and then inner for the names of the 7z', async () => {
    const outer = at('encrypted-nested.zip');
    const opened = await archives.open(outer);
    assert.ok(opened.kind === 'opened');
    const inner = path.join(outer, 'inner-encrypted.7z');
    const enter = () =>
      archives.openInside(inner, opened.archive, 'inner-encrypted.7z');
    assert.deepStrictEqual(passwordAsked(await enter()), [true, outer]);
    archives.usePassword(outer, 'playground');
    assert.deepStrictEqual(passwordAsked(await enter()), [true, inner]);
    archives.usePassword(inner, 'inner');
    const entered = await enter();
    assert.ok(entered.kind === 'opened');
    assert.deepStrictEqual(
      entered.archive.tree
        .entries([])
        ?.map((entry) => entry.name)
        .toSorted((one, other) => one.localeCompare(other)),
      project.toSorted((one, other) => one.localeCompare(other)),
    );
  });

  test('refuses the damaged zip and the one that is no archive, saying why', async () => {
    const damaged = await archives.open(at('cut-short.zip'));
    assert.ok(damaged.kind === 'refused');
    assert.match(damaged.reason, /Unexpected end of archive/);
    const text = await archives.open(at('not-an-archive.zip'));
    assert.ok(text.kind === 'refused');
    assert.match(text.reason, /Cannot open the file as/);
  });

  test.skipIf(process.platform !== 'win32')(
    'marks a zip as downloaded on Windows, so what is taken out of it is marked too',
    async () => {
      const opened = await archives.open(at('downloaded.zip'));
      assert.ok(opened.kind === 'opened');
      const extracted = await archives.extract(opened.archive, ['README.md']);
      assert.ok(extracted.kind === 'extracted');
      assert.match(
        fs.readFileSync(
          path.join(extracted.folder, 'README.md:Zone.Identifier'),
          'utf8',
        ),
        /ZoneId=3/,
      );
    },
  );
});
