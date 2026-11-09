import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  profileFolder,
  thumbnailFolder,
  viewedFilesFolder,
} from '../../main/profile';

suite('Profile', () => {
  const appData = path.join('C:', 'Users', 'me', 'AppData', 'Roaming');
  const given = path.join('C:', 'profiles', 'test');

  test('keeps a run from the source apart from the installed app, so both can be open', () => {
    assert.strictEqual(profileFolder(false, '', appData), undefined);
    assert.strictEqual(
      profileFolder(true, '', appData),
      path.join(appData, 'Fastforward Dev'),
    );
  });

  test('uses the folder it was given, however it runs', () => {
    assert.strictEqual(profileFolder(false, given, appData), given);
    assert.strictEqual(profileFolder(true, given, appData), given);
  });

  test('keeps the thumbnails in the cache folder of the system rather than the profile, which may roam, apart for a run from the source, and in the folder given when there is one', () => {
    const home = path.join('C:', 'Users', 'me');
    const local = path.join(home, 'AppData', 'Local');
    assert.strictEqual(
      thumbnailFolder('win32', false, '', home, { LOCALAPPDATA: local }),
      path.join(local, 'Fastforward', 'Thumbnails'),
    );
    assert.strictEqual(
      thumbnailFolder('win32', true, '', home, {}),
      path.join(local, 'Fastforward Dev', 'Thumbnails'),
    );
    assert.strictEqual(
      thumbnailFolder('darwin', false, '', home, {}),
      path.join(home, 'Library', 'Caches', 'Fastforward', 'Thumbnails'),
    );
    assert.strictEqual(
      thumbnailFolder('linux', false, '', home, {}),
      path.join(home, '.cache', 'fastforward', 'thumbnails'),
    );
    assert.strictEqual(
      thumbnailFolder('linux', true, '', home, {
        XDG_CACHE_HOME: path.join(home, 'cache'),
      }),
      path.join(home, 'cache', 'fastforward-dev', 'thumbnails'),
    );
    assert.strictEqual(
      thumbnailFolder('linux', false, given, home, {}),
      path.join(given, 'Thumbnails'),
    );
  });

  test('keeps the copies of the files viewed in the local folder of the system beside the thumbnails, rather than the profile, which may roam, and in the folder given when there is one, as it was', () => {
    const home = path.join('C:', 'Users', 'me');
    const local = path.join(home, 'AppData', 'Local');
    assert.strictEqual(
      viewedFilesFolder('win32', false, '', home, { LOCALAPPDATA: local }),
      path.join(local, 'Fastforward', 'Viewed Files'),
    );
    assert.strictEqual(
      viewedFilesFolder('darwin', true, '', home, {}),
      path.join(home, 'Library', 'Caches', 'Fastforward Dev', 'Viewed Files'),
    );
    assert.strictEqual(
      viewedFilesFolder('linux', false, '', home, {}),
      path.join(home, '.cache', 'fastforward', 'viewed-files'),
    );
    assert.strictEqual(
      viewedFilesFolder('linux', false, given, home, {}),
      path.join(given, 'viewed-files'),
    );
  });
});
