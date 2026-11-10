import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  ArchiveTree,
  type ArchiveAccess,
  type ArchiveItem,
  type Extracting,
  type OpenedArchive,
  type Packing,
} from '../../../../tools/commander/main/archives';
import { copiedBetween } from '../../../../tools/commander/main/betweenArchives';
import { strings } from '../../../../shared/strings';
import { removeFolder, tempFolder } from '../../../repositories';

const openedAt = (file: string): OpenedArchive => ({
  file,
  version: '1',
  source: file,
  tree: new ArchiveTree([], 'linux'),
});

const source = openedAt(path.join('C:', 'from.zip'));
const target = openedAt(path.join('D:', 'into.7z'));

const item = (itemPath: string): ArchiveItem => ({
  path: itemPath,
  folder: false,
  size: 10,
  modified: 0,
  hiddenAttribute: false,
  link: false,
  encrypted: false,
});

const rootsOf = (
  listed: readonly string[],
  paths: readonly string[],
  platform: NodeJS.Platform,
) => {
  const tree = new ArchiveTree(listed.map(item), platform);
  return paths.flatMap((each) => {
    const parts = each.split('/');
    return tree.branch(parts.slice(0, -1), parts.at(-1) ?? each) ?? [];
  });
};

const copied = (
  archives: ArchiveAccess,
  {
    paths = ['docs', 'top.txt'],
    depth = 0,
    withoutFolders = false,
    move = false,
    listed = ['docs/a.txt', 'docs/deep/b.txt', 'top.txt'],
    platform = 'linux',
  }: {
    readonly paths?: readonly string[];
    readonly depth?: number;
    readonly withoutFolders?: boolean;
    readonly move?: boolean;
    readonly listed?: readonly string[];
    readonly platform?: NodeJS.Platform;
  } = {},
) => {
  const progress: unknown[] = [];
  return {
    progress,
    done: copiedBetween(
      archives,
      {
        archive: source,
        paths,
        depth,
        withoutFolders,
        files: 3,
        bytes: 30,
        roots: rootsOf(listed, paths, platform),
        platform,
      },
      { archive: target, inner: ['into', 'here'] },
      move,
      {
        onTotals: (totals) => progress.push(['totals', totals]),
        onProgress: (each) => progress.push(['progress', each]),
      },
    ),
  };
};

