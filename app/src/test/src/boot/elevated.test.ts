import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { runsElevated } from '../../../boot/elevated';

const elevatedToken = () => Promise.resolve(true);
const plainToken = () => Promise.resolve(false);
const noToken = () => Promise.reject(new Error('advapi32 is missing'));

suite('Elevation of the app', () => {
  test('runs as root on macOS and Linux when its user is root, and as administrator on Windows when its token is elevated, otherwise neither, as told by nothing it cannot read', async () => {
    assert.deepStrictEqual(
      await Promise.all([
        runsElevated('linux', 0, noToken),
        runsElevated('darwin', 0, noToken),
        runsElevated('linux', 1000, noToken),
        runsElevated('win32', undefined, elevatedToken),
        runsElevated('win32', undefined, plainToken),
        runsElevated('win32', undefined, noToken),
      ]),
      ['root', 'root', undefined, 'administrator', undefined, undefined],
    );
  });

  test.skipIf(process.platform !== 'win32')(
    'reads the token of the process on Windows, elevated where Windows gives the process a high integrity, as on the machines of CI, and not elevated otherwise',
    async () => {
      const whoami = path.join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32',
        'whoami.exe',
      );
      const highIntegrity = execFileSync(whoami, ['/groups'], {
        encoding: 'utf8',
      }).includes('S-1-16-12288');
      assert.strictEqual(
        await runsElevated('win32'),
        highIntegrity ? 'administrator' : undefined,
      );
    },
  );
});
