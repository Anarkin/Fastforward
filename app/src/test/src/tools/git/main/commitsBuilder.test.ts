import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { CommitsBuilder } from '../../../../../tools/git/main/commitsBuilder';
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
});
