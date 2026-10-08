import * as assert from 'node:assert';
import { EventEmitter } from 'node:events';
import type { ToWebview, UpdateStatus } from '../../shared/protocol';
import { strings } from '../../shared/strings';
import {
  updateCheckHours,
  updateMode,
  Updates,
  type UpdateCheck,
  type UpdateMode,
  type Updater,
} from '../../main/updates';
import { fakeTimer } from '../fakeTimer';
import { recordingLog } from '../stub';

class FakeUpdater extends EventEmitter implements Updater {
  autoDownload = true;
  readonly checks: PromiseWithResolvers<UpdateCheck | null>[] = [];
  readonly installs: [boolean, boolean][] = [];

  checkForUpdates(): Promise<UpdateCheck | null> {
    const check = Promise.withResolvers<UpdateCheck | null>();
    this.checks.push(check);
    return check.promise;
  }

  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void {
    this.installs.push([isSilent, isForceRunAfter]);
  }
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

const upToDate: UpdateCheck = {
  isUpdateAvailable: false,
  updateInfo: { version: '6.0.0' },
};

function found(downloaded: Promise<unknown> | null): UpdateCheck {
  return {
    isUpdateAvailable: true,
    updateInfo: { version: '7.0.0' },
    downloadPromise: downloaded,
  };
}

function withUpdates(mode: UpdateMode = 'install') {
  const updater = new FakeUpdater();
  const posted: ToWebview[] = [];
  const opened: string[] = [];
  const { timer, waiting, fire } = fakeTimer();
  const { log, error } = recordingLog();
  const updates = new Updates(
    mode,
    '6.0.0',
    updater,
    (message) => posted.push(message),
    log,
    (url) => opened.push(url),
    timer,
  );
  return {
    updates,
    updater,
    opened,
    waiting,
    fire,
    logged: error,
    notices: () =>
      posted.flatMap((message) =>
        message.type === 'notice'
          ? [`${message.level}: ${message.message}`]
          : [],
      ),
    statuses: () =>
      posted.flatMap((message): UpdateStatus[] =>
        message.type === 'update' ? [message.status] : [],
      ),
  };
}

suite('Updates', () => {
  const installed = 'C:\\Users\\a\\AppData\\Local\\Programs\\fastforward';
  const exists = (file: string) =>
    file === `${installed}\\Uninstall Fastforward.exe`;

  test('installs updates only in an installed app on Windows or Linux, and on macOS only says one is out, as Squirrel.Mac installs only updates signed with a Developer ID, and the macOS app is only ad-hoc signed', () => {
    const executable = `${installed}\\Fastforward.exe`;
    assert.strictEqual(
      updateMode(false, 'win32', executable, exists),
      'install',
    );
    assert.strictEqual(
      updateMode(false, 'linux', '/opt/Fastforward/fastforward', exists),
      'install',
    );
    assert.strictEqual(updateMode(true, 'win32', executable, exists), 'off');
    assert.strictEqual(
      updateMode(false, 'darwin', '/Applications/x', exists),
      'notify',
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

  test('checks on start and again some hours after each check ends, quietly while nothing is new', async () => {
    const { updates, updater, waiting, fire, notices, statuses } =
      withUpdates();
    updates.start();
    assert.strictEqual(updater.checks.length, 1);
    assert.deepStrictEqual(updates.status, { kind: 'checking' });
    assert.strictEqual(waiting().length, 0);
    updater.checks[0].resolve(upToDate);
    await settle();
    assert.deepStrictEqual(updates.status, { kind: 'upToDate' });
    assert.deepStrictEqual(
      waiting().map((entry) => entry.ms),
      [updateCheckHours * 3_600_000],
    );
    await fire();
    assert.strictEqual(updater.checks.length, 2);
    assert.deepStrictEqual(notices(), []);
    assert.deepStrictEqual(statuses(), [
      { kind: 'checking' },
      { kind: 'upToDate' },
      { kind: 'checking' },
    ]);
  });

  test('downloads an update it finds, showing how far it got, then says it is ready and stops checking', async () => {
    const { updates, updater, waiting, notices } = withUpdates();
    assert.strictEqual(updater.autoDownload, true);
    const download = Promise.withResolvers<string[]>();
    updates.start();
    updater.checks[0].resolve(found(download.promise));
    await settle();
    assert.deepStrictEqual(updates.status, {
      kind: 'downloading',
      version: '7.0.0',
      percent: 0,
    });
    updater.emit('download-progress', { percent: 41.7 });
    assert.deepStrictEqual(updates.status, {
      kind: 'downloading',
      version: '7.0.0',
      percent: 41,
    });
    download.resolve([]);
    await settle();
    assert.deepStrictEqual(updates.status, { kind: 'ready', version: '7.0.0' });
    assert.deepStrictEqual(notices(), [
      `info: ${strings.messages.updateReady('7.0.0')}`,
    ]);
    assert.strictEqual(waiting().length, 0);
    updates.check(true);
    assert.strictEqual(updater.checks.length, 1);
  });

  test('restarts into a downloaded update silently, starting the app again', async () => {
    const { updates, updater } = withUpdates();
    updates.install();
    assert.deepStrictEqual(updater.installs, []);
    updates.start();
    updater.checks[0].resolve(found(Promise.resolve([])));
    await settle();
    updates.install();
    assert.deepStrictEqual(updater.installs, [[true, true]]);
  });

  test('answers a check from the menu with a notice, also when it joins a check already running', async () => {
    const { updates, updater, notices } = withUpdates();
    updates.start();
    updates.check(true);
    assert.strictEqual(updater.checks.length, 1);
    updater.checks[0].resolve(upToDate);
    await settle();
    assert.deepStrictEqual(notices(), [
      `info: ${strings.messages.upToDate('6.0.0')}`,
    ]);
    updates.check(true);
    updater.checks[1].resolve(found(new Promise(() => {})));
    await settle();
    assert.deepStrictEqual(notices().slice(1), [
      `info: ${strings.messages.downloadingUpdate('7.0.0')}`,
    ]);
  });

  test('keeps a failed automatic check to the log, but reports one asked for from the menu with its first line', async () => {
    const { updates, updater, waiting, notices, logged } = withUpdates();
    updates.start();
    updater.checks[0].resolve(upToDate);
    await settle();
    updates.check(false);
    updater.emit('error', new Error('offline'));
    updater.checks[1].reject(new Error('offline'));
    await settle();
    assert.deepStrictEqual(updates.status, { kind: 'upToDate' });
    assert.deepStrictEqual(notices(), []);
    assert.ok(logged.some((entry) => String(entry).includes('offline')));
    assert.strictEqual(waiting().length, 1);
    updates.check(true);
    updater.checks[2].reject(
      new Error('net::ERR_INTERNET_DISCONNECTED\n    at request'),
    );
    await settle();
    assert.deepStrictEqual(updates.status, { kind: 'failed' });
    assert.deepStrictEqual(notices(), [
      `error: ${strings.messages.couldNotCheckForUpdates('net::ERR_INTERNET_DISCONNECTED')}`,
    ]);
    assert.strictEqual(waiting().length, 1);
  });

  test('reports a failed download asked for from the menu', async () => {
    const { updates, updater, notices } = withUpdates();
    updates.check(true);
    updater.checks[0].resolve(
      found(Promise.reject(new Error('HttpError: 404'))),
    );
    await settle();
    assert.deepStrictEqual(updates.status, { kind: 'failed' });
    assert.deepStrictEqual(notices().slice(1), [
      `error: ${strings.messages.couldNotDownloadUpdate('7.0.0', 'HttpError: 404')}`,
    ]);
  });

  test('on macOS says once that an update is out, and opens its release page instead of installing it', async () => {
    const { updates, updater, opened, fire, notices } = withUpdates('notify');
    assert.strictEqual(updater.autoDownload, false);
    updates.start();
    updater.checks[0].resolve(found(null));
    await settle();
    assert.deepStrictEqual(updates.status, {
      kind: 'available',
      version: '7.0.0',
    });
    await fire();
    updater.checks[1].resolve(found(null));
    await settle();
    assert.deepStrictEqual(notices(), [
      `info: ${strings.messages.updateAvailable('7.0.0')}`,
    ]);
    updates.install();
    assert.deepStrictEqual(opened, [
      'https://github.com/Anarkin/Fastforward/releases/tag/v7.0.0',
    ]);
    assert.deepStrictEqual(updater.installs, []);
  });

  test('checks nothing in a copy that cannot update, saying why when asked from the menu', () => {
    const { updates, updater, waiting, notices } = withUpdates('off');
    updates.start();
    updates.check(true);
    assert.strictEqual(updater.checks.length, 0);
    assert.strictEqual(waiting().length, 0);
    assert.deepStrictEqual(updates.status, { kind: 'idle' });
    assert.deepStrictEqual(notices(), [
      `info: ${strings.messages.cannotUpdate}`,
    ]);
  });
});
