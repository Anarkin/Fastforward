import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { shownEncoding } from '../../../../tools/commander/page/encodings';

suite('The encoding of a file viewed', () => {
  test('reads a file by the encoding its byte order mark names, else a binary file byte by byte, else as UTF-8', () => {
    assert.strictEqual(
      shownEncoding('auto', { binary: true, detected: 'utf-16le' }),
      'utf-16le',
    );
    assert.strictEqual(shownEncoding('auto', { binary: true }), 'bytes');
    assert.strictEqual(shownEncoding('auto', { binary: false }), 'utf-8');
    assert.strictEqual(shownEncoding('auto'), 'utf-8');
  });

  test('reads a file in the encoding chosen, whatever it seems to be', () => {
    assert.strictEqual(
      shownEncoding('windows-1250', { binary: true, detected: 'utf-8' }),
      'windows-1250',
    );
    assert.strictEqual(shownEncoding('bytes', { binary: false }), 'bytes');
  });
});
