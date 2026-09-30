import * as assert from 'node:assert';
import { isInternal } from '../git/watch';

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
