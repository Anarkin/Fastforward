import * as assert from 'node:assert';
import { commitPageSize, pageStart } from '../../shared/protocol';
import { CommitHistory } from '../../webview/commitHistory';
import { commitInfo } from '../fixtures';

suite('Commit history', () => {
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

  test('asks for each missing page once, up to the last row', () => {
    const history = new CommitHistory(250);
    history.add(0, [commitInfo('a')]);
    assert.deepStrictEqual(history.takeMissingRuns(50, 400), [
      { start: commitPageSize, count: 2 * commitPageSize },
    ]);
    assert.deepStrictEqual(history.takeMissingRuns(0, 249), []);
  });

  test('asks for a page beyond the rows shown on either side, so the next one is there before it is reached', () => {
    const history = new CommitHistory(1000);
    assert.deepStrictEqual(history.takeMissingRuns(250, 260), [
      { start: commitPageSize, count: 3 * commitPageSize },
    ]);
  });

  test('asks for the pages next to each other together, at most 4 at once, around the pages loaded', () => {
    const history = new CommitHistory(2000);
    history.add(2 * commitPageSize, [commitInfo('a')]);
    assert.deepStrictEqual(history.takeMissingRuns(0, 799), [
      { start: 0, count: 2 * commitPageSize },
      { start: 3 * commitPageSize, count: 4 * commitPageSize },
      { start: 7 * commitPageSize, count: 2 * commitPageSize },
    ]);
  });

  test('counts both pages a new history comes with as loaded', () => {
    const history = new CommitHistory(1000);
    history.add(
      0,
      Array.from({ length: 2 * commitPageSize }, (_, index) =>
        commitInfo(String(index)),
      ),
    );
    assert.deepStrictEqual(history.takeMissingRuns(0, 2 * commitPageSize - 1), [
      { start: 2 * commitPageSize, count: commitPageSize },
    ]);
  });

  test('asks for nothing in a history without commits', () => {
    assert.deepStrictEqual(new CommitHistory(0).takeMissingRuns(0, 99), []);
  });

  test('asks again for the pages that could not be loaded', () => {
    const history = new CommitHistory(5 * commitPageSize);
    const pages = () =>
      history.takeMissingRuns(2 * commitPageSize, 2 * commitPageSize);
    const run = { start: commitPageSize, count: 3 * commitPageSize };
    assert.deepStrictEqual(pages(), [run]);
    history.release(run.start, run.count);
    assert.deepStrictEqual(pages(), [run]);
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

suite('Commit history bubbles', () => {
  test('knows which positions have bubbles before loading them', () => {
    const history = new CommitHistory(100, [0, 42]);
    assert.strictEqual(history.hasBubbles(0), true);
    assert.strictEqual(history.hasBubbles(42), true);
    assert.strictEqual(history.hasBubbles(7), false);
  });
});
