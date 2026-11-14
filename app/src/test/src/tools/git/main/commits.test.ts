import * as assert from 'node:assert';
import { createHash } from 'node:crypto';
import * as v8 from 'node:v8';
import * as vm from 'node:vm';
import { suite, test } from 'vitest';
import { Commits } from '../../../../../tools/git/main/commits';
import { CommitsBuilder } from '../../../../../tools/git/main/commitsBuilder';
import { entriesOf } from './historyFixtures';

function read(chunks: readonly string[], stashes?: readonly string[]) {
  const builder = new CommitsBuilder(stashes);
  for (const chunk of chunks) {
    builder.add(Buffer.from(chunk));
  }
  return builder.finishNow();
}

function sha1(at: number): string {
  return createHash('sha1').update(String(at)).digest('hex');
}

function isCallable(value: unknown): value is () => void {
  return typeof value === 'function';
}

async function memoryKeptBy(make: () => unknown): Promise<number> {
  v8.setFlagsFromString('--expose-gc');
  const collectGarbage: unknown = vm.runInNewContext('gc');
  assert.ok(isCallable(collectGarbage));
  const used = async () => {
    let least = Number.POSITIVE_INFINITY;
    for (let round = 0; round < 20; round++) {
      collectGarbage();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const { heapUsed, arrayBuffers } = process.memoryUsage();
      const now = heapUsed + arrayBuffers;
      if (now >= least) {
        break;
      }
      least = now;
    }
    return least;
  };
  const before = await used();
  const kept = make();
  const after = await used();
  assert.ok(kept);
  return after - before;
}

suite('Commits read from git', () => {
  test('finds a commit by its hash, and numbers the parents outside the history after its commits', () => {
    const commits = Commits.of([
      { hash: 'm', parents: ['a', 'x'] },
      { hash: 'a', parents: ['y'] },
    ]);
    assert.strictEqual(commits.length, 2);
    assert.strictEqual(commits.size, 4);
    assert.deepStrictEqual(
      ['m', 'a', 'x', 'y', 'z'].map((hash) => commits.indexOf(hash)),
      [0, 1, 2, 3, undefined],
    );
    assert.deepStrictEqual(
      ['m', 'x', 'z'].map((hash) => commits.has(hash)),
      [true, false, false],
    );
    assert.strictEqual(commits.hashAt(2), 'x');
  });

  test('comes back the same from its parts, as sent from the thread that reads it', () => {
    const builder = new CommitsBuilder([], true);
    builder.add(Buffer.from('300 m a x\n200 a y\n'));
    const commits = builder.finishNow();

    const copy = Commits.fromParts(structuredClone(commits.parts()));

    assert.deepStrictEqual(entriesOf(copy), entriesOf(commits));
    assert.deepStrictEqual(
      [copy.length, copy.size, [...(copy.times ?? [])]],
      [2, 4, [300, 200]],
    );
    assert.deepStrictEqual(
      ['m', 'a', 'x', 'y', 'z'].map((hash) => [
        copy.indexOf(hash),
        copy.has(hash),
      ]),
      [
        [0, true],
        [1, true],
        [2, false],
        [3, false],
        [undefined, false],
      ],
    );
  });

  test('finds no commit by a string whose characters only share their low bytes with its hash, as the page may send any characters', () => {
    const hash = sha1(1);
    const commits = Commits.of([{ hash, parents: [] }]);
    const forged = hash.replaceAll(/./g, (char) =>
      String.fromCharCode(char.charCodeAt(0) + 0x100),
    );
    assert.strictEqual(commits.indexOf(hash), 0);
    assert.strictEqual(commits.indexOf(forged), undefined);
    assert.strictEqual(commits.has(forged), false);
  });

  test('replaces the top commits of a history with others, the same as reading them all at once, whether or not its lookup grows', () => {
    const older = Array.from({ length: 120 }, (_, at) => ({
      hash: `c${at}`,
      parents:
        at === 119
          ? ['outside1']
          : [`c${at + 1}`, ...(at % 7 === 0 ? ['outside2'] : [])],
    }));
    for (const [count, dropped] of [
      [3, 0],
      [200, 0],
      [5, 3],
      [50, 100],
      [1, 120],
    ]) {
      const newer = Array.from({ length: count }, (_, at) => ({
        hash: `n${at}`,
        parents:
          at === count - 1
            ? [dropped < 120 ? `c${dropped}` : 'outside3', 'outside1']
            : [`n${at + 1}`, ...(at % 5 === 0 ? ['c110'] : [])],
      }));
      const top = [
        ...older.slice(0, Math.floor(dropped / 2)),
        ...newer,
        ...older.slice(Math.floor(dropped / 2), dropped),
      ];
      const joined = Commits.replacingTop(
        Commits.of(top),
        Commits.of(older),
        dropped,
      );
      const whole = Commits.of([...top, ...older.slice(dropped)]);
      assert.deepStrictEqual(entriesOf(joined), entriesOf(whole));
      assert.strictEqual(joined.size, whole.size);
      for (let at = 0; at < whole.size; at++) {
        const hash = whole.hashAt(at);
        if (at < whole.length) {
          assert.strictEqual(joined.indexOf(hash), at, hash);
        } else {
          assert.ok((joined.indexOf(hash) ?? 0) >= joined.length, hash);
        }
        assert.strictEqual(joined.has(hash), whole.has(hash), hash);
      }
      assert.strictEqual(joined.indexOf('nowhere'), undefined);
    }
  });

  test('keeps a commit in under 100 bytes, its hash as bytes in one buffer and its parents as numbers, as an object and strings per commit took seven times the memory', async () => {
    const count = 200_000;
    const output = Array.from(
      { length: count },
      (_, at) => `${sha1(at)} ${sha1(at + 1)}\n`,
    ).join('');
    const kept = await memoryKeptBy(() => read([output]));
    assert.ok(kept < count * 100, `${kept / count} bytes per commit`);
  });
});
