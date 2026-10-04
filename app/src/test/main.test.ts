import * as assert from 'node:assert';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { appFile, rebuilt, visibleBounds } from '../main/files';
import { profileFolder } from '../main/profile';
import { flushBeforeQuit } from '../main/quit';
import {
  loginShellPath,
  mergePaths,
  pathFromOutput,
  pathFromShell,
} from '../main/shellPath';
import { checksForUpdates } from '../main/updates';
import { installedGit } from './repositories';

suite('App files', () => {
  const root = path.resolve('dist');

  test('serves the page and its files from the build folder', () => {
    assert.strictEqual(
      appFile(root, 'fastforward://app/index.html'),
      path.join(root, 'index.html'),
    );
    assert.strictEqual(
      appFile(root, 'fastforward://app/'),
      path.join(root, 'index.html'),
    );
    assert.strictEqual(
      appFile(root, 'fastforward://app/webview.js?v=1'),
      path.join(root, 'webview.js'),
    );
  });

  test('serves nothing outside the build folder or from another host', () => {
    for (const url of [
      'fastforward://app/%2e%2e/package.json',
      'fastforward://app/..%5Cpackage.json',
      'fastforward://app/..%2Fpackage.json',
    ]) {
      const file = appFile(root, url);
      assert.ok(
        file === undefined || file.startsWith(root + path.sep),
        `${url} served ${file}`,
      );
    }
    assert.strictEqual(
      appFile(root, 'fastforward://other/index.html'),
      undefined,
    );
  });
});

suite('Rebuilding while the app runs', () => {
  test('reloads the page for its script and its HTML, and the defaults for the settings', () => {
    assert.strictEqual(rebuilt('webview.js'), 'page');
    assert.strictEqual(rebuilt('webview.css'), 'page');
    assert.strictEqual(rebuilt('index.html'), 'page');
    assert.strictEqual(rebuilt('settings.json'), 'defaults');
    assert.strictEqual(rebuilt('main.js'), undefined);
    assert.strictEqual(rebuilt(null), undefined);
  });
});

suite('Window bounds', () => {
  const screens = [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: 1920, y: 0, width: 1280, height: 1024 },
  ];

  test('keeps a window on one of the screens', () => {
    const saved = { x: 2000, y: 100, width: 800, height: 600 };
    assert.deepStrictEqual(visibleBounds(saved, screens), saved);
  });

  test('forgets a window left on a screen since removed', () => {
    assert.strictEqual(
      visibleBounds({ x: 3500, y: 100, width: 800, height: 600 }, screens),
      undefined,
    );
    assert.strictEqual(
      visibleBounds({ x: -750, y: 100, width: 800, height: 600 }, screens),
      undefined,
    );
  });

  test('ignores bounds that were never saved or saved wrong', () => {
    assert.strictEqual(visibleBounds(undefined, screens), undefined);
    assert.strictEqual(
      visibleBounds({ x: 0, y: 0, width: 'wide', height: 600 }, screens),
      undefined,
    );
  });
});

function gitShell(gitPath: string): string {
  for (let folder = path.dirname(gitPath); ; folder = path.dirname(folder)) {
    const shell = path.join(folder, 'bin', 'sh.exe');
    if (fs.existsSync(shell)) {
      return shell;
    }
    assert.notStrictEqual(path.dirname(folder), folder, 'no sh.exe beside git');
  }
}

suite('Login shell PATH', () => {
  test("reads the PATH the user's login shell sets", async function () {
    this.timeout(10_000);
    const shell =
      process.platform === 'win32' ? gitShell(await installedGit()) : '/bin/sh';
    const found = await loginShellPath({
      ...process.env,
      SHELL: shell,
      PATH: [path.resolve('fastforward-probe'), process.env.PATH].join(
        path.delimiter,
      ),
    });
    assert.match(found ?? '', /fastforward-probe/);
  });

  test("reads the PATH when the shell's profile waits for input", async function () {
    this.timeout(10_000);
    const shell =
      process.platform === 'win32'
        ? gitShell(await installedGit())
        : '/bin/bash';
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-shell-'));
    try {
      for (const profile of ['.bash_profile', '.profile']) {
        fs.writeFileSync(path.join(home, profile), 'read answer\n');
      }
      const found = await loginShellPath(
        { ...process.env, HOME: home, SHELL: shell },
        3000,
      );
      assert.ok(found);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('gives up on a shell that never prints the PATH, killing it for good', async () => {
    const signals: unknown[] = [];
    const stdout = new PassThrough();
    stdout.write('Update now? [y/N] ');
    const shell = Object.assign(new EventEmitter(), {
      stdout,
      kill: (signal: unknown) => signals.push(signal) > 0,
    });
    assert.strictEqual(await pathFromShell(shell, 10), undefined);
    assert.deepStrictEqual(signals, ['SIGKILL']);
  });

  test("reads the PATH between the markers, past what the shell's profile prints", () => {
    assert.strictEqual(
      pathFromOutput(
        'Welcome!\n__FASTFORWARD_PATH__/opt/homebrew/bin:/usr/bin__FASTFORWARD_PATH__',
      ),
      '/opt/homebrew/bin:/usr/bin',
    );
    assert.strictEqual(pathFromOutput(''), undefined);
    assert.strictEqual(pathFromOutput('__FASTFORWARD_PATH__'), undefined);
  });

  test('puts the shell folders first, without repeating any', () => {
    assert.strictEqual(
      mergePaths('/opt/homebrew/bin:/usr/bin', '/usr/bin:/bin', ':'),
      '/opt/homebrew/bin:/usr/bin:/bin',
    );
    assert.strictEqual(mergePaths(undefined, '/usr/bin', ':'), '/usr/bin');
  });
});

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

suite('Updates', () => {
  const installed = 'C:\\Users\\a\\AppData\\Local\\Programs\\fastforward';
  const exists = (file: string) =>
    file === `${installed}\\Uninstall Fastforward.exe`;

  test('checks for updates only in an installed app on Windows or Linux', () => {
    const executable = `${installed}\\Fastforward.exe`;
    assert.ok(checksForUpdates(false, 'win32', executable, exists));
    assert.ok(
      checksForUpdates(false, 'linux', '/opt/Fastforward/fastforward', exists),
    );
    assert.ok(!checksForUpdates(true, 'win32', executable, exists));
    assert.ok(!checksForUpdates(false, 'darwin', '/Applications/x', exists));
  });

  test('leaves a Windows app it did not install alone, as from the zip or the portable exe', () => {
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

suite('Quitting', () => {
  test('waits for what is being saved before it quits, however it was asked to', async () => {
    let quitting: ((event: { preventDefault(): void }) => void) | undefined;
    let quits = 0;
    const app = {
      on: (_event: 'will-quit', listener: typeof quitting) => {
        quitting = listener;
      },
      quit: () => {
        quits += 1;
      },
    };
    const saved = Promise.withResolvers<void>();
    flushBeforeQuit(app, () => saved.promise);
    let prevented = 0;
    const event = {
      preventDefault: () => {
        prevented += 1;
      },
    };
    quitting?.(event);
    assert.strictEqual(prevented, 1);
    assert.strictEqual(quits, 0);
    saved.resolve();
    await saved.promise;
    await Promise.resolve();
    assert.strictEqual(quits, 1);
    quitting?.(event);
    assert.strictEqual(prevented, 1);
  });
});
