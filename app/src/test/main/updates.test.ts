import * as assert from 'node:assert';
import { checksForUpdates } from '../../main/updates';

suite('Updates', () => {
  const installed = 'C:\\Users\\a\\AppData\\Local\\Programs\\fastforward';
  const exists = (file: string) =>
    file === `${installed}\\Uninstall Fastforward.exe`;

  test('checks for updates only in an installed app on Windows or Linux, as Squirrel.Mac installs only updates signed with a Developer ID, and the macOS app is only ad-hoc signed', () => {
    const executable = `${installed}\\Fastforward.exe`;
    assert.ok(checksForUpdates(false, 'win32', executable, exists));
    assert.ok(
      checksForUpdates(false, 'linux', '/opt/Fastforward/fastforward', exists),
    );
    assert.ok(!checksForUpdates(true, 'win32', executable, exists));
    assert.ok(!checksForUpdates(false, 'darwin', '/Applications/x', exists));
  });

  test('leaves a Windows app it did not install alone, as from the zip or the portable exe, where an update would install a second copy', () => {
    assert.ok(
      !checksForUpdates(
        false,
        'win32',
        'C:\\Tools\\Fastforward\\Fastforward.exe',
        exists,
      ),
    );
    assert.ok(
      !checksForUpdates(
        false,
        'win32',
        'C:\\Users\\a\\AppData\\Local\\Temp\\2abc\\Fastforward.exe',
        exists,
      ),
    );
  });
});
