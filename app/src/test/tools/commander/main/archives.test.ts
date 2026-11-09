import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  ArchiveTree,
  Archives,
  type ArchiveItem,
  type ArchiveListing,
  type ArchiveReader,
} from '../../../../tools/commander/main/archives';
import { removeFolder, tempFolder } from '../../../repositories';

function item(itemPath: string, more: Partial<ArchiveItem> = {}): ArchiveItem {
  return {
    path: itemPath,
    folder: false,
    size: 1,
    modified: 5,
    hiddenAttribute: false,
    link: false,
    encrypted: false,
    ...more,
  };
}

suite('ArchiveTree', () => {
  test('lists each folder of an archive, making the folders that have no item of their own from the paths of what is inside them', () => {
    const tree = new ArchiveTree(
      [item('docs/readme.md'), item('src/app/main.ts', { size: 11 })],
      'linux',
    );
    assert.deepStrictEqual(
      tree.entries([])?.map((entry) => [entry.name, entry.folder]),
      [
        ['docs', true],
        ['src', true],
      ],
    );
    assert.deepStrictEqual(tree.entries(['src', 'app']), [
      {
        name: 'main.ts',
        folder: false,
        link: false,
        hidden: false,
        size: 11,
        modified: 5,
      },
    ]);
    assert.strictEqual(tree.entries(['nowhere']), undefined);
    assert.deepStrictEqual(tree.item(['src'], 'app'), {
      path: 'src/app',
      encrypted: false,
    });
  });

  test('takes the item of a folder for its date over the folder made from paths, whichever comes first', () => {
    const tree = new ArchiveTree(
      [
        item('docs/readme.md'),
        item('docs', { folder: true, size: undefined, modified: 9 }),
      ],
      'linux',
    );
    assert.deepStrictEqual(tree.entries([])?.[0], {
      name: 'docs',
      folder: true,
      link: false,
      hidden: false,
      size: undefined,
      modified: 9,
    });
    assert.deepStrictEqual(
      tree.entries(['docs'])?.map((entry) => entry.name),
      ['readme.md'],
    );
  });

  test('leaves out the empty, . and .. parts of a path, as 7-Zip extracts it, keeping the path the archive names it by to extract it', () => {
    const tree = new ArchiveTree(
      [item('../evil.txt'), item('/root.txt'), item('a/./b//c.txt')],
      'linux',
    );
    assert.deepStrictEqual(
      tree.entries([])?.map((entry) => entry.name),
      ['evil.txt', 'root.txt', 'a'],
    );
    assert.deepStrictEqual(tree.item([], 'evil.txt'), {
      path: '../evil.txt',
      encrypted: false,
    });
    assert.deepStrictEqual(
      tree.entries(['a', 'b'])?.map((entry) => entry.name),
      ['c.txt'],
    );
  });

  test('keeps a folder over a file of its name, and the last of the items of one name, as 7-Zip extracts them', () => {
    const tree = new ArchiveTree(
      [
        item('a/inside.txt'),
        item('a'),
        item('dup.txt', { size: 1 }),
        item('dup.txt', { size: 2 }),
      ],
      'linux',
    );
    assert.deepStrictEqual(
      tree.entries([])?.map((entry) => [entry.name, entry.folder, entry.size]),
      [
        ['a', true, undefined],
        ['dup.txt', false, 2],
      ],
    );
  });

  test('counts the files and bytes of the items asked for, a folder by all the files under it', () => {
    const tree = new ArchiveTree(
      [
        item('docs/a.md', { size: 3 }),
        item('docs/deep/b.md', { size: 4 }),
        item('top.txt', { size: 5 }),
      ],
      'linux',
    );
    assert.deepStrictEqual(
      tree.totals([
        { inner: [], name: 'docs' },
        { inner: [], name: 'top.txt' },
      ]),
      { files: 3, bytes: 12 },
    );
    assert.deepStrictEqual(
      tree.totals([{ inner: ['docs', 'deep'], name: 'b.md' }]),
      {
        files: 1,
        bytes: 4,
      },
    );
  });

  test('hides by the hidden attribute on Windows, and by a leading dot elsewhere, as the folders of the system are', () => {
    const items = [
      item('.git/config'),
      item('shown.txt', { hiddenAttribute: true }),
    ];
    const hiddenOn = (platform: NodeJS.Platform) =>
      new ArchiveTree(items, platform)
        .entries([])
        ?.map((entry) => [entry.name, entry.hidden]);
    assert.deepStrictEqual(hiddenOn('win32'), [
      ['.git', false],
      ['shown.txt', true],
    ]);
    assert.deepStrictEqual(hiddenOn('darwin'), [
      ['.git', true],
      ['shown.txt', false],
    ]);
  });
});

