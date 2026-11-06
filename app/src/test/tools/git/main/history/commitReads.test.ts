import * as assert from 'node:assert';
import * as path from 'node:path';
import { build } from 'esbuild';
import { suite, test } from 'vitest';
import { CommitsBuilder } from '../../../../../tools/git/main/history/commits';
import {
  commitReads,
  type CommitReads,
  type ReadOptions,
} from '../../../../../tools/git/main/history/commitReads';
import { removeFolder, tempFolder } from '../../../../repositories';
import { entriesOf } from './historyFixtures';

const output = Array.from(
  { length: 20_000 },
  (_, at) => `c${at} c${at + 1}${at % 7 === 0 ? ` c${at + 3}` : ''}\n`,
).join('');

const chunkSize = 509;

const chunks = Array.from(
  { length: Math.ceil(output.length / chunkSize) },
  (_, at) => Buffer.from(output.slice(at * chunkSize, (at + 1) * chunkSize)),
);

async function readThrough(
  reads: CommitReads,
  read: readonly Buffer[],
  options?: ReadOptions,
) {
  const reading = reads.start(options);
  for (const chunk of read) {
    reading.add(chunk);
  }
  const { commits, read: lines } = await reading.finish();
  return { entries: entriesOf(commits), times: commits.times, lines };
}

function readHere(read: readonly Buffer[], options: ReadOptions = {}) {
  const builder = new CommitsBuilder(
    options.stashes,
    options.timestamped,
    options.tips,
  );
  for (const chunk of read) {
    builder.add(chunk);
  }
  const commits = builder.finishNow();
  return {
    entries: entriesOf(commits),
    times: commits.times,
    lines: builder.read,
  };
}

suite('Reading commits', () => {
  test('reads the commits in a worker thread once its reader is built next to it, the same as in this thread, whatever the chunks git sends, as reading 1.5 million commits held the main process up for seconds', async () => {
    const folder = tempFolder('commit-reader');
    try {
      await build({
        entryPoints: {
          commitReader: path.join(
            __dirname,
            '../../../../../tools/git/main/history/commitReaderWorker.ts',
          ),
        },
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outdir: folder,
        logLevel: 'silent',
      });
      const threaded = commitReads(folder);
      const here = commitReads(tempFolder('no-reader'));

      const [fromWorker, fromHere] = await Promise.all([
        readThrough(threaded, chunks),
        readThrough(here, chunks),
      ]);

      assert.deepStrictEqual([threaded.threaded, here.threaded], [true, false]);
      assert.deepStrictEqual(fromWorker, readHere(chunks));
      assert.deepStrictEqual(fromHere, readHere(chunks));
    } finally {
      removeFolder(folder);
    }
  });

  test('reads the stashes, the tips and the timestamps it is asked to, telling how many lines it read', async () => {
    const options = {
      stashes: ['s'],
      timestamped: true,
      tips: ['i'],
    };
    const read = [Buffer.from('300 s b i u\n200 i b\n150 u\n100 b\n')];

    const fromHere = await readThrough(
      commitReads(tempFolder('no-reader')),
      read,
      options,
    );

    assert.deepStrictEqual(fromHere, readHere(read, options));
    assert.deepStrictEqual(
      fromHere.entries.map(({ hash }) => hash),
      ['s', 'i', 'b'],
    );
  });

  test('keeps readings apart that run at once, and forgets one dropped, as a history read again is dropped once a newer one is asked for', async () => {
    const reads = commitReads(tempFolder('no-reader'));
    const first = reads.start();
    const dropped = reads.start();
    const second = reads.start();

    first.add(Buffer.from('a b\n'));
    dropped.add(Buffer.from('x\n'));
    second.add(Buffer.from('c d\n'));
    dropped.drop();
    first.add(Buffer.from('b\n'));
    second.add(Buffer.from('d\n'));
    const [one, two] = await Promise.all([first.finish(), second.finish()]);

    assert.deepStrictEqual(
      [entriesOf(one.commits), entriesOf(two.commits)],
      [
        [
          { hash: 'a', parents: ['b'] },
          { hash: 'b', parents: [] },
        ],
        [
          { hash: 'c', parents: ['d'] },
          { hash: 'd', parents: [] },
        ],
      ],
    );
  });
});
