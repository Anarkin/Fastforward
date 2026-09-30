import * as assert from 'node:assert';
import { commitPageSize, pageStart } from '../shared/protocol';
import { CommitHistory } from '../webview/commitHistory';
import { commitInfo } from './fixtures';

suite('CommitHistory', () => {
  test('places pages at their positions', () => {
    const history = new CommitHistory(1000);
    const rowA = { lane: 0, color: 0, lines: [] };
    const rowB = { lane: 1, color: 1, lines: [] };
    history.add(300, [commitInfo('a'), commitInfo('b')], [rowA, rowB]);
    assert.strictEqual(history.at(301)?.hash, 'b');
    assert.strictEqual(history.positionOf('a'), 300);
    assert.strictEqual(history.positionOf('b'), 301);
    assert.strictEqual(history.at(0), undefined);
    assert.strictEqual(history.graphAt(300), rowA);
    assert.strictEqual(history.graphAt(301), rowB);
    assert.strictEqual(history.graphAt(0), undefined);
  });

  test('tells its listeners about a page only after adding it, not during the reducer that adds it', async () => {
    const history = new CommitHistory(1000);
    let told = 0;
    const unsubscribe = history.subscribe(() => told++);
    history.add(0, [commitInfo('a')]);
    assert.strictEqual(told, 0);
    await Promise.resolve();
    assert.strictEqual(told, 1);
    unsubscribe();
    history.add(100, [commitInfo('b')]);
    await Promise.resolve();
    assert.strictEqual(told, 1);
  });

  test('asks for each missing page once', () => {
    const history = new CommitHistory(250);
    history.add(0, [commitInfo('a')]);
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
        commitInfo(String(index)),
      ),
    );
    assert.deepStrictEqual(
      history.takeMissingPages(0, 3 * commitPageSize - 1),
      [2 * commitPageSize],
    );
  });

  test('asks for nothing in a history without commits', () => {
    assert.deepStrictEqual(new CommitHistory(0).takeMissingPages(0, 99), []);
  });

  test('asks again for a page that could not be loaded', () => {
    const history = new CommitHistory(3 * commitPageSize);
    const page = () =>
      history.takeMissingPages(commitPageSize, 2 * commitPageSize - 1);
    assert.deepStrictEqual(page(), [commitPageSize]);
    history.release(commitPageSize);
    assert.deepStrictEqual(page(), [commitPageSize]);
  });
});

suite('Commit pages', () => {
  test('starts the page an index is on', () => {
    assert.strictEqual(pageStart(0), 0);
    assert.strictEqual(pageStart(commitPageSize - 1), 0);
    assert.strictEqual(pageStart(commitPageSize), commitPageSize);
    assert.strictEqual(
      pageStart(2 * commitPageSize + commitPageSize / 2),
      2 * commitPageSize,
    );
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