function readerOf(listings: Record<string, ArchiveListing>) {
  const asked: string[] = [];
  const reader: ArchiveReader = {
    list: (file) => {
      asked.push(`list ${path.basename(file)}`);
      return Promise.resolve(
        listings[path.basename(file)] ?? { kind: 'refused', reason: 'no' },
      );
    },
    extract: async (file, paths, into) => {
      asked.push(`extract ${path.basename(file)} ${paths.join(' ')}`);
      for (const each of paths) {
        await fs.promises.writeFile(path.join(into, each), each);
      }
      return undefined;
    },
  };
  return { reader, asked };
}

suite('Archives', () => {
  let folder: string;
  let works: number;
  const workFolder = () => {
    const work = path.join(folder, `work-${++works}`);
    fs.mkdirSync(work);
    return Promise.resolve(work);
  };

  beforeEach(() => {
    folder = tempFolder('archives');
    works = 0;
  });

  afterEach(() => {
    removeFolder(folder);
  });

  test('opens a file the reader lists, keeping it opened while the file is unchanged, and opens it again once it changes', async () => {
    const zip = path.join(folder, 'a.zip');
    fs.writeFileSync(zip, 'first');
    const { reader, asked } = readerOf({
      'a.zip': { kind: 'listed', items: [item('docs/readme.md')] },
    });
    const archives = new Archives(reader, 'linux', workFolder);
    const first = await archives.open(zip);
    const again = await archives.open(zip);
    assert.ok(
      first.kind === 'opened' &&
        again.kind === 'opened' &&
        first.archive === again.archive,
    );
    assert.strictEqual(first.archive.source, zip);
    assert.deepStrictEqual(asked, ['list a.zip']);

    fs.writeFileSync(zip, 'changed, and longer');
    const changed = await archives.open(zip);
    assert.ok(changed.kind === 'opened' && changed.archive !== first.archive);
    assert.deepStrictEqual(asked, ['list a.zip', 'list a.zip']);
  });

  test('opens the one tar a compressed file holds as the archive, listing the files of the tar it unpacked', async () => {
    const gzip = path.join(folder, 'a.tar.gz');
    fs.writeFileSync(gzip, 'compressed');
    const { reader, asked } = readerOf({
      'a.tar.gz': { kind: 'listed', items: [item('a.tar')] },
      'a.tar': { kind: 'listed', items: [item('pkg/index.js')] },
    });
    const opened = await new Archives(reader, 'linux', workFolder).open(gzip);
    assert.ok(opened.kind === 'opened');
    assert.strictEqual(opened.archive.file, gzip);
    assert.strictEqual(
      opened.archive.source,
      path.join(folder, 'work-1', 'a.tar'),
    );
    assert.deepStrictEqual(
      opened.archive.tree.entries([])?.map((entry) => entry.name),
      ['pkg'],
    );
    assert.deepStrictEqual(asked, [
      'list a.tar.gz',
      'extract a.tar.gz a.tar',
      'list a.tar',
    ]);
  });

  test('refuses what the reader refuses, a folder and a file that is gone, saying why', async () => {
    const text = path.join(folder, 'plain.txt');
    fs.writeFileSync(text, 'text');
    const { reader } = readerOf({
      'plain.txt': { kind: 'refused', reason: 'Not an archive' },
    });
    const archives = new Archives(reader, 'linux', workFolder);
    assert.deepStrictEqual(await archives.open(text), {
      kind: 'refused',
      reason: 'Not an archive',
    });
    assert.deepStrictEqual(await archives.open(folder), {
      kind: 'refused',
      reason: 'It is not a file.',
      noArchive: true,
    });
    assert.strictEqual(
      (await archives.open(path.join(folder, 'gone.zip'))).kind,
      'refused',
    );
    assert.deepStrictEqual(
      await new Archives(undefined, 'linux', workFolder).open(text),
      {
        kind: 'refused',
        reason: 'The app has no 7-Zip to open archives with.',
        noArchive: true,
      },
    );
  });

  test('finds the opened archive a folder is inside of, and the file a path inside an archive runs through', async () => {
    const zip = path.join(folder, 'a.zip');
    fs.writeFileSync(zip, 'zip');
    const { reader } = readerOf({
      'a.zip': { kind: 'listed', items: [item('src/app/main.ts')] },
    });
    const archives = new Archives(reader, process.platform, workFolder);
    assert.strictEqual(archives.within(zip), undefined);
    await archives.open(zip);
    assert.deepStrictEqual(
      archives.within(path.join(zip, 'src', 'app'))?.inner,
      ['src', 'app'],
    );
    assert.deepStrictEqual(archives.within(zip)?.inner, []);
    assert.strictEqual(archives.within(`${zip}x`), undefined);
    assert.strictEqual(archives.within(folder), undefined);

    assert.strictEqual(
      await archives.fileHolding(path.join(zip, 'src', 'app')),
      zip,
    );
    assert.strictEqual(await archives.fileHolding(zip), zip);
    assert.strictEqual(
      await archives.fileHolding(path.join(folder, 'gone', 'deeper')),
      undefined,
    );
  });
});
