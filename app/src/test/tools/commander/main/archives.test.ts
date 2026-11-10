import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  ArchiveTree,
  Archives,
  workFolders,
  type ArchiveItem,
  type ArchiveListing,
  type ArchiveReader,
  type Packing,
} from '../../../../tools/commander/main/archives';
import { strings } from '../../../../shared/strings';
import { waitFor } from '../../../fixtures';
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
      size: 1,
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
        ['a', true, 1],
        ['dup.txt', false, 2],
      ],
    );
  });

  test('counts the files and bytes of the items asked for, a folder by all the files under it, and says whether one of those files is encrypted', () => {
    const tree = new ArchiveTree(
      [
        item('docs/a.md', { size: 3 }),
        item('docs/deep/b.md', { size: 4, encrypted: true }),
        item('top.txt', { size: 5 }),
      ],
      'linux',
    );
    assert.deepStrictEqual(
      tree.totals([
        { inner: [], name: 'docs' },
        { inner: [], name: 'top.txt' },
      ]),
      { files: 3, bytes: 12, encrypted: true },
    );
    assert.deepStrictEqual(
      tree.totals([{ inner: ['docs', 'deep'], name: 'b.md' }]),
      { files: 1, bytes: 4, encrypted: true },
    );
    assert.deepStrictEqual(tree.totals([{ inner: [], name: 'top.txt' }]), {
      files: 1,
      bytes: 5,
      encrypted: false,
    });
  });

  test('gives each folder the size of every file under it, as the listing of the archive tells them all', () => {
    const tree = new ArchiveTree(
      [
        item('docs/a.md', { size: 3 }),
        item('docs/deep/b.md', { size: 4 }),
        item('docs/deep/unsized.bin', { size: undefined }),
        item('empty', { folder: true, size: undefined }),
        item('top.txt', { size: 5 }),
      ],
      'linux',
    );
    assert.deepStrictEqual(
      tree.entries([])?.map((entry) => [entry.name, entry.size]),
      [
        ['docs', 7],
        ['empty', 0],
        ['top.txt', 5],
      ],
    );
    assert.deepStrictEqual(
      tree.entries(['docs'])?.map((entry) => [entry.name, entry.size]),
      [
        ['a.md', 3],
        ['deep', 4],
      ],
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

const notPacked = () => Promise.reject(new Error('Nothing is packed here.'));

function readerOf(listings: Record<string, ArchiveListing>) {
  const asked: string[] = [];
  const reader: ArchiveReader = {
    pack: notPacked,
    test: notPacked,
    rename: notPacked,
    add: notPacked,
    remove: notPacked,
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

  test('takes the one tar an encrypted archive holds out with the password of the archive, so it opens once the password is given', async () => {
    const archive = path.join(folder, 'docs.tar.7z');
    fs.writeFileSync(archive, 'encrypted');
    const given: (string | undefined)[] = [];
    const reader: ArchiveReader = {
      ...readerOf({}).reader,
      list: (file) =>
        Promise.resolve(
          path.basename(file) === 'docs.tar'
            ? { kind: 'listed', items: [item('docs/readme.md')] }
            : {
                kind: 'listed',
                items: [item('docs.tar', { encrypted: true })],
              },
        ),
      extract: async (_file, paths, into, options) => {
        given.push(options?.password);
        if (options?.password !== 'secret') {
          return { reason: 'Wrong password', needsPassword: true };
        }
        for (const each of paths) {
          await fs.promises.writeFile(path.join(into, each), each);
        }
        return undefined;
      },
    };
    const archives = new Archives(reader, 'linux', workFolder);

    assert.deepStrictEqual(await archives.open(archive), {
      kind: 'refused',
      reason: 'Wrong password',
      needsPassword: true,
      passwordOf: archive,
    });
    archives.usePassword(archive, 'secret');
    const opened = await archives.open(archive);

    assert.ok(opened.kind === 'opened');
    assert.deepStrictEqual(
      opened.archive.tree.entries([])?.map((entry) => entry.name),
      ['docs'],
    );
    assert.deepStrictEqual(given, [undefined, 'secret']);
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

  test('opens an archive inside another from a copy taken out of it, by a path through both, the innermost archive having a folder inside it, as long as the outer archive is unchanged', async () => {
    const zip = path.join(folder, 'outer.zip');
    fs.writeFileSync(zip, 'outer');
    const { reader } = readerOf({
      'outer.zip': {
        kind: 'listed',
        items: [item('inner.zip'), item('docs/readme.md')],
      },
      'inner.zip': { kind: 'listed', items: [item('src/main.ts')] },
    });
    const archives = new Archives(reader, 'linux', workFolder);
    const outer = await archives.open(zip);
    assert.ok(outer.kind === 'opened');
    const nested = path.join(zip, 'inner.zip');

    const inner = await archives.openInside(nested, outer.archive, 'inner.zip');
    assert.ok(inner.kind === 'opened');
    assert.strictEqual(inner.archive.file, nested);
    assert.strictEqual(path.basename(inner.archive.source), 'inner.zip');
    assert.deepStrictEqual(
      inner.archive.tree.entries([])?.map((entry) => entry.name),
      ['src'],
    );
    assert.strictEqual(
      archives.within(path.join(nested, 'src'))?.archive,
      inner.archive,
    );
    assert.deepStrictEqual(archives.within(path.join(nested, 'src'))?.inner, [
      'src',
    ]);
    assert.deepStrictEqual(archives.within(path.join(zip, 'docs'))?.inner, [
      'docs',
    ]);
    const again = await archives.open(nested);
    assert.ok(again.kind === 'opened' && again.archive === inner.archive);

    fs.writeFileSync(zip, 'outer, changed since');
    assert.strictEqual((await archives.open(nested)).kind, 'refused');
    assert.strictEqual(
      archives.within(path.join(nested, 'src'))?.archive.file,
      zip,
    );
  });

  test('lists and extracts an archive with the password it was given until told to forget it, saying whose password is missing, the outer archive for the extraction of one inside it', async () => {
    const zip = path.join(folder, 'secret.zip');
    fs.writeFileSync(zip, 'zip');
    const seen: (string | undefined)[] = [];
    const reader: ArchiveReader = {
      pack: notPacked,
      test: notPacked,
      rename: notPacked,
      add: notPacked,
      remove: notPacked,
      list: (_file, _signal, password) => {
        seen.push(password);
        return Promise.resolve(
          password === 'right'
            ? { kind: 'listed', items: [item('inner.zip')] }
            : {
                kind: 'refused',
                reason: 'Wrong password',
                needsPassword: true,
              },
        );
      },
      extract: (_file, _paths, _into, options) => {
        seen.push(options?.password);
        return Promise.resolve({
          reason: 'Wrong password',
          needsPassword: true,
        });
      },
    };
    const archives = new Archives(reader, 'linux', workFolder);

    assert.deepStrictEqual(await archives.open(zip), {
      kind: 'refused',
      reason: 'Wrong password',
      needsPassword: true,
      passwordOf: zip,
    });
    archives.usePassword(zip, 'right');
    assert.ok(archives.hasPassword(zip));
    const opened = await archives.open(zip);
    assert.ok(opened.kind === 'opened');
    assert.deepStrictEqual(
      await archives.openInside(
        path.join(zip, 'inner.zip'),
        opened.archive,
        'inner.zip',
      ),
      {
        kind: 'refused',
        reason: 'Wrong password',
        needsPassword: true,
        passwordOf: zip,
      },
    );
    archives.usePassword(zip, undefined);
    assert.ok(!archives.hasPassword(zip));
    assert.deepStrictEqual(seen, [undefined, 'right', 'right']);
  });

  test('removes the work folder it made for an extraction the reader refused, with what was taken out into it, but not a folder it was given', async () => {
    const zip = path.join(folder, 'a.zip');
    fs.writeFileSync(zip, 'zip');
    const reader: ArchiveReader = {
      pack: notPacked,
      test: notPacked,
      rename: notPacked,
      add: notPacked,
      remove: notPacked,
      list: () => Promise.resolve({ kind: 'listed', items: [item('a.txt')] }),
      extract: async (_file, _paths, into) => {
        await fs.promises.writeFile(path.join(into, 'half.txt'), 'half');
        return { reason: 'Data Error' };
      },
    };
    const archives = new Archives(reader, 'linux', workFolder);
    const opened = await archives.open(zip);
    assert.ok(opened.kind === 'opened');
    assert.deepStrictEqual(await archives.extract(opened.archive, ['a.txt']), {
      kind: 'refused',
      reason: 'Data Error',
    });
    assert.ok(!fs.existsSync(path.join(folder, 'work-1')));
    const given = path.join(folder, 'given');
    fs.mkdirSync(given);
    await archives.extract(opened.archive, ['a.txt'], { into: given });
    assert.ok(fs.existsSync(path.join(given, 'half.txt')));
  });

  test('removes the work folder of an extraction that was stopped, with what was taken out into it, for a copy out, an archive inside an archive and the tar of a compressed file', async () => {
    const zip = path.join(folder, 'a.zip');
    const tgz = path.join(folder, 'a.tgz');
    fs.writeFileSync(zip, 'zip');
    fs.writeFileSync(tgz, 'tgz');
    const reader: ArchiveReader = {
      pack: notPacked,
      test: notPacked,
      rename: notPacked,
      add: notPacked,
      remove: notPacked,
      list: (file) =>
        Promise.resolve({
          kind: 'listed',
          items: [item(file === tgz ? 'a.tar' : 'inner.zip')],
        }),
      extract: async (_file, _paths, into) => {
        await fs.promises.writeFile(path.join(into, 'half.txt'), 'half');
        throw new Error('The operation was aborted');
      },
    };
    const archives = new Archives(reader, 'linux', workFolder);
    const worksLeft = () =>
      fs.readdirSync(folder).filter((name) => name.startsWith('work-'));

    await assert.rejects(archives.open(tgz), /aborted/);
    const opened = await archives.open(zip);
    assert.ok(opened.kind === 'opened');
    await assert.rejects(
      archives.openInside(
        path.join(zip, 'inner.zip'),
        opened.archive,
        'inner.zip',
      ),
      /aborted/,
    );
    await assert.rejects(
      archives.extract(opened.archive, ['inner.zip']),
      /aborted/,
    );
    assert.strictEqual(works, 3);
    assert.deepStrictEqual(worksLeft(), []);
  });

  test('deletes items from an archive that is a file of its own, with its password, removing the temporary archive 7-Zip left once stopped but nothing there before, and refuses one inside an archive or the tar of a compressed file', async () => {
    const zip = path.join(folder, 'a.zip');
    const tgz = path.join(folder, 'b.tgz');
    fs.writeFileSync(zip, 'zip');
    fs.writeFileSync(tgz, 'tgz');
    fs.writeFileSync(`${zip}.tmp.kept`, 'there before');
    const asked: unknown[] = [];
    let stopped = false;
    const reader: ArchiveReader = {
      pack: notPacked,
      test: notPacked,
      rename: notPacked,
      add: notPacked,
      list: (file) =>
        Promise.resolve({
          kind: 'listed',
          items: [item(file.endsWith('.tgz') ? 'b.tar' : 'inner.zip')],
        }),
      extract: async (_file, paths, into) => {
        for (const each of paths) {
          await fs.promises.writeFile(path.join(into, each), each);
        }
        return undefined;
      },
      remove: async (file, paths, options) => {
        asked.push([
          path.basename(file),
          paths,
          options.password,
          fs.readdirSync(options.listIn),
        ]);
        if (stopped) {
          fs.writeFileSync(`${file}.tmp`, 'half');
          throw new Error('The operation was aborted');
        }
        return { kind: 'packed' };
      },
    };
    const archives = new Archives(reader, 'linux', workFolder);
    const opened = await archives.open(zip);
    assert.ok(opened.kind === 'opened');
    archives.usePassword(zip, 'secret');

    assert.deepStrictEqual(await archives.remove(opened.archive, ['docs']), {
      kind: 'packed',
    });
    stopped = true;
    await assert.rejects(archives.remove(opened.archive, ['docs']), /aborted/);
    assert.deepStrictEqual(
      fs.readdirSync(folder).filter((name) => name.startsWith('a.zip')),
      ['a.zip', 'a.zip.tmp.kept'],
    );

    const inner = await archives.openInside(
      path.join(zip, 'inner.zip'),
      opened.archive,
      'inner.zip',
    );
    const tar = await archives.open(tgz);
    assert.ok(inner.kind === 'opened' && tar.kind === 'opened');
    for (const [unchangeable, name] of [
      [inner.archive, 'inner.zip'],
      [tar.archive, 'b.tgz'],
    ] as const) {
      assert.deepStrictEqual(await archives.remove(unchangeable, ['x']), {
        kind: 'refused',
        reason: strings.commander.archiveUnchangeable(name),
      });
    }
    assert.deepStrictEqual(asked, [
      ['a.zip', ['docs'], 'secret', []],
      ['a.zip', ['docs'], 'secret', []],
    ]);
  });

  test('renames an item of an archive by its path, and makes a folder in it from a folder of its own removed after, with its password', async () => {
    const zip = path.join(folder, 'a.zip');
    fs.writeFileSync(zip, 'zip');
    const asked: unknown[] = [];
    const reader: ArchiveReader = {
      pack: notPacked,
      test: notPacked,
      remove: notPacked,
      list: () =>
        Promise.resolve({ kind: 'listed', items: [item('docs/a.txt')] }),
      extract: () => Promise.resolve(undefined),
      rename: (file, from, to, options) => {
        asked.push(['rename', path.basename(file), from, to, options.password]);
        return Promise.resolve({ kind: 'packed' });
      },
      add: (file, staged, items, options) => {
        asked.push([
          'add',
          path.basename(file),
          items,
          options.password,
          items.every((each) =>
            fs.statSync(path.join(staged, ...each.split('/'))).isDirectory(),
          ),
        ]);
        return Promise.resolve({ kind: 'packed' });
      },
    };
    const archives = new Archives(reader, 'linux', workFolder);
    const opened = await archives.open(zip);
    assert.ok(opened.kind === 'opened');
    archives.usePassword(zip, 'secret');

    await archives.rename(opened.archive, 'docs/a.txt', 'docs/b.txt');
    await archives.addFolder(opened.archive, ['docs'], 'fresh');

    assert.deepStrictEqual(asked, [
      ['rename', 'a.zip', 'docs/a.txt', 'docs/b.txt', 'secret'],
      ['add', 'a.zip', ['docs/fresh'], 'secret', true],
    ]);
    assert.deepStrictEqual(
      fs.readdirSync(folder).filter((name) => name.startsWith('work-')),
      [],
    );
  });

  test('adds items to the root of an archive from the folder they are in, and into a folder of it, or files listed flat, from a folder of its own mirroring that folder, with their dates, removed after', async () => {
    const zip = path.join(folder, 'a.zip');
    const source = path.join(folder, 'source');
    fs.writeFileSync(zip, 'zip');
    fs.mkdirSync(path.join(source, 'sub', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(source, 'a.txt'), 'a');
    fs.writeFileSync(path.join(source, 'sub', 'deep', 'b.txt'), 'b');
    const old = new Date(Date.UTC(2020, 0, 2));
    fs.utimesSync(path.join(source, 'a.txt'), old, old);
    const asked: unknown[] = [];
    const reader: ArchiveReader = {
      pack: notPacked,
      test: notPacked,
      remove: notPacked,
      rename: notPacked,
      list: () => Promise.resolve({ kind: 'listed', items: [item('docs/x')] }),
      extract: () => Promise.resolve(undefined),
      add: (_file, from, items) => {
        asked.push([
          from === source ? 'source' : 'staged',
          items,
          items.map((each) => {
            const staged = path.join(from, ...each.split('/'));
            const stats = fs.statSync(staged);
            return stats.isDirectory()
              ? fs
                  .readdirSync(staged, { recursive: true, encoding: 'utf8' })
                  .toSorted((one, other) => one.localeCompare(other))
              : [
                  fs.readFileSync(staged, 'utf8'),
                  stats.mtimeMs === old.getTime(),
                ];
          }),
        ]);
        return Promise.resolve({ kind: 'packed' });
      },
    };
    const archives = new Archives(reader, 'linux', workFolder);
    const opened = await archives.open(zip);
    assert.ok(opened.kind === 'opened');

    await archives.addItems(opened.archive, [], source, ['a.txt', 'sub']);
    await archives.addItems(opened.archive, ['docs'], source, ['a.txt', 'sub']);
    await archives.addItems(opened.archive, [], source, [
      path.join('sub', 'deep', 'b.txt'),
    ]);

    assert.deepStrictEqual(asked, [
      [
        'source',
        ['a.txt', 'sub'],
        [
          ['a', true],
          ['deep', path.join('deep', 'b.txt')],
        ],
      ],
      [
        'staged',
        ['docs/a.txt', 'docs/sub'],
        [
          ['a', true],
          ['deep', path.join('deep', 'b.txt')],
        ],
      ],
      ['staged', ['b.txt'], [['b', false]]],
    ]);
    assert.deepStrictEqual(
      fs.readdirSync(folder).filter((name) => name.startsWith('work-')),
      [],
    );
  });

  test('never stages a file over another of its name, so two files listed flat leave both originals as they were', async () => {
    const zip = path.join(folder, 'a.zip');
    const source = path.join(folder, 'source');
    fs.writeFileSync(zip, 'zip');
    for (const name of ['one', 'two']) {
      fs.mkdirSync(path.join(source, name), { recursive: true });
      fs.writeFileSync(path.join(source, name, 'same.txt'), name);
    }
    const reader: ArchiveReader = {
      ...readerOf({}).reader,
      list: () => Promise.resolve({ kind: 'listed', items: [item('x.txt')] }),
      add: () => Promise.resolve({ kind: 'packed' }),
    };
    const archives = new Archives(reader, 'linux', workFolder);
    const opened = await archives.open(zip);
    assert.ok(opened.kind === 'opened');

    await assert.rejects(
      archives.addItems(opened.archive, [], source, [
        path.join('one', 'same.txt'),
        path.join('two', 'same.txt'),
      ]),
    );

    assert.deepStrictEqual(
      ['one', 'two'].map((name) =>
        fs.readFileSync(path.join(source, name, 'same.txt'), 'utf8'),
      ),
      ['one', 'two'],
    );
    assert.deepStrictEqual(
      fs.readdirSync(folder).filter((name) => name.startsWith('work-')),
      [],
    );
  });

  test('changes an archive one change at a time, each once the one before it ended, failed or not, while another archive changes alongside', async () => {
    const zip = path.join(folder, 'a.zip');
    const other = path.join(folder, 'b.zip');
    fs.writeFileSync(zip, 'a');
    fs.writeFileSync(other, 'b');
    fs.writeFileSync(path.join(folder, 'new.txt'), 'new');
    const started: string[] = [];
    const ends = new Map<string, (end: Packing | Error) => void>();
    const change = (what: string) =>
      new Promise<Packing>((resolve, reject) => {
        started.push(what);
        ends.set(what, (end) => {
          if (end instanceof Error) {
            reject(end);
          } else {
            resolve(end);
          }
        });
      });
    const reader: ArchiveReader = {
      ...readerOf({}).reader,
      list: () => Promise.resolve({ kind: 'listed', items: [item('x.txt')] }),
      add: (file, _from, items) =>
        change(`add ${path.basename(file)} ${items.join(' ')}`),
      remove: (file, paths) =>
        change(`remove ${path.basename(file)} ${paths.join(' ')}`),
      rename: (file, from, to) =>
        change(`rename ${path.basename(file)} ${from} ${to}`),
    };
    const archives = new Archives(reader, 'linux', workFolder);
    const first = await archives.open(zip);
    const second = await archives.open(other);
    assert.ok(first.kind === 'opened' && second.kind === 'opened');
    const end = async (what: string, outcome: Packing | Error) => {
      await waitFor(() => ends.has(what), what);
      ends.get(what)?.(outcome);
    };

    const added = archives.addItems(first.archive, [], folder, ['new.txt']);
    const removed = archives.remove(first.archive, ['x.txt']);
    const renamed = archives.rename(first.archive, 'x.txt', 'y.txt');
    const elsewhere = archives.remove(second.archive, ['x.txt']);
    await waitFor(() => started.length >= 2, 'the first two changes');
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.deepStrictEqual(started.toSorted(), [
      'add a.zip new.txt',
      'remove b.zip x.txt',
    ]);
    await end('add a.zip new.txt', new Error('7-Zip failed.'));
    await assert.rejects(added);
    await end('remove a.zip x.txt', { kind: 'packed' });
    assert.deepStrictEqual(await removed, { kind: 'packed' });
    await end('rename a.zip x.txt y.txt', { kind: 'packed' });
    await end('remove b.zip x.txt', { kind: 'packed' });
    assert.deepStrictEqual(await Promise.all([renamed, elsewhere]), [
      { kind: 'packed' },
      { kind: 'packed' },
    ]);
    assert.deepStrictEqual(started.slice(2), [
      'remove a.zip x.txt',
      'rename a.zip x.txt y.txt',
    ]);
  });

  test('keeps the work folders of each run of the app apart, clearing its own as it quits and those of runs ended as it starts, but none of a run still quitting, as a quitting run deleted what the next took out', async () => {
    const root = path.join(folder, 'archives');
    const alive = new Set([100, 200]);
    const ours = workFolders(root, 200, (pid) => alive.has(pid));
    const quitting = workFolders(root, 100, (pid) => alive.has(pid));
    const ended = workFolders(root, 300, (pid) => alive.has(pid));
    const [mine, theirs, gone] = await Promise.all(
      [ours, quitting, ended].map((each) => each.next()),
    );
    fs.mkdirSync(path.join(root, 'not a run'));

    await ours.clearEnded();
    assert.deepStrictEqual(
      [mine, theirs, gone].map((each) => fs.existsSync(each)),
      [true, true, false],
    );
    await ours.clear();
    assert.deepStrictEqual(
      [mine, theirs].map((each) => fs.existsSync(each)),
      [false, true],
    );
    assert.ok(fs.existsSync(path.join(root, 'not a run')));
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
