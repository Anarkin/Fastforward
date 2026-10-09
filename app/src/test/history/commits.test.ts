import * as assert from 'node:assert';
import { Commits, CommitsBuilder } from '../../history/commits';
import { entriesOf } from './historyFixtures';

function read(chunks: readonly string[], stashes?: readonly string[]) {
  const builder = new CommitsBuilder(stashes);
  for (const chunk of chunks) {
    builder.add(Buffer.from(chunk));
  }
  return builder.finishNow();
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

  test('links a long history a slice at a time, letting other work run between them, the same as at once', async () => {
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
});
