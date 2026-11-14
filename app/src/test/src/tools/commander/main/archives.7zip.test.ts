import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  sevenZipAt,
  sevenZipProgram,
} from '../../../../../tools/commander/main/sevenZip';
import { sevenZipReader } from '../../../../../tools/commander/main/sevenZipReader';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
import { Archives } from '../../../../../tools/commander/main/archives';

const appFolder = path.join(__dirname, '..', '..', '..', '..', '..', '..');

const sevenZip = sevenZipAt(
  sevenZipProgram({
    packaged: false,
    resourcesPath: '',
    appPath: appFolder,
    platform: process.platform,
    arch: process.arch,
  }),
);
const reader = sevenZipReader(sevenZip);

const byText = (one: unknown, other: unknown) =>
  JSON.stringify(one).localeCompare(JSON.stringify(other));

suite('7-Zip', () => {
  let folder: string;
  let content: string;

  const made = (relative: string, text = relative) => {
    const file = path.join(content, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };

  const packed = async (name: string, ...switches: string[]) => {
    const archive = path.join(folder, name);
    const run = await sevenZip([
      'a',
      '-bso0',
      '-bsp0',
      ...switches,
      archive,
      path.join(content, '*'),
    ]);
    assert.strictEqual(run.code, 0, run.errors);
    return archive;
  };

  let works = 0;
  const workFolder = () => {
    const work = path.join(folder, `work-${++works}`);
    fs.mkdirSync(work);
    return Promise.resolve(work);
  };

  beforeEach(() => {
    folder = tempFolder('archives');
    content = path.join(folder, 'content');
    made('docs/readme.md', '# readme\n');
    made('src/app/main.ts', 'export {};\n');
    made('top.txt');
  });

  afterEach(() => {
    removeFolder(folder);
  });

  test('packs volumes under a name of their own and puts them in place of an older set, removing its parts beyond the new ones, nothing else left beside them', async () => {
    made('big.txt', 'x'.repeat(250_000));
    for (const part of ['001', '002', '003', '004']) {
      fs.writeFileSync(path.join(folder, `v.zip.${part}`), 'old');
    }
    const archives = new Archives(reader, process.platform, workFolder);
    assert.deepStrictEqual(
      await archives.pack({
        folder: content,
        items: ['big.txt'],
        archive: path.join(folder, 'v.zip'),
        format: 'zip',
        level: 'store',
        volumeBytes: 100_000,
      }),
      { kind: 'packed' },
    );
    assert.deepStrictEqual(
      fs
        .readdirSync(folder)
        .filter((name) => name !== 'content')
        .toSorted(byText),
      ['v.zip.001', 'v.zip.002', 'v.zip.003'],
    );
    const listing = await reader.list(path.join(folder, 'v.zip.001'));
    assert.deepStrictEqual(
      listing.kind === 'listed' && listing.items.map((item) => item.path),
      ['big.txt'],
    );
  });

  test('renames a folder of a zip with all in it, and makes an empty folder in it', async () => {
    const zip = await packed('r.zip');
    const archives = new Archives(reader, process.platform, workFolder);
    const opened = await archives.open(zip);
    assert.ok(opened.kind === 'opened');
    assert.deepStrictEqual(
      await archives.rename(opened.archive, 'docs', 'notes'),
      { kind: 'packed' },
    );
    assert.deepStrictEqual(
      await archives.addFolder(opened.archive, ['notes'], 'fresh'),
      { kind: 'packed' },
    );
    const listing = await reader.list(zip);
    assert.deepStrictEqual(
      listing.kind === 'listed' &&
        listing.items.map((item) => [item.path, item.folder]).toSorted(byText),
      [
        ['notes', true],
        ['notes/fresh', true],
        ['notes/readme.md', false],
        ['src', true],
        ['src/app', true],
        ['src/app/main.ts', false],
        ['top.txt', false],
      ],
    );
  });

  test('adds a file into a folder of a zip and a folder with all in it into its root', async () => {
    const zip = await packed('add.zip');
    made('more/extra.txt', 'extra');
    const archives = new Archives(reader, process.platform, workFolder);
    const opened = await archives.open(zip);
    assert.ok(opened.kind === 'opened');
    assert.deepStrictEqual(
      await archives.addItems(opened.archive, ['docs'], content, ['top.txt']),
      { kind: 'packed' },
    );
    assert.deepStrictEqual(
      await archives.addItems(opened.archive, [], content, ['more']),
      { kind: 'packed' },
    );
    const listing = await reader.list(zip);
    const paths =
      listing.kind === 'listed' ? listing.items.map((item) => item.path) : [];
    for (const added of ['docs/top.txt', 'more', 'more/extra.txt', 'top.txt']) {
      assert.ok(paths.includes(added), added);
    }
  });

  test('opens the tar inside a gzip as the archive, listing the files of the tar', async () => {
    const tar = await packed('a.tar');
    fs.rmSync(content, { recursive: true });
    fs.mkdirSync(content);
    fs.renameSync(tar, path.join(content, 'a.tar'));
    const gzip = await packed('a.tar.gz', '-tgzip');
    const archives = new Archives(reader, process.platform, workFolder);
    const opened = await archives.open(gzip);
    assert.strictEqual(opened.kind, 'opened');
    assert.strictEqual(opened.archive.file, gzip);
    assert.notStrictEqual(opened.archive.source, gzip);
    assert.deepStrictEqual(
      opened.archive.tree.entries([])?.map((entry) => entry.name),
      ['docs', 'src', 'top.txt'],
    );
  });

  test('keeps an archive opened until the file changes, finding the archive of a folder inside it', async () => {
    const zip = await packed('a.zip');
    const archives = new Archives(reader, process.platform, workFolder);
    const first = await archives.open(zip);
    const again = await archives.open(zip);
    assert.ok(
      first.kind === 'opened' &&
        again.kind === 'opened' &&
        again.archive === first.archive,
    );

    assert.deepStrictEqual(
      archives.within(path.join(zip, 'src', 'app'))?.inner,
      ['src', 'app'],
    );
    assert.deepStrictEqual(archives.within(zip)?.inner, []);
    assert.strictEqual(archives.within(`${zip}x`), undefined);
    assert.strictEqual(
      await archives.fileHolding(path.join(zip, 'src', 'app')),
      zip,
    );
    assert.strictEqual(await archives.fileHolding(content), undefined);

    made('more.txt');
    fs.rmSync(zip);
    await packed('a.zip');
    const changed = await archives.open(zip);
    assert.ok(changed.kind === 'opened' && changed.archive !== again.archive);
    assert.ok(
      changed.archive.tree
        .entries([])
        ?.some((entry) => entry.name === 'more.txt'),
    );
  });
});
