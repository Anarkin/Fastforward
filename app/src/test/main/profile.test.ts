import * as assert from 'node:assert';
import * as path from 'node:path';
import { profileFolder } from '../../main/profile';

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
});
