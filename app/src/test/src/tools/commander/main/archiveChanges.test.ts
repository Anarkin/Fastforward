import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  Archives,
  workFolders,
  type ArchiveReader,
  type Packing,
} from '../../../../../tools/commander/main/archives';
import { strings } from '../../../../../lib/shared/strings';
import { waitFor } from '../../../../helpers/fixtures';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
import { item, notPacked, readerOf } from './archivesFixtures';

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
