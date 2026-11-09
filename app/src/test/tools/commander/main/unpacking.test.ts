import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  ArchiveTree,
  type ArchiveAccess,
  type ArchiveItem,
  type Extracting,
  type ExtractProgress,
  type OpenedArchive,
  type Packing,
  type PackOptions,
} from '../../../../tools/commander/main/archives';
import { strings } from '../../../../shared/strings';
import type { TransferPlan } from '../../../../tools/commander/main/transfer';
import type {
  TransferCommand,
  TransferEvent,
} from '../../../../tools/commander/main/transferProtocol';
import type { TransferListener } from '../../../../tools/commander/main/transfers';
import { unpackingFirst } from '../../../../tools/commander/main/unpacking';
import { waitFor } from '../../../fixtures';
import { removeFolder, tempFolder } from '../../../repositories';

const archive: OpenedArchive = {
  file: path.join('C:', 'Downloads', 'a.zip'),
  version: '1',
  source: path.join('C:', 'Downloads', 'a.zip'),
  tree: new ArchiveTree([], 'linux'),
};

const plan: TransferPlan = {
  sources: [path.join(archive.file, 'docs', 'a.txt')],
  target: path.join('D:', 'target'),
  move: false,
};

const archivesExtracting = (
  extract: (
    signal: AbortSignal | undefined,
    onProgress: ((progress: ExtractProgress) => void) | undefined,
  ) => Promise<Extracting>,
): ArchiveAccess => ({
  open: () => Promise.reject(new Error('not opened here')),
  openInside: () => Promise.reject(new Error('not opened here')),
  usePassword: () => {},
  hasPassword: () => false,
  pack: () => Promise.reject(new Error('Nothing is packed here.')),
  remove: () => Promise.reject(new Error('Nothing is deleted here.')),
  rename: () => Promise.reject(new Error('Nothing is renamed here.')),
  addFolder: () => Promise.reject(new Error('No folder is made here.')),
  addItems: () => Promise.reject(new Error('Nothing is added here.')),
  test: () => Promise.reject(new Error('Nothing is tested here.')),
  unchangeable: () => undefined,
  within: () => undefined,
  fileHolding: () => Promise.resolve(undefined),
  extract: (_archive, _paths, options) =>
    extract(options?.signal, options?.onProgress),
});

