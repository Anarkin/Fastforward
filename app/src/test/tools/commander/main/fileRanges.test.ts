import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  byteRange,
  fileResponse,
} from '../../../../tools/commander/main/fileRanges';
import { removeFolder, tempFolder } from '../../../support/repositories';

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

  test('closes the file of a body given up on while the file was still being opened, as a page may give up on it at once', async () => {
    const folder = tempFolder('file-ranges');
    const opened: fs.promises.FileHandle[] = [];
    const open = fs.promises.open;
    Reflect.set(
      fs.promises,
      'open',
      async (...args: Parameters<typeof fs.promises.open>) => {
        const handle = await open(...args);
        opened.push(handle);
        return handle;
      },
    );
    try {
      const file = path.join(folder, 'photo.png');
      fs.writeFileSync(file, 'the image');
      const response = await fileResponse(file, 'image/png', null);
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.strictEqual(opened.length, 1);
      assert.deepStrictEqual(
        opened.map((handle) => handle.fd),
        [-1],
      );
    } finally {
      Reflect.set(fs.promises, 'open', open);
      removeFolder(folder);
    }
  });

  test('closes the file of a body once a read of it fails, failing the body, as a share gone or a range locked left the file open', async () => {
    const folder = tempFolder('file-ranges');
    const opened: fs.promises.FileHandle[] = [];
    const open = fs.promises.open;
    Reflect.set(
      fs.promises,
      'open',
      async (...args: Parameters<typeof fs.promises.open>) => {
        const handle = await open(...args);
        Reflect.set(handle, 'read', () =>
          Promise.reject(new Error('EBUSY: resource busy or locked')),
        );
        opened.push(handle);
        return handle;
      },
    );
    try {
      const file = path.join(folder, 'book.pdf');
      fs.writeFileSync(file, '0123456789');
      const response = await fileResponse(file, 'application/pdf', 'bytes=2-4');

      await assert.rejects(response.text(), /EBUSY/);
      assert.deepStrictEqual(
        opened.map((handle) => handle.fd),
        [-1],
      );
    } finally {
      Reflect.set(fs.promises, 'open', open);
      removeFolder(folder);
    }
  });
});
