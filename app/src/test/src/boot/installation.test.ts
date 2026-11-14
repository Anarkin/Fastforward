import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { updateMode } from '../../../boot/installation';

const writable = (folder: string) => folder !== '/opt/apps';

suite('Installation', () => {
  const installed = 'C:\\Users\\a\\AppData\\Local\\Programs\\fastforward';
  const exists = (file: string) =>
    file === `${installed}\\Uninstall Fastforward.exe` ||
    file === '/opt/Fastforward/resources/package-type';

  test('installs updates only in an installed app on Windows or Linux, and on macOS only says one is out, as Squirrel.Mac installs only updates signed with a Developer ID, and the macOS app is only ad-hoc signed', () => {
    const executable = `${installed}\\Fastforward.exe`;
    assert.strictEqual(
      updateMode(false, 'win32', executable, exists),
      'install',
    );
    assert.strictEqual(
      updateMode(false, 'linux', '/opt/Fastforward/fastforward', exists, {}),
      'install',
    );
    assert.strictEqual(
      updateMode(
        false,
        'linux',
        '/tmp/.mount_FastfoXy12/fastforward',
        exists,
        {
          APPIMAGE: '/home/a/Applications/Fastforward.AppImage',
          APPDIR: '/tmp/.mount_FastfoXy12',
        },
        () => true,
      ),
      'install',
    );
    assert.strictEqual(updateMode(true, 'win32', executable, exists), 'off');
    assert.strictEqual(
      updateMode(false, 'darwin', '/Applications/x', exists),
      'notify',
    );
  });

  test('only says an update is out for an AppImage in a folder it cannot write to, as the updater deletes the AppImage before moving the update into its folder, so the move failing left no app', () => {
    const appImage = {
      APPIMAGE: '/opt/apps/Fastforward.AppImage',
      APPDIR: '/tmp/.mount_FastfoXy12',
    };
    assert.strictEqual(
      updateMode(
        false,
        'linux',
        '/tmp/.mount_FastfoXy12/fastforward',
        exists,
        appImage,
        writable,
      ),
      'notify',
    );
    assert.strictEqual(
      updateMode(
        false,
        'linux',
        '/opt/Fastforward/fastforward',
        exists,
        {},
        writable,
      ),
      'install',
    );
  });

  test('leaves a Windows app it did not install alone, as one run from win-unpacked, where an update would install a second copy', () => {
    assert.strictEqual(
      updateMode(
        false,
        'win32',
        'C:\\Tools\\Fastforward\\Fastforward.exe',
        exists,
      ),
      'off',
    );
    assert.strictEqual(
      updateMode(
        false,
        'win32',
        'C:\\Users\\a\\AppData\\Local\\Temp\\2abc\\Fastforward.exe',
        exists,
      ),
      'off',
    );
  });

  test('leaves a Linux app run neither as an AppImage nor from the deb alone, as an extracted AppImage, which the updater checks nothing for, so a check said it was up to date', () => {
    assert.strictEqual(
      updateMode(
        false,
        'linux',
        '/home/a/squashfs-root/fastforward',
        exists,
        {},
      ),
      'off',
    );
  });

  test("leaves a Linux app alone that was started from inside another AppImage, as it inherits that one's APPIMAGE, which the updater would delete to put the update in its place", () => {
    const inherited = {
      APPIMAGE: '/home/a/Applications/SomeIDE.AppImage',
      APPDIR: '/tmp/.mount_SomeIDqW3e',
    };
    assert.strictEqual(
      updateMode(
        false,
        'linux',
        '/home/a/squashfs-root/fastforward',
        exists,
        inherited,
      ),
      'off',
    );
    assert.strictEqual(
      updateMode(false, 'linux', '/home/a/squashfs-root/fastforward', exists, {
        APPIMAGE: inherited.APPIMAGE,
      }),
      'off',
    );
    assert.strictEqual(
      updateMode(
        false,
        'linux',
        '/tmp/.mount_SomeIDqW3e2/fastforward',
        exists,
        inherited,
      ),
      'off',
    );
  });
});
