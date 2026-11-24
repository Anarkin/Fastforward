import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  binTrims,
  trashJob,
} from '../../../../../tools/commander/main/trashJob';
import type { TransferEvent } from '../../../../../tools/commander/main/transferProtocol';
import { waitFor } from '../../../../helpers/fixtures';

const plan = (sources: string[]) => ({
  sources,
  target: '/folder',
  move: true,
});

function started(trash: (item: string) => Promise<void>) {
  const events: TransferEvent[] = [];
  const connection = trashJob(trash)({
    event: (event) => events.push(event),
    stopped: () => undefined,
  });
  return { events, connection };
}

const at = (...parts: string[]) => path.win32.join('C:', 'files', ...parts);

suite('Moving to the Recycle Bin', () => {
  test('moves each item in turn, telling which it is at and how many of them are done, and which failed and why', async () => {
    const trashed: string[] = [];
    const { events, connection } = started((item) => {
      trashed.push(item);
      return item.endsWith('locked')
        ? Promise.reject(new Error('It is in use'))
        : Promise.resolve();
    });

    connection.send({
      type: 'start',
      plan: plan(['/folder/a', '/folder/locked', '/folder/b']),
    });
    await waitFor(
      () => events.some((event) => event.type === 'done'),
      'the items moved',
    );

    assert.deepStrictEqual(trashed, [
      '/folder/a',
      '/folder/locked',
      '/folder/b',
    ]);
    assert.deepStrictEqual(events, [
      {
        type: 'progress',
        progress: {
          files: 0,
          totalFiles: 3,
          bytes: 0,
          totalBytes: 0,
          current: '/folder/a',
        },
      },
      {
        type: 'progress',
        progress: {
          files: 1,
          totalFiles: 3,
          bytes: 0,
          totalBytes: 0,
          current: '/folder/locked',
        },
      },
      { type: 'failed', name: 'locked', reason: 'It is in use' },
      {
        type: 'progress',
        progress: {
          files: 2,
          totalFiles: 3,
          bytes: 0,
          totalBytes: 0,
          current: '/folder/b',
        },
      },
      {
        type: 'progress',
        progress: { files: 3, totalFiles: 3, bytes: 0, totalBytes: 0 },
      },
      { type: 'done', stopped: false },
    ]);
  });

  test('stops before the next item once asked, leaving the rest where they are', async () => {
    const trashed: string[] = [];
    const first = Promise.withResolvers<void>();
    const { events, connection } = started((item) => {
      trashed.push(item);
      return trashed.length === 1 ? first.promise : Promise.resolve();
    });

    connection.send({ type: 'start', plan: plan(['/folder/a', '/folder/b']) });
    connection.send({ type: 'stop' });
    first.resolve();
    await waitFor(
      () => events.some((event) => event.type === 'done'),
      'the job to end',
    );

    assert.deepStrictEqual(trashed, ['/folder/a']);
    assert.deepStrictEqual(events.at(-1), { type: 'done', stopped: true });
  });

  test('tells a path the Recycle Bin of Windows would take for another, as a name or a folder of it ending in a dot or a space, which Windows trims, so moving name. took name instead', () => {
    assert.deepStrictEqual(
      [
        at('name.'),
        at('name '),
        at('dir.', 'x.txt'),
        at('name.txt'),
        at('.hidden'),
        at('a b', 'x.txt'),
      ].map((file) => binTrims(file, 'win32')),
      [true, true, true, false, false, false],
    );
    assert.strictEqual(binTrims('/files/name.', 'linux'), false);
  });
});
