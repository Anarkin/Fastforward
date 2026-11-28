import * as assert from 'node:assert';
import * as path from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { inThread, patternWorker } from '../../../../lib/main/patternSearch';
import { removeFolder, tempFolder } from '../../../helpers/tempFolders';

let built = '';

beforeAll(async () => {
  built = tempFolder('pattern-worker');
  await build({
    entryPoints: {
      patternWorker: path.join(__dirname, '../../../../boot/patternWorker.ts'),
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outdir: built,
    logLevel: 'silent',
  });
}, 60_000);

afterAll(() => {
  removeFolder(built);
});

const regex = { caseSensitive: false, wholeWord: false, regex: true };
const backtracking = String.raw`^(\w+\s?)+$`;
const startsWithT = String.raw`t\w+`;
const words = `${'word '.repeat(30)}!`;

suite('Searching by a regular expression in a worker thread', () => {
  test('finds and filters as this thread does once the worker is built next to it', async () => {
    const search = patternWorker(built);
    try {
      const texts = ['one Two three', 'none here', 'two'];
      const expected = [
        [
          { start: 4, end: 7 },
          { start: 8, end: 13 },
        ],
        [],
        [{ start: 0, end: 3 }],
      ];
      assert.deepStrictEqual(
        await inThread.ranges(texts, startsWithT, regex),
        expected,
      );
      assert.deepStrictEqual(
        await search.ranges(texts, startsWithT, regex),
        expected,
      );
      const fields = [
        ['Ann', 'fix the bug'],
        ['Bob', 'feature'],
      ];
      assert.deepStrictEqual(await search.matching(fields, 'b.g', regex), [
        true,
        false,
      ]);
    } finally {
      search.close();
    }
  });

  test('ends a pattern that backtracks past its time rather than holding the main thread for ever, saying it was too slow, and searches again after it', async () => {
    const search = patternWorker(built, 300);
    try {
      const started = Date.now();
      assert.strictEqual(
        await search.ranges([words], backtracking, regex),
        'slow',
      );
      assert.ok(Date.now() - started < 5000);
      assert.deepStrictEqual(await search.ranges(['abc'], 'b', regex), [
        [{ start: 1, end: 2 }],
      ]);
    } finally {
      search.close();
    }
  });

  test('finds and filters by plain words in this thread, as matching them never backtracks', async () => {
    const search = patternWorker(built, 0);
    try {
      const plain = { caseSensitive: false, wholeWord: false, regex: false };
      assert.deepStrictEqual(await search.ranges([words], 'word', plain), [
        Array.from({ length: 30 }, (_, index) => ({
          start: index * 5,
          end: index * 5 + 4,
        })),
      ]);
      assert.deepStrictEqual(
        await search.matching([['Ada'], ['Bob']], 'ada', plain),
        [true, false],
      );
    } finally {
      search.close();
    }
  });

  test('ends a search at once when it is stopped, as by the next query, and answers the next', async () => {
    const search = patternWorker(built, 60_000);
    try {
      const stopping = new AbortController();
      const slow = search.ranges([words], backtracking, regex, stopping.signal);
      const queued = search.matching([['abc']], 'b', regex);
      setTimeout(() => stopping.abort(), 100);
      assert.strictEqual(await slow, 'stopped');
      assert.deepStrictEqual(await queued, [true]);
    } finally {
      search.close();
    }
  });
});
