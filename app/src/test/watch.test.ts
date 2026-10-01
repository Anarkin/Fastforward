import * as assert from 'node:assert';
import { isInternal, waitBeforeFlush } from '../git/watch';

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
    assert.strictEqual(waitBeforeFlush(0, 300, 1500), 300);
    assert.strictEqual(waitBeforeFlush(1000, 300, 1500), 300);
  });

  test('flushes at most the longest wait after the first pending change, however often files keep changing', () => {
    assert.strictEqual(waitBeforeFlush(1400, 300, 1500), 100);
    assert.strictEqual(waitBeforeFlush(1500, 300, 1500), 0);
    assert.strictEqual(waitBeforeFlush(2000, 300, 1500), 0);
  });
});
