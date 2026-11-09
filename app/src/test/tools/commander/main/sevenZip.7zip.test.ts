import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { crc32 } from 'node:zlib';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  Archives,
  filesUnder,
} from '../../../../tools/commander/main/archives';
import {
  sevenZipAt,
  sevenZipProgram,
  sevenZipReader,
} from '../../../../tools/commander/main/sevenZip';
import { removeFolder, tempFolder } from '../../../repositories';

const appFolder = path.join(__dirname, '..', '..', '..', '..', '..');

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

function storedZip(entries: readonly (readonly [string, string])[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.from(text, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

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

  test('refuses a file that is no archive, and an archive whose names are encrypted, saying why, without waiting for a password', async () => {
    const text = path.join(folder, 'plain.txt');
    fs.writeFileSync(text, 'not an archive\n');
    assert.deepStrictEqual(await reader.list(text), {
      kind: 'refused',
      reason: 'Cannot open the file as archive',
    });
    const secret = await packed('secret.7z', '-psecret', '-mhe=on');
    assert.deepStrictEqual(await reader.list(secret), {
      kind: 'refused',
      reason: 'Cannot open encrypted archive. Wrong password?',
    });
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
