import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  shareDone,
  transferQuestion,
} from '../../../../tools/commander/page/transferring';

suite('Commander transferring', () => {
  test('asks before copying or moving into the folder of the other side, naming a single item and counting more', () => {
    assert.deepStrictEqual(transferQuestion(['a.txt'], false, 'D:\\photos'), {
      title: 'Copy',
      message: 'Copy "a.txt" to "D:\\photos"?',
      confirm: 'Copy',
    });
    assert.deepStrictEqual(transferQuestion(['a', 'b', 'c'], true, '/tmp'), {
      title: 'Move',
      message: 'Move 3 items to "/tmp"?',
      confirm: 'Move',
    });
  });

  test('measures how far a copy got by its bytes, by its files when they hold none, and as done when there was nothing to copy', () => {
    const progress = { files: 1, totalFiles: 4, bytes: 30, totalBytes: 40 };
    assert.strictEqual(shareDone(undefined), 0);
    assert.strictEqual(shareDone(progress), 75);
    assert.strictEqual(shareDone({ ...progress, bytes: 0, totalBytes: 0 }), 25);
    assert.strictEqual(
      shareDone({ files: 0, totalFiles: 0, bytes: 0, totalBytes: 0 }),
      100,
    );
  });
});
