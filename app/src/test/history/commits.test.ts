import * as assert from 'node:assert';
import { createHash } from 'node:crypto';
import * as v8 from 'node:v8';
import * as vm from 'node:vm';
import { suite, test } from 'vitest';
import { Commits, CommitsBuilder } from '../../history/commits';
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
  test('reads each commit and its parents as git sends them, in chunks split anywhere', () => {
    const output = 'aaa bbb ccc\nbbb\nccc bbb\n';
    for (let split = 0; split <= output.length; split++) {
      assert.deepStrictEqual(
        entriesOf(read([output.slice(0, split), output.slice(split)])),
        [
          { hash: 'aaa', parents: ['bbb', 'ccc'] },
          { hash: 'bbb', parents: [] },
          { hash: 'ccc', parents: ['bbb'] },
        ],
      );
    }
    assert.deepStrictEqual(entriesOf(read(['aaa\nbbb'])), [
      { hash: 'aaa', parents: [] },
      { hash: 'bbb', parents: [] },
    ]);
  });

  test('keeps each stash on its base alone, leaving out the commits git keeps its index and untracked files in', () => {
    const output = 's b i u\ni b\nu\nb a\na\n';
    const builder = new CommitsBuilder(['s']);
    builder.add(Buffer.from(output));
    assert.deepStrictEqual(entriesOf(builder.finishNow()), [
      { hash: 's', parents: ['b'] },
      { hash: 'b', parents: ['a'] },
      { hash: 'a', parents: [] },
    ]);
    assert.strictEqual(builder.read, 5);
    assert.strictEqual(read([output]).length, 5);
  });

  test('keeps a commit a stash keeps its index or untracked files in when a ref points at it, as git lists it among the history then', () => {
    const builder = new CommitsBuilder(['s'], false, ['u']);
    builder.add(Buffer.from('s b i u\ni b\nu\nb a\na\n'));
    assert.deepStrictEqual(entriesOf(builder.finishNow()), [
      { hash: 's', parents: ['b'] },
      { hash: 'u', parents: [] },
      { hash: 'b', parents: ['a'] },
      { hash: 'a', parents: [] },
    ]);
  });

  test('looks for the stashes and the commits they leave out without decoding a hash of each commit, as that made reading 1.5 million commits with a stash take a fifth longer', () => {
    const builder = new CommitsBuilder(['s']);
    const decode = Buffer.prototype.toString;
    let decoded = 0;
    Buffer.prototype.toString = function (
      this: Buffer,
      ...args: Parameters<typeof decode>
    ) {
      decoded++;
      return decode.apply(this, args);
    };
    try {
      builder.add(Buffer.from('s b i u\ni b\nu\nb a\na\n'));
    } finally {
      Buffer.prototype.toString = decode;
    }
    assert.strictEqual(decoded, 0);
    assert.deepStrictEqual(entriesOf(builder.finishNow()), [
      { hash: 's', parents: ['b'] },
      { hash: 'b', parents: ['a'] },
      { hash: 'a', parents: [] },
    ]);
  });

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

  test('reads the timestamp git writes before each commit when asked for', () => {
    const builder = new CommitsBuilder([], true);
    builder.add(Buffer.from('200 b a\n100 a\n'));
    const commits = builder.finishNow();
    assert.deepStrictEqual(entriesOf(commits), [
      { hash: 'b', parents: ['a'] },
      { hash: 'a', parents: [] },
    ]);
    assert.deepStrictEqual([...(commits.times ?? [])], [200, 100]);
  });

  test('reads a timestamp past January 2038, as a commit dated there, whose seconds pass 32 bits, made the history read whole again on every change', () => {
    const builder = new CommitsBuilder([], true);
    builder.add(Buffer.from('4102444800 b a\n2147483648 a\n'));
    assert.deepStrictEqual(
      [...(builder.finishNow().times ?? [])],
      [4102444800, 2147483648],
    );
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

  test("links a long history a slice at a time, letting other work run between them, the same as at once, as the main process also passes the window's input on to the page", async () => {
    const output = Array.from(
      { length: 20_000 },
      (_, at) => `c${at} c${at + 1}${at % 7 === 0 ? ` c${at + 3}` : ''}\n`,
    ).join('');
    const sliced = new CommitsBuilder();
    sliced.add(Buffer.from(output));
    let ran = false;
    setImmediate(() => {
      ran = true;
    });
    const commits = await sliced.finish(0);
    assert.ok(ran);
    assert.deepStrictEqual(entriesOf(commits), entriesOf(read([output])));
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
