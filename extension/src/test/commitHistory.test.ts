import * as assert from 'node:assert';
import type { CommitInfo } from '../protocol';
import { CommitHistory, commitPageSize } from '../webview/commitHistory';

function commit(hash: string): CommitInfo {
  return {
    hash,
    subject: hash,
    message: hash,
    parents: [],
    authorName: '',
    authorEmail: '',
    authorDate: 0,
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
