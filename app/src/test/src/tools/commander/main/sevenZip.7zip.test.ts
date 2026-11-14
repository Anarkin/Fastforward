import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  Archives,
  filesUnder,
  type PackPlan,
} from '../../../../../tools/commander/main/archives';
import {
  sevenZipAt,
  sevenZipProgram,
  sevenZipReader,
} from '../../../../../tools/commander/main/sevenZip';
import { strings } from '../../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
import { storedZip } from '../../../../helpers/zips';

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

  test('lists the items of a zip and of a 7z by the paths 7-Zip names them by, with their sizes', async () => {
    for (const name of ['a.zip', 'a.7z']) {
      const listing = await reader.list(await packed(name));
      assert.strictEqual(listing.kind, 'listed');
      assert.deepStrictEqual(
        listing.items
          .map((item) => [item.path, item.folder, item.size])
          .toSorted(byText),
        [
          ['docs', true, undefined],
          ['docs/readme.md', false, 9],
          ['src', true, undefined],
          ['src/app', true, undefined],
          ['src/app/main.ts', false, 11],
          ['top.txt', false, 7],
        ],
      );
    }
  });

  test('refuses a file that is no archive, and an archive whose names are encrypted, saying why and that a password is needed, without waiting for one', async () => {
    const text = path.join(folder, 'plain.txt');
    fs.writeFileSync(text, 'not an archive\n');
    assert.deepStrictEqual(await reader.list(text), {
      kind: 'refused',
      reason: 'Cannot open the file as archive',
      noArchive: true,
    });
    const secret = await packed('secret.7z', '-psecret', '-mhe=on');
    const needed = {
      kind: 'refused',
      reason: 'Cannot open encrypted archive. Wrong password?',
      needsPassword: true,
    };
    assert.deepStrictEqual(await reader.list(secret), needed);
    assert.deepStrictEqual(
      await reader.list(secret, undefined, 'wrong'),
      needed,
    );
  });

  test('lists an archive whose names are encrypted and takes its files out with the password given, refusing a wrong one as needing a password', async () => {
    const secret = await packed('secret.7z', '-psecret', '-mhe=on');
    const listing = await reader.list(secret, undefined, 'secret');
    assert.ok(listing.kind === 'listed');
    assert.ok(listing.items.some((item) => item.path === 'top.txt'));
    const into = path.join(folder, 'out');
    assert.strictEqual(
      (await reader.extract(secret, ['top.txt'], into, { password: 'wrong' }))
        ?.needsPassword,
      true,
    );
    assert.strictEqual(
      await reader.extract(secret, ['top.txt'], into, { password: 'secret' }),
      undefined,
    );
    assert.strictEqual(
      fs.readFileSync(path.join(into, 'top.txt'), 'utf8'),
      'top.txt',
    );
  });

  const packedAs = (name: string, planned: Partial<PackPlan> = {}) => {
    const archive = path.join(folder, name);
    return reader.pack(
      {
        folder: content,
        items: ['docs', 'top.txt'],
        archive,
        format: 'zip',
        level: 'normal',
        ...planned,
      },
      archive,
    );
  };

  test('packs the items of a folder into a zip keeping their folders, encrypting its files with AES-256 by the password given, which 7-Zip takes in ASCII alone for a zip', async () => {
    assert.deepStrictEqual(await packedAs('a.zip', { password: 'secret' }), {
      kind: 'packed',
    });
    assert.strictEqual(
      (await packedAs('b.zip', { password: 'pässwörd' })).kind,
      'refused',
    );
    const listing = await reader.list(
      path.join(folder, 'a.zip'),
      undefined,
      'secret',
    );
    assert.ok(listing.kind === 'listed');
    assert.deepStrictEqual(
      listing.items.map((item) => [item.path, item.encrypted]).toSorted(byText),
      [
        ['docs', false],
        ['docs/readme.md', true],
        ['top.txt', true],
      ],
    );
  });

  test('tells the files and bytes it is to pack, straight into a zip and through the tar piped into a gzip', async () => {
    for (const format of ['zip', 'tar.gz'] as const) {
      const totals: unknown[] = [];
      const archive = path.join(folder, `totals.${format}`);
      await reader.pack(
        {
          folder: content,
          items: ['docs', 'top.txt'],
          archive,
          format,
          level: 'normal',
        },
        archive,
        { onTotals: (told) => totals.push(told), onProgress: () => undefined },
      );
      assert.deepStrictEqual(totals, [{ files: 2, bytes: 16 }], format);
    }
  });

  test('packs a 7z whose names need the password, and a compressed tar holding the tar of the items', async () => {
    await packedAs('a.7z', {
      format: '7z',
      level: 'ultra',
      password: 'secret',
      encryptNames: true,
    });
    const locked = await reader.list(path.join(folder, 'a.7z'));
    assert.ok(locked.kind === 'refused' && locked.needsPassword === true);

    for (const format of ['tar.gz', 'tar.xz'] as const) {
      const name = `a.${format}`;
      assert.deepStrictEqual(await packedAs(name, { format }), {
        kind: 'packed',
      });
      const listing = await reader.list(path.join(folder, name));
      assert.deepStrictEqual(
        listing.kind === 'listed' && listing.items.map((item) => item.path),
        ['a.tar'],
        format,
      );
    }
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

  test('deletes a folder with all that is in it and a file from a zip, keeping the rest', async () => {
    const zip = await packed('d.zip');
    const listIn = path.join(folder, 'lists');
    fs.mkdirSync(listIn);
    assert.deepStrictEqual(
      await reader.remove(zip, ['docs', 'top.txt'], { listIn }),
      { kind: 'packed' },
    );
    const listing = await reader.list(zip);
    assert.deepStrictEqual(
      listing.kind === 'listed' &&
        listing.items.map((item) => item.path).toSorted(byText),
      ['src', 'src/app', 'src/app/main.ts'],
    );
  });

  test('deletes, extracts and renames alone each of the items whose names differ only in case, in spaces around them or by a quote, but on Windows renames none with a quote, which its command line cannot hold, and refuses a name with a line break', async () => {
    const names = ['a.txt', 'A.TXT', ' a.txt', 'a.txt ', 'q"a.txt'];
    let zips = 0;
    const zip = () => {
      const file = path.join(folder, `same-${++zips}.zip`);
      fs.writeFileSync(
        file,
        storedZip(names.map((name) => [name, `text of ${name}`])),
      );
      return file;
    };
    const listIn = path.join(folder, 'lists');
    fs.mkdirSync(listIn);
    const namesIn = async (file: string) => {
      const listing = await reader.list(file);
      return listing.kind === 'listed'
        ? listing.items.map((item) => item.path).toSorted(byText)
        : listing;
    };

    for (const [index, name] of names.entries()) {
      const removedFrom = zip();
      assert.deepStrictEqual(
        await reader.remove(removedFrom, [name], { listIn }),
        { kind: 'packed' },
        name,
      );
      assert.deepStrictEqual(
        await namesIn(removedFrom),
        names.filter((each) => each !== name).toSorted(byText),
        name,
      );
      const into = path.join(folder, `out-${index}`);
      assert.strictEqual(
        await reader.extract(zip(), [name], into, { withoutFolders: true }),
        undefined,
        name,
      );
      assert.deepStrictEqual(
        fs
          .readdirSync(into)
          .map((file) => fs.readFileSync(path.join(into, file), 'utf8')),
        [`text of ${name}`],
        name,
      );
      if (process.platform === 'win32' && name.includes('"')) {
        continue;
      }
      const renamedIn = zip();
      assert.deepStrictEqual(
        await reader.rename(renamedIn, name, 'renamed.txt', {}),
        { kind: 'packed' },
        name,
      );
      assert.deepStrictEqual(
        await namesIn(renamedIn),
        [...names.filter((each) => each !== name), 'renamed.txt'].toSorted(
          byText,
        ),
        name,
      );
    }
    const refused = {
      kind: 'refused',
      reason: strings.commander.lineBreakInName,
    };
    assert.deepStrictEqual(
      await reader.remove(zip(), ['line\nbreak.txt'], { listIn }),
      refused,
    );
    assert.deepStrictEqual(
      await reader.extract(zip(), ['line\nbreak.txt'], path.join(folder, 'x')),
      { reason: strings.commander.lineBreakInName },
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

  test('packs and adds more items than a command line of Windows can name, into a zip and through the tar of a compressed tar', async () => {
    const many = path.join(folder, 'many');
    fs.mkdirSync(many);
    const names = Array.from(
      { length: 300 },
      (_, index) => `${String(index).padStart(3, '0')} ${'n'.repeat(120)}.txt`,
    );
    for (const name of names) {
      fs.writeFileSync(path.join(many, name), name);
    }
    const pathsIn = async (archive: string) => {
      const listing = await reader.list(archive);
      return listing.kind === 'listed'
        ? listing.items.map((item) => item.path).toSorted()
        : listing;
    };
    for (const format of ['zip', 'tar.gz'] as const) {
      const archive = path.join(folder, `many.${format}`);
      assert.deepStrictEqual(
        await reader.pack(
          { folder: many, items: names, archive, format, level: 'store' },
          archive,
        ),
        { kind: 'packed' },
        format,
      );
    }
    assert.deepStrictEqual(await pathsIn(path.join(folder, 'many.zip')), names);
    const tar = path.join(folder, 'many.tar');
    await reader.extract(
      path.join(folder, 'many.tar.gz'),
      ['many.tar'],
      folder,
    );
    assert.deepStrictEqual(await pathsIn(tar), names);

    const zip = await packed('added.zip');
    const archives = new Archives(reader, process.platform, workFolder);
    const opened = await archives.open(zip);
    assert.ok(opened.kind === 'opened');
    assert.deepStrictEqual(
      await archives.addItems(opened.archive, [], many, names),
      { kind: 'packed' },
    );
    const added = await pathsIn(zip);
    assert.ok(Array.isArray(added));
    assert.deepStrictEqual(
      added.filter((each) => names.includes(each)),
      names,
    );
  });

  test('cuts an archive into volumes of the size asked, listed together from the first', async () => {
    made('big.txt', 'x'.repeat(250_000));
    await packedAs('v.zip', {
      items: ['big.txt'],
      level: 'store',
      volumeBytes: 100_000,
    });
    assert.deepStrictEqual(
      fs
        .readdirSync(folder)
        .filter((name) => name.startsWith('v.zip'))
        .toSorted(byText),
      ['v.zip.001', 'v.zip.002', 'v.zip.003'],
    );
    const listing = await reader.list(path.join(folder, 'v.zip.001'));
    assert.deepStrictEqual(
      listing.kind === 'listed' && listing.items.map((item) => item.path),
      ['big.txt'],
    );
  });

  test('marks the items of an archive whose contents alone are encrypted', async () => {
    const listing = await reader.list(await packed('secret.zip', '-psecret'));
    assert.strictEqual(listing.kind, 'listed');
    assert.ok(
      listing.items
        .filter((item) => !item.folder)
        .every((item) => item.encrypted),
    );
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

  test('extracts the items asked for, a folder whole, taking a name with wildcard characters as it is', async () => {
    const zip = path.join(folder, 'wild.zip');
    fs.writeFileSync(
      zip,
      storedZip([
        ['q?.txt', 'asked'],
        ['qa.txt', 'not asked'],
        ['docs/readme.md', 'readme'],
        ['docs/more/deep.md', 'deep'],
      ]),
    );
    const into = path.join(folder, 'out');
    assert.strictEqual(
      await reader.extract(zip, ['q?.txt', 'docs'], into),
      undefined,
    );
    assert.deepStrictEqual(
      (await filesUnder(into))
        .map((file) => path.relative(into, file).replaceAll('\\', '/'))
        .toSorted(byText),
      [
        'docs/more/deep.md',
        'docs/readme.md',
        process.platform === 'win32' ? 'q_.txt' : 'q?.txt',
      ],
    );
    assert.deepStrictEqual(fs.readdirSync(folder).toSorted(byText), [
      'content',
      'out',
      'wild.zip',
    ]);
  });

  test('extracts the files asked for without their folders when told, all into the one folder', async () => {
    const zip = await packed('a.zip');
    const into = path.join(folder, 'out');
    assert.strictEqual(
      await reader.extract(zip, ['docs/readme.md', 'src/app/main.ts'], into, {
        withoutFolders: true,
      }),
      undefined,
    );
    assert.deepStrictEqual(fs.readdirSync(into).toSorted(byText), [
      'main.ts',
      'readme.md',
    ]);
  });

  test('extracts nothing outside the folder it is told, whatever the names in the archive say', async () => {
    const zip = path.join(folder, 'escaping.zip');
    fs.writeFileSync(
      zip,
      storedZip([
        ['../evil.txt', 'evil'],
        ['../../evil2.txt', 'evil'],
        ['/root.txt', 'root'],
      ]),
    );
    const into = path.join(folder, 'deep', 'out');
    await reader.extract(
      zip,
      ['../evil.txt', '../../evil2.txt', '/root.txt'],
      into,
    );
    assert.deepStrictEqual(
      (await filesUnder(folder))
        .filter((file) => !file.startsWith(content))
        .map((file) => path.relative(folder, file).replaceAll('\\', '/'))
        .toSorted(byText),
      [
        'deep/out/evil.txt',
        'deep/out/evil2.txt',
        'deep/out/root.txt',
        'escaping.zip',
      ],
    );
  });

  test.skipIf(process.platform !== 'win32')(
    'marks what it extracts from a downloaded archive as downloaded too, as Windows marks the archive',
    async () => {
      const zip = await packed('downloaded.zip');
      fs.writeFileSync(
        `${zip}:Zone.Identifier`,
        '[ZoneTransfer]\r\nZoneId=3\r\n',
      );
      const into = path.join(folder, 'out');
      await reader.extract(zip, ['top.txt'], into);
      assert.match(
        fs.readFileSync(path.join(into, 'top.txt:Zone.Identifier'), 'utf8'),
        /ZoneId=3/,
      );
    },
  );
});
