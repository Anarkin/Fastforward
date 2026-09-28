import * as assert from 'node:assert';
import { commitPageSize, type CommitInfo } from '../protocol';
import { CommitHistory } from '../webview/commitHistory';

function commit(hash: string): CommitInfo {
  return {
    hash,
    subject: hash,
    message: hash,
    parents: [],
    authorName: '',
    authorEmail: '',
    authorDate: 0,
    committerName: '',
    committerEmail: '',
    commitDate: 0,
    files: 0,
  };
}

suite('CommitHistory', () => {
  test('places pages at their positions', () => {
    const history = new CommitHistory(1000);
    history.add(300, [commit('a'), commit('b')]);
    assert.strictEqual(history.at(301)?.hash, 'b');
    assert.strictEqual(history.positionOf('a'), 300);
    assert.strictEqual(history.find('b')?.hash, 'b');
    assert.strictEqual(history.at(0), undefined);
  });

  test('asks for each missing page once', () => {
    const history = new CommitHistory(250);
    history.add(0, [commit('a')]);
    assert.deepStrictEqual(history.takeMissingPages(50, 400), [
      commitPageSize,
      2 * commitPageSize,
    ]);
    assert.deepStrictEqual(history.takeMissingPages(0, 249), []);
  });

  test('counts both pages a new history comes with as loaded', () => {
    const history = new CommitHistory(1000);
    history.add(
      0,
      Array.from({ length: 2 * commitPageSize }, (_, index) =>
        commit(String(index)),
      ),
    );
    assert.deepStrictEqual(
      history.takeMissingPages(0, 3 * commitPageSize - 1),
      [2 * commitPageSize],
    );
  });

  test('asks again for a page that could not be loaded', () => {
    const history = new CommitHistory(250);
    assert.deepStrictEqual(history.takeMissingPages(100, 199), [100]);
    history.release(100);
    assert.deepStrictEqual(history.takeMissingPages(100, 199), [100]);
  });
});

suite('CommitHistory ref counts', () => {
  test('knows how many refs each position has before loading it', () => {
    const history = new CommitHistory(100, [
      [0, 2],
      [42, 1],
    ]);
    assert.strictEqual(history.refCountAt(0), 2);
    assert.strictEqual(history.refCountAt(42), 1);
    assert.strictEqual(history.refCountAt(7), 0);
  });
});
