import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  shellLaunch,
  type ShellSystem,
} from '../../../../tools/terminal/main/shellLaunch';
import type { TerminalSettings } from '../../../../tools/terminal/shared/settings';

const defaults: TerminalSettings = {
  shell: '',
  shellArgs: [],
  renderer: 'webgl',
  scrollback: 10_000,
  minimumContrastRatio: 4.5,
};

function system(overrides: Partial<ShellSystem> = {}): ShellSystem {
  return {
    platform: 'linux',
    env: { SHELL: '/bin/bash', PATH: '/usr/bin' },
    home: '/home/me',
    version: '22.0.0',
    isFolder: () => true,
    isFile: () => false,
    ...overrides,
  };
}

function launched(overrides: Partial<ShellSystem>, folder?: string) {
  return shellLaunch(defaults, folder, system(overrides));
}

function windowsShell(isFile: (file: string) => boolean): string {
  return launched({
    platform: 'win32',
    env: { Path: 'C:\\Windows;C:\\Program Files\\PowerShell\\7' },
    isFile,
  }).file;
}

function command(platform: NodeJS.Platform, env: NodeJS.ProcessEnv) {
  const { file, args } = launched({ platform, env });
  return [file, args];
}

suite('Shell launch', () => {
  test('starts the shell set in the settings, with the arguments set there', () => {
    const { file, args } = shellLaunch(
      { ...defaults, shell: 'C:\\Git\\bin\\bash.exe', shellArgs: ['--login'] },
      undefined,
      system({ platform: 'win32' }),
    );
    assert.deepStrictEqual(
      [file, args],
      ['C:\\Git\\bin\\bash.exe', ['--login']],
    );
  });

  test('starts PowerShell 7 on Windows when it is on the PATH, and Windows PowerShell otherwise', () => {
    assert.strictEqual(
      windowsShell(
        (file) => file === 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      ),
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    );
    assert.strictEqual(
      windowsShell(() => false),
      'powershell.exe',
    );
  });

  test('starts the shell of the user, as a login shell on macOS as its Terminal does, or a fallback when it is not known', () => {
    assert.deepStrictEqual(
      command('darwin', { SHELL: '/opt/homebrew/bin/fish' }),
      ['/opt/homebrew/bin/fish', ['-l']],
    );
    assert.deepStrictEqual(command('darwin', {}), ['/bin/zsh', ['-l']]);
    assert.deepStrictEqual(command('linux', { SHELL: '/bin/bash' }), [
      '/bin/bash',
      [],
    ]);
    assert.deepStrictEqual(command('linux', {}), ['/bin/sh', []]);
  });

  test('starts in the folder of the tab, or in the home folder for a tab without one or whose folder is gone', () => {
    assert.strictEqual(
      launched({ isFolder: () => true }, '/work/repo').cwd,
      '/work/repo',
    );
    assert.strictEqual(
      launched({ isFolder: () => false }, '/work/gone').cwd,
      '/home/me',
    );
    assert.strictEqual(launched({}).cwd, '/home/me');
  });

  test('tells programs they run in a 256-color, true-color terminal of Fastforward, leaving out the variables of Electron and of Fastforward itself', () => {
    const { env } = launched({
      env: {
        PATH: '/usr/bin',
        ELECTRON_RUN_AS_NODE: '1',
        FASTFORWARD_DEV: '1',
        EMPTY: undefined,
      },
    });
    assert.deepStrictEqual(env, {
      PATH: '/usr/bin',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'Fastforward',
      TERM_PROGRAM_VERSION: '22.0.0',
    });
  });

  test('leaves TERM unset on Windows, where programs read the console instead', () => {
    assert.strictEqual(
      launched({ platform: 'win32', env: {} }).env.TERM,
      undefined,
    );
  });

  test('gives a UTF-8 locale on macOS when Fastforward was started without one, as from the Dock', () => {
    assert.strictEqual(
      launched({ platform: 'darwin', env: {} }).env.LANG,
      'en_US.UTF-8',
    );
    assert.strictEqual(
      launched({ platform: 'darwin', env: { LANG: 'de_DE.UTF-8' } }).env.LANG,
      'de_DE.UTF-8',
    );
  });

  test('gives back the desktop that Electron replaced on Linux', () => {
    const { env } = launched({
      env: {
        XDG_CURRENT_DESKTOP: 'Unity',
        ORIGINAL_XDG_CURRENT_DESKTOP: 'GNOME',
      },
    });
    assert.strictEqual(env.XDG_CURRENT_DESKTOP, 'GNOME');
    assert.strictEqual(env.ORIGINAL_XDG_CURRENT_DESKTOP, undefined);
  });
});
