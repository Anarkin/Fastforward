import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';

suite.skipIf(process.platform !== 'win32')('Windows saved PATH', () => {
  test('reads the PATH Windows saved for the machine and the user, its variables put in, as new processes get it', async () => {
    const { windowsSavedPath } =
      await import('../../../boot/windowsSavedPath.js');
    const system32 = path.join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
    );

    const folders = windowsSavedPath()();

    assert.ok(
      folders.some(
        (folder) =>
          folder.replace(/\\+$/, '').toLowerCase() === system32.toLowerCase(),
      ),
      folders.join(';'),
    );
  });
});
