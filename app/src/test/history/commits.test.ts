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