suite('Unpacking before a transfer', () => {
  let folder: string;
  let events: TransferEvent[];
  let stoppedWith: number[];
  let inner: {
    readonly commands: TransferCommand[];
    readonly listener: TransferListener;
    disposed: boolean;
  }[];

  const listener: TransferListener = {
    event: (event) => events.push(event),
    stopped: (code) => stoppedWith.push(code),
  };

  const connect = (listening: TransferListener) => {
    const made = {
      commands: [] as TransferCommand[],
      listener: listening,
      disposed: false,
    };
    inner.push(made);
    return {
      send: (command: TransferCommand) => made.commands.push(command),
      dispose: () => {
        made.disposed = true;
      },
    };
  };

  const staged = async () => {
    const work = path.join(folder, 'work');
    fs.mkdirSync(path.join(work, 'docs', 'sub'), { recursive: true });
    fs.writeFileSync(path.join(work, 'docs', 'a.txt'), 'a');
    fs.writeFileSync(path.join(work, 'docs', 'sub', 'b.txt'), 'b');
    return work;
  };

  beforeEach(() => {
    folder = tempFolder('unpacking');
    events = [];
    stoppedWith = [];
    inner = [];
  });

  afterEach(() => {
    removeFolder(folder);
  });

  test('takes the items out of the archive first, telling how far as the progress of the copy, then moves them from where they were taken into the target through a transfer, passing on what it asks and is answered, and removes them once it is done', async () => {
    let work = '';
    const connection = unpackingFirst(
      {
        archives: archivesExtracting(async (_signal, onProgress) => {
          onProgress?.({ percent: 50, files: 1, current: 'docs/a.txt' });
          work = await staged();
          return { kind: 'extracted', folder: work };
        }),
        archive,
        paths: ['docs/a.txt', 'docs/sub'],
        depth: 1,
        withoutFolders: false,
        files: 2,
        bytes: 100,
      },
      connect,
    )(listener);

    connection.send({ type: 'start', plan });
    await waitFor(() => inner.length === 1, 'the transfer to start');
    connection.send({
      type: 'answer',
      reply: { answer: 'overwrite', all: true },
    });
    const [transfer] = inner;
    assert.ok(transfer !== undefined);
    transfer.listener.event({
      type: 'progress',
      progress: { files: 1, totalFiles: 2, bytes: 1, totalBytes: 2 },
    });
    transfer.listener.event({ type: 'done', stopped: false });

    assert.deepStrictEqual(transfer.commands, [
      {
        type: 'start',
        plan: {
          sources: [
            path.join(work, 'docs', 'a.txt'),
            path.join(work, 'docs', 'sub'),
          ],
          target: plan.target,
          move: true,
        },
      },
      { type: 'answer', reply: { answer: 'overwrite', all: true } },
    ]);
    assert.deepStrictEqual(events, [
      {
        type: 'progress',
        progress: {
          files: 1,
          totalFiles: 2,
          bytes: 50,
          totalBytes: 100,
          current: 'docs/a.txt',
        },
      },
      {
        type: 'progress',
        progress: { files: 1, totalFiles: 2, bytes: 1, totalBytes: 2 },
      },
      { type: 'done', stopped: false },
    ]);
    await waitFor(() => !fs.existsSync(work), 'what was taken out to go');
  });

  test('stops taking the items out once stopped, ending stopped without a transfer', async () => {
    let aborted = false;
    const connection = unpackingFirst(
      {
        archives: archivesExtracting(
          (signal) =>
            new Promise((_resolve, reject) => {
              signal?.addEventListener('abort', () => {
                aborted = true;
                reject(new Error('The operation was aborted'));
              });
            }),
        ),
        archive,
        paths: ['docs/a.txt'],
        depth: 1,
        withoutFolders: false,
        files: 1,
        bytes: 1,
      },
      connect,
    )(listener);

    connection.send({ type: 'start', plan });
    connection.send({ type: 'stop' });
    await waitFor(() => events.length > 0, 'the copy to end');

    assert.ok(aborted);
    assert.deepStrictEqual(events, [{ type: 'done', stopped: true }]);
    assert.deepStrictEqual(inner, []);
  });

  test('says why nothing could be taken out of the archive as the failure of the copy, then ends it', async () => {
    const connection = unpackingFirst(
      {
        archives: archivesExtracting(() =>
          Promise.resolve({ kind: 'refused', reason: 'Data Error' }),
        ),
        archive,
        paths: ['docs/a.txt'],
        depth: 1,
        withoutFolders: false,
        files: 1,
        bytes: 1,
      },
      connect,
    )(listener);

    connection.send({ type: 'start', plan });
    await waitFor(() => events.length === 2, 'the copy to end');

    assert.deepStrictEqual(events, [
      { type: 'failed', name: 'a.zip', reason: 'Data Error' },
      { type: 'done', stopped: false },
    ]);
    assert.deepStrictEqual(inner, []);
  });

  test('stops the transfer and the taking out when disposed, passing on that the transfer stopped', async () => {
    const connection = unpackingFirst(
      {
        archives: archivesExtracting(async () => ({
          kind: 'extracted',
          folder: await staged(),
        })),
        archive,
        paths: ['docs/a.txt'],
        depth: 1,
        withoutFolders: false,
        files: 1,
        bytes: 1,
      },
      connect,
    )(listener);
    connection.send({ type: 'start', plan });
    await waitFor(() => inner.length === 1, 'the transfer to start');
    inner[0]?.listener.stopped(3);
    connection.dispose();

    assert.deepStrictEqual(stoppedWith, [3]);
    assert.strictEqual(inner[0]?.disposed, true);
  });
});

const fileOf = (at: string): ArchiveItem => ({
  path: at,
  folder: false,
  size: 1,
  modified: 0,
  hiddenAttribute: false,
  link: false,
  encrypted: false,
});

const aborted = (signal: AbortSignal | undefined) =>
  new Promise<Packing>((_resolve, reject) => {
    signal?.addEventListener('abort', () =>
      reject(new Error('The operation was aborted')),
    );
  });

