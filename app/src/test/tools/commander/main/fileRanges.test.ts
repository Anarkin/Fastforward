import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  byteRange,
  fileResponse,
} from '../../../../tools/commander/main/fileRanges';
import { removeFolder, tempFolder } from '../../../repositories';

suite('Ranges of a file served', () => {
  test('reads the one range of bytes asked for, open at either end, and keeps it within the file', () => {
    assert.deepStrictEqual(byteRange('bytes=0-99', 1000), {
      start: 0,
      end: 99,
    });
    assert.deepStrictEqual(byteRange('bytes=900-', 1000), {
      start: 900,
      end: 999,
    });
    assert.deepStrictEqual(byteRange('bytes=-100', 1000), {
      start: 900,
      end: 999,
    });
    assert.deepStrictEqual(byteRange('bytes=990-2000', 1000), {
      start: 990,
      end: 999,
    });
  });

  test('serves the whole file for no range or one it does not read, and nothing for one past the end', () => {
    assert.strictEqual(byteRange(null, 1000), undefined);
    assert.strictEqual(byteRange('bytes=0-9,20-29', 1000), undefined);
    assert.strictEqual(byteRange('items=0-9', 1000), undefined);
    assert.strictEqual(byteRange('bytes=9-0', 1000), 'unsatisfiable');
    assert.strictEqual(byteRange('bytes=1000-', 1000), 'unsatisfiable');
    assert.strictEqual(byteRange('bytes=-0', 1000), 'unsatisfiable');
  });

  test('answers a range with its bytes and where they are in the file, and the whole file saying ranges can be asked for', async () => {
    const folder = tempFolder('file-ranges');
    try {
      const file = path.join(folder, 'book.pdf');
      fs.writeFileSync(file, '0123456789');

      const part = await fileResponse(file, 'application/pdf', 'bytes=2-4');
      assert.strictEqual(part.status, 206);
      assert.strictEqual(part.headers.get('content-range'), 'bytes 2-4/10');
      assert.strictEqual(part.headers.get('content-length'), '3');
      assert.strictEqual(await part.text(), '234');

      const whole = await fileResponse(file, 'application/pdf', null);
      assert.strictEqual(whole.status, 200);
      assert.strictEqual(whole.headers.get('accept-ranges'), 'bytes');
      assert.strictEqual(whole.headers.get('content-length'), '10');
      assert.strictEqual(whole.headers.get('content-type'), 'application/pdf');
      assert.strictEqual(await whole.text(), '0123456789');

      const past = await fileResponse(file, 'application/pdf', 'bytes=20-');
      assert.strictEqual(past.status, 416);
      assert.strictEqual(past.headers.get('content-range'), 'bytes */10');
    } finally {
      removeFolder(folder);
    }
  });
});
