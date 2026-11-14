import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../../../../support/repositories';

suite.skipIf(process.platform !== 'win32')('Files Google Drive streams', () => {
  test('says a file on this disk does not stream from Google Drive, whether Drive is installed or not, asking twice as the app does for each file', async () => {
    const { streamsFromGoogleDrive } =
      await import('../../../../../tools/commander/main/windowsCloudFiles.js');
    const folder = tempFolder('cloud-files');
    try {
      const file = path.join(folder, 'photo.jpg');
      fs.writeFileSync(file, 'on disk');
      assert.strictEqual(streamsFromGoogleDrive(file), false);
      assert.strictEqual(streamsFromGoogleDrive(file), false);
    } finally {
      removeFolder(folder);
    }
  });
});
