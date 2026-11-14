import * as assert from 'node:assert';
import * as os from 'node:os';
import { suite, test } from 'vitest';

suite.skipIf(process.platform !== 'win32')('Known folders of Windows', () => {
  test('finds the folder on disk a shell: name stands for, whatever its case, and none for a folder with no place on disk or a name Windows does not know', async () => {
    const { windowsKnownFolder } =
      await import('../../../../../tools/commander/main/windowsKnownFolders.js');

    assert.deepStrictEqual(
      [
        'shell:Windows',
        'SHELL:PROFILE',
        'shell:AppsFolder',
        'shell:nowhere at all',
      ].map((name) => windowsKnownFolder(name)?.toLowerCase()),
      [
        process.env.SystemRoot?.toLowerCase(),
        os.homedir().toLowerCase(),
        undefined,
        undefined,
      ],
    );
  });
});
