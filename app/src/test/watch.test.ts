import * as assert from 'node:assert';
import { isInternal, nextFlush } from '../git/watch';

suite('Watching the git folder', () => {
  test('refreshes for HEAD, the index and refs', () => {
    for (const file of [
      'HEAD',
      'index',
      'packed-refs',
      'FETCH_HEAD',
      'refs/heads/main',
      'refs\\remotes\\origin\\main',
    ]) {
      assert.strictEqual(isInternal(file), false, file);
    }
  });

  test('leaves objects, logs and locks alone', () => {
    for (const file of [
      '',
      'objects/ab/cdef',
      'objects\\pack\\pack-1.pack',
      'logs/HEAD',
      'index.lock',
      'refs/heads/main.lock',
    ]) {
      assert.strictEqual(isInternal(file), true, file);
    }
  });
});

suite('Debouncing changes', () => {
  test('waits the delay after the last change', () => {
    assert.deepStrictEqual(
      nextFlush({ firstWorkTree: 0, lastWorkTree: 0 }, 300, 1500),
      { at: 300, gitDir: false },
    );
    assert.deepStrictEqual(
      nextFlush({ firstWorkTree: 0, lastWorkTree: 1000 }, 300, 1500),
      { at: 1300, gitDir: false },
    );
  });

  test('flushes work tree changes at most the longest wait after the first one, however often files keep changing', () => {
    assert.deepStrictEqual(
      nextFlush({ firstWorkTree: 0, lastWorkTree: 1400 }, 300, 1500),
      { at: 1500, gitDir: false },
    );
    assert.deepStrictEqual(
      nextFlush({ firstWorkTree: 0, lastWorkTree: 2000 }, 300, 1500),
      { at: 1500, gitDir: false },
    );
  });

  test('waits for the git folder to stop changing, as a long rebase keeps writing it', () => {
    assert.deepStrictEqual(nextFlush({ lastGitDir: 10_000 }, 300, 1500), {
      at: 10_300,
      gitDir: true,
    });
  });

  test('flushes the work tree alone while the git folder keeps changing', () => {
    assert.deepStrictEqual(
      nextFlush(
        { firstWorkTree: 0, lastWorkTree: 1400, lastGitDir: 1400 },
        300,
        1500,
      ),
      { at: 1500, gitDir: false },
    );
  });

  test('flushes a quiet git folder with the work tree, however often files keep changing', () => {
    assert.deepStrictEqual(
      nextFlush(
        { firstWorkTree: 0, lastWorkTree: 1000, lastGitDir: 100 },
        300,
        1500,
      ),
      { at: 400, gitDir: true },
    );
  });

  test('has nothing to flush without changes', () => {
    assert.strictEqual(nextFlush({}, 300, 1500), undefined);
  });
});