suite('Moving out of an archive', () => {
  let folder: string;
  let runs: number;

  beforeEach(() => {
    folder = tempFolder('moving-out');
    runs = 0;
  });

  afterEach(() => {
    removeFolder(folder);
  });

  const movingOut = ({
    files,
    staged = files,
    roots,
    withoutFolders = false,
    platform = 'linux',
    removed = () => Promise.resolve({ kind: 'packed' }),
  }: {
    readonly files: readonly string[];
    readonly staged?: readonly string[];
    readonly roots: readonly string[];
    readonly withoutFolders?: boolean;
    readonly platform?: NodeJS.Platform;
    readonly removed?: (options: PackOptions) => Promise<Packing>;
  }) => {
    const work = path.join(folder, `work${++runs}`);
    const stagedAt = (relative: string) =>
      path.join(work, ...relative.split('/'));
    const events: TransferEvent[] = [];
    const removing: (readonly string[])[] = [];
    const inner: {
      readonly commands: TransferCommand[];
      readonly listener: TransferListener;
      disposed: boolean;
    }[] = [];
    const tree = new ArchiveTree(files.map(fileOf), 'linux');
    const archives: ArchiveAccess = {
      ...archivesExtracting(() => {
        for (const each of staged) {
          fs.mkdirSync(path.dirname(stagedAt(each)), { recursive: true });
          fs.writeFileSync(stagedAt(each), each);
        }
        return Promise.resolve({ kind: 'extracted', folder: work });
      }),
      remove: (_archive, paths, options = {}) => {
        removing.push(paths);
        return removed(options);
      },
    };
    const connection = unpackingFirst(
      {
        archives,
        archive: { ...archive, tree },
        paths: roots,
        depth: 0,
        withoutFolders,
        files: files.length,
        bytes: 100,
        moving: {
          roots: roots.flatMap((root) => {
            const parts = root.split('/');
            const branch = tree.branch(parts.slice(0, -1), parts.at(-1) ?? '');
            return branch === undefined ? [] : [branch];
          }),
          platform,
        },
      },
      (listening) => {
        const made = {
          commands: [] as TransferCommand[],
          listener: listening,
          disposed: false,
        };
        inner.push(made);
        return {
          send: (command: TransferCommand) => made.commands.push(command),
          dispose: () => {
            made.disposed = true;
          },
        };
      },
    )({ event: (event) => events.push(event), stopped: () => undefined });
    connection.send({ type: 'start', plan: { ...plan, move: true } });
    const ended = () =>
      waitFor(
        () => events.some((event) => event.type === 'done'),
        'the move to end',
      );
    const moved = async (
      gone: readonly string[],
      done: TransferEvent = { type: 'done', stopped: false },
    ) => {
      await waitFor(() => inner.length === 1, 'the transfer to start');
      for (const each of gone) {
        fs.rmSync(stagedAt(each), { recursive: true, force: true });
      }
      inner[0]?.listener.event(done);
    };
    return { connection, events, removing, inner, work, moved, ended };
  };

  test('deletes from the archive the items moved, once the transfer moved them out of the folder they were taken into, telling how far the deleting got, and removes that folder', async () => {
    const { events, removing, inner, work, moved, ended } = movingOut({
      files: ['docs/a.txt', 'docs/sub/b.txt', 'top.txt'],
      roots: ['docs', 'top.txt'],
      removed: ({ onProgress }) => {
        onProgress?.({ percent: 50, files: 1 });
        return Promise.resolve({ kind: 'packed' });
      },
    });
    await moved(['docs', 'top.txt']);
    await ended();

    assert.deepStrictEqual(removing, [['docs', 'top.txt']]);
    assert.deepStrictEqual(events, [
      {
        type: 'progress',
        progress: {
          files: 3,
          totalFiles: 3,
          bytes: 50,
          totalBytes: 100,
          current: 'a.zip',
          deleting: true,
        },
      },
      { type: 'done', stopped: false },
    ]);
    assert.strictEqual(inner[0]?.disposed, true);
    await waitFor(() => !fs.existsSync(work), 'what was taken out to go');
  });

  test('deletes only what left the folder it was taken into, keeping in the archive a file skipped or that failed to move and the folders holding it, and deletes nothing when nothing moved', async () => {
    const partly = movingOut({
      files: ['docs/a.txt', 'docs/sub/b.txt', 'docs/sub/c.txt', 'top.txt'],
      roots: ['docs', 'top.txt'],
    });
    await partly.moved(['docs/sub', 'top.txt']);
    await partly.ended();
    assert.deepStrictEqual(partly.removing, [['docs/sub', 'top.txt']]);

    const none = movingOut({ files: ['docs/a.txt'], roots: ['docs'] });
    await none.moved([]);
    await none.ended();
    assert.deepStrictEqual(none.removing, []);
    assert.deepStrictEqual(none.events, [{ type: 'done', stopped: false }]);
  });

  test('keeps in the archive the files 7-Zip took out under another name or not at all, and the folders holding them, saying so, names of one file but for their case alike on Windows', async () => {
    const { events, removing, moved, ended } = movingOut({
      files: [
        'docs/a.txt',
        'docs/A.txt',
        'docs/sub/b.txt',
        'docs/c:d.txt',
        'docs/lost.txt',
      ],
      staged: ['docs/a.txt', 'docs/sub/b.txt', 'docs/c_d.txt'],
      roots: ['docs'],
      platform: 'win32',
    });
    await moved(['docs']);
    await ended();

    assert.deepStrictEqual(removing, [['docs/sub']]);
    assert.deepStrictEqual(events, [
      {
        type: 'warned',
        reason: strings.commander.keptUnmatched('a.zip', 4),
      },
      { type: 'done', stopped: false },
    ]);
  });

  test('deletes the files moved in flat view by their names alone, keeping files of one name from two folders, as one took the place of the other once taken out', async () => {
    const { events, removing, moved, ended } = movingOut({
      files: ['docs/a.txt', 'other/a.txt', 'top.txt'],
      staged: ['a.txt', 'top.txt'],
      roots: ['docs/a.txt', 'other/a.txt', 'top.txt'],
      withoutFolders: true,
    });
    await moved(['a.txt', 'top.txt']);
    await ended();

    assert.deepStrictEqual(removing, [['top.txt']]);
    assert.deepStrictEqual(events, [
      {
        type: 'warned',
        reason: strings.commander.keptUnmatched('a.zip', 2),
      },
      { type: 'done', stopped: false },
    ]);
  });

  test('deletes nothing from the archive once the transfer was stopped or broke, keeping what it moved in the archive too', async () => {
    const stopped = movingOut({ files: ['top.txt'], roots: ['top.txt'] });
    await stopped.moved(['top.txt'], { type: 'done', stopped: true });
    await stopped.ended();
    const broke = movingOut({ files: ['top.txt'], roots: ['top.txt'] });
    await broke.moved(['top.txt'], {
      type: 'done',
      stopped: false,
      error: 'Something broke',
    });
    await broke.ended();

    assert.deepStrictEqual([stopped.removing, broke.removing], [[], []]);
    assert.deepStrictEqual(stopped.events, [{ type: 'done', stopped: true }]);
    assert.deepStrictEqual(broke.events, [
      { type: 'done', stopped: false, error: 'Something broke' },
    ]);
  });

  test('says what was moved is kept in the archive too when it could not be deleted from it, what 7-Zip warned of while deleting, and stops deleting once stopped or disposed, telling the transfer nothing more', async () => {
    const refused = movingOut({
      files: ['top.txt'],
      roots: ['top.txt'],
      removed: () =>
        Promise.resolve({ kind: 'refused', reason: 'It is read-only.' }),
    });
    await refused.moved(['top.txt']);
    await refused.ended();
    assert.deepStrictEqual(refused.events, [
      {
        type: 'warned',
        reason: strings.commander.movedOutKept('a.zip', 'It is read-only.'),
      },
      { type: 'done', stopped: false },
    ]);

    const warned = movingOut({
      files: ['top.txt'],
      roots: ['top.txt'],
      removed: () =>
        Promise.resolve({ kind: 'packed', warning: 'Something odd.' }),
    });
    await warned.moved(['top.txt']);
    await warned.ended();
    assert.deepStrictEqual(warned.events, [
      {
        type: 'warned',
        reason: strings.commander.movedOutWarned('a.zip', 'Something odd.'),
      },
      { type: 'done', stopped: false },
    ]);

    const stopping = movingOut({
      files: ['top.txt'],
      roots: ['top.txt'],
      removed: ({ signal }) => aborted(signal),
    });
    await stopping.moved(['top.txt']);
    await waitFor(() => stopping.removing.length === 1, 'the deleting');
    stopping.connection.send({ type: 'stop' });
    await stopping.ended();
    assert.deepStrictEqual(stopping.events, [{ type: 'done', stopped: true }]);
    assert.deepStrictEqual(stopping.inner[0]?.commands.slice(1), []);

    let deleting: AbortSignal | undefined;
    const disposing = movingOut({
      files: ['top.txt'],
      roots: ['top.txt'],
      removed: ({ signal }) => {
        deleting = signal;
        return aborted(signal);
      },
    });
    await disposing.moved(['top.txt']);
    await waitFor(() => disposing.removing.length === 1, 'the deleting');
    disposing.connection.dispose();
    assert.strictEqual(deleting?.aborted, true);
    await waitFor(
      () => !fs.existsSync(disposing.work),
      'what was taken out to go',
    );
  });
});