suite('Copying from one archive into another', () => {
  let folder: string;
  let calls: unknown[][];
  let usedPasswords: (string | undefined)[];

  beforeEach(() => {
    folder = tempFolder('between-archives');
    calls = [];
    usedPasswords = [];
  });

  afterEach(() => {
    removeFolder(folder);
  });

  const archivesWith = ({
    staged = ['docs/a.txt', 'docs/deep/b.txt', 'top.txt'],
    extracted,
    added = () => Promise.resolve({ kind: 'packed' }),
    removed = () => Promise.resolve({ kind: 'packed' }),
  }: {
    readonly staged?: readonly string[];
    readonly extracted?: Extracting;
    readonly added?: () => Promise<Packing>;
    readonly removed?: () => Promise<Packing>;
  }): ArchiveAccess & { readonly work: string } => {
    const work = path.join(folder, 'work');
    return {
      work,
      open: () => Promise.reject(new Error('Nothing is opened here.')),
      openInside: () => Promise.reject(new Error('Nothing is opened here.')),
      usePassword: (file, password) => {
        usedPasswords.push(password);
        calls.push(['password', file]);
      },
      hasPassword: () => false,
      unchangeable: () => undefined,
      pack: () => Promise.reject(new Error('Nothing is packed here.')),
      rename: () => Promise.reject(new Error('Nothing is renamed here.')),
      addFolder: () => Promise.reject(new Error('No folder is made here.')),
      test: () => Promise.reject(new Error('Nothing is tested here.')),
      within: () => undefined,
      fileHolding: () => Promise.resolve(undefined),
      extract: (archive, paths, options) => {
        calls.push(['extract', archive.file, paths, options?.withoutFolders]);
        options?.onProgress?.({ percent: 50, files: 1, current: 'docs/a.txt' });
        for (const each of staged) {
          const file = path.join(work, ...each.split('/'));
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, each);
        }
        return Promise.resolve(
          extracted ?? { kind: 'extracted', folder: work },
        );
      },
      addItems: (archive, inner, from, items) => {
        calls.push([
          'add',
          archive.file,
          inner,
          path.relative(work, from),
          items,
          fs.existsSync(work),
        ]);
        return added();
      },
      remove: (archive, paths) => {
        calls.push(['remove', archive.file, paths]);
        return removed();
      },
    };
  };

  test('takes the items out of the one archive, telling how far as it goes, then adds them from where they were taken into the folder of the other, removing them once added', async () => {
    const archives = archivesWith({});
    const { done, progress } = copied(archives);

    assert.deepStrictEqual(await done, { kind: 'packed' });
    assert.deepStrictEqual(calls, [
      ['extract', source.file, ['docs', 'top.txt'], false],
      ['add', target.file, ['into', 'here'], '', ['docs', 'top.txt'], true],
    ]);
    assert.deepStrictEqual(progress, [
      ['totals', { files: 3, bytes: 30 }],
      ['progress', { percent: 50, files: 1, current: 'docs/a.txt' }],
    ]);
    assert.ok(!fs.existsSync(archives.work));
  });

  test('adds the items of a folder inside the archive from that folder where they were taken, and files listed flat from where they were taken without their folders', async () => {
    const inFolder = archivesWith({
      staged: ['docs/a.txt', 'docs/deep/b.txt'],
    });
    await copied(inFolder, {
      paths: ['docs/a.txt', 'docs/deep'],
      depth: 1,
    }).done;
    removeFolder(inFolder.work);
    await copied(archivesWith({ staged: ['a.txt', 'b.txt'] }), {
      paths: ['docs/a.txt', 'docs/deep/b.txt'],
      withoutFolders: true,
    }).done;

    assert.deepStrictEqual(
      calls.filter(([kind]) => kind === 'add'),
      [
        ['add', target.file, ['into', 'here'], 'docs', ['a.txt', 'deep'], true],
        ['add', target.file, ['into', 'here'], '', ['a.txt', 'b.txt'], true],
      ],
    );
  });

  test('deletes the items of a move from the one archive only once added to the other without a warning, saying they are kept in it when not', async () => {
    assert.deepStrictEqual(
      await copied(archivesWith({}), { move: true }).done,
      { kind: 'packed' },
    );
    assert.deepStrictEqual(calls.at(-1), [
      'remove',
      source.file,
      ['docs', 'top.txt'],
    ]);

    calls = [];
    removeFolder(path.join(folder, 'work'));
    assert.deepStrictEqual(
      await copied(
        archivesWith({
          added: () => Promise.resolve({ kind: 'refused', reason: 'Full.' }),
        }),
        { move: true },
      ).done,
      { kind: 'refused', reason: 'Full.' },
    );
    removeFolder(path.join(folder, 'work'));
    assert.deepStrictEqual(
      await copied(
        archivesWith({
          added: () =>
            Promise.resolve({ kind: 'packed', warning: 'top.txt: locked' }),
        }),
        { move: true },
      ).done,
      {
        kind: 'packed',
        warning: `top.txt: locked ${strings.commander.originalsKept}`,
      },
    );
    assert.ok(calls.every(([kind]) => kind !== 'remove'));

    removeFolder(path.join(folder, 'work'));
    assert.deepStrictEqual(
      await copied(
        archivesWith({
          removed: () =>
            Promise.resolve({ kind: 'refused', reason: 'It is read-only.' }),
        }),
        { move: true },
      ).done,
      {
        kind: 'packed',
        warning: strings.commander.movedOutKept('from.zip', 'It is read-only.'),
      },
    );
  });

  test('keeps in the one archive what 7-Zip took out under another name or not at all, saying so, as Makefile and makefile land as one file where names have no case', async () => {
    assert.deepStrictEqual(
      await copied(archivesWith({ staged: ['src/Makefile', 'top.txt'] }), {
        move: true,
        paths: ['src', 'top.txt'],
        listed: ['src/Makefile', 'src/makefile', 'top.txt'],
        platform: 'win32',
      }).done,
      {
        kind: 'packed',
        warning: strings.commander.keptUnmatched('from.zip', 2),
      },
    );
    assert.deepStrictEqual(calls.at(-1), ['remove', source.file, ['top.txt']]);
  });

  test('says why nothing was taken out of the one archive, forgetting a password found wrong, and adds nothing', async () => {
    assert.deepStrictEqual(
      await copied(
        archivesWith({
          staged: [],
          extracted: {
            kind: 'refused',
            reason: 'Wrong password',
            needsPassword: true,
          },
        }),
      ).done,
      {
        kind: 'refused',
        reason: strings.commander.couldNotExtract('Wrong password'),
      },
    );
    assert.deepStrictEqual(await copied(archivesWith({ staged: [] })).done, {
      kind: 'refused',
      reason: strings.commander.couldNotExtract(
        strings.commander.nothingTakenOut,
      ),
    });

    assert.deepStrictEqual(usedPasswords, [undefined]);
    assert.ok(calls.every(([kind]) => kind !== 'add'));
  });
});
