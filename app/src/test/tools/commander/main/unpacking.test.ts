import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  ArchiveTree,
  type ArchiveAccess,
  type Extracting,
  type ExtractProgress,
  type OpenedArchive,
} from '../../../../tools/commander/main/archives';
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
