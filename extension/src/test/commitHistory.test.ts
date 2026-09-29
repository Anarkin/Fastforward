import * as assert from 'node:assert';
import { commitPageSize } from '../shared/protocol';
import { CommitHistory } from '../webview/commitHistory';
import { commitInfo } from './fixtures';

suite('CommitHistory', () => {
  test('places pages at their positions', () => {
    const history = new CommitHistory(1000);
    history.add(300, [commitInfo('a'), commitInfo('b')]);
    assert.strictEqual(history.at(301)?.hash, 'b');
    assert.strictEqual(history.positionOf('a'), 300);
    assert.strictEqual(history.find('b')?.hash, 'b');
    assert.strictEqual(history.at(0), undefined);
  });

  test('tells its listeners about a page only after adding it, not during the reducer that adds it', async () => {
    const history = new CommitHistory(1000);
    let told = 0;
    history.subscribe(() => told++);
    history.add(0, [commitInfo('a')]);
    assert.strictEqual(told, 0);
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
