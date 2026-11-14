import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../../../support/repositories';

suite.skipIf(process.platform !== 'win32')('Files Recycle Bin', () => {
  test('finds the volume of a folder as mountvol names the volume of its drive', async () => {
    const { windowsRegistry } =
      await import('../../../../tools/commander/main/windowsRecycleBin.js');
    const folder = tempFolder('recycle-bin');
    try {
      const drive = path.parse(folder).root;
      const mounted = execFileSync('mountvol', [drive, '/L'], {
        encoding: 'utf8',
      }).trim();
      assert.match(mounted, /^\\\\\?\\Volume\{[0-9a-f-]{36}\}\\$/);
      assert.strictEqual(await windowsRegistry().volumeOf(folder), mounted);
    } finally {
      removeFolder(folder);
    }
  });

  test('reads a number from the registry, and nothing for a value missing or of another type', async () => {
    const { windowsRegistry } =
      await import('../../../../tools/commander/main/windowsRecycleBin.js');
    const { number } = windowsRegistry();
    const version = 'Software\\Microsoft\\Windows NT\\CurrentVersion';
    assert.strictEqual(
      number('localMachine', version, 'CurrentMajorVersionNumber'),
      10,
    );
    assert.strictEqual(number('localMachine', version, 'Nowhere'), undefined);
    assert.strictEqual(
      number('localMachine', version, 'ProductName'),
      undefined,
    );
  });
});
