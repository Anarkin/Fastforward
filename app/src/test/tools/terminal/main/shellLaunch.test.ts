import * as assert from 'node:assert';
import * as path from 'node:path';
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

const integration = path.join('data', 'shellIntegration');
const zshFolder = path.join(integration, 'zsh');

function system(overrides: Partial<ShellSystem> = {}): ShellSystem {
  return {
    platform: 'linux',
    env: { SHELL: '/bin/bash', PATH: '/usr/bin' },
    home: '/home/me',
    version: '22.0.0',
    isFolder: () => true,
    isFile: () => false,
    integration,
    ...overrides,
  };
}

function started(
  shell: string,
  overrides: Partial<ShellSystem> = {},
  shellArgs: readonly string[] = [],
) {
  return shellLaunch(
    { ...defaults, shell, shellArgs },
    undefined,
    system(overrides),
  );
}

function gitBashPromptCommand(env: NodeJS.ProcessEnv): string {
  return (
    started('C:\\Git\\bin\\bash.exe', { platform: 'win32', env }).env
      .PROMPT_COMMAND ?? ''
  );
}

function powerShellScript(args: readonly string[]): string {
  const encoded = args[args.indexOf('-EncodedCommand') + 1] ?? '';
  return Buffer.from(encoded, 'base64').toString('utf16le');
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
      command('darwin', { SHELL: '/opt/homebrew/bin/nu' }),
      ['/opt/homebrew/bin/nu', ['-l']],
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

  test('has PowerShell tell its folder at each prompt, wrapping the prompt its profile set, after the arguments set', () => {
    for (const shell of [
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'powershell.exe',
      'PWSH',
      '/usr/local/bin/pwsh',
    ]) {
      const { args } = started(shell, { platform: 'win32' }, ['-NoLogo']);
      assert.deepStrictEqual(
        args.slice(0, 3),
        ['-NoLogo', '-NoExit', '-EncodedCommand'],
        shell,
      );
      assert.match(powerShellScript(args), /function global:prompt/, shell);
    }
    assert.deepStrictEqual(
      started('pwsh.exe', { platform: 'win32' }, ['-noe']).args.slice(0, 2),
      ['-noe', '-EncodedCommand'],
    );
  });

  test('leaves PowerShell its arguments alone when they run a command or a file, as it then has no prompt to wrap', () => {
    for (const shellArgs of [
      ['-Command', 'Get-Date'],
      ['-c', 'Get-Date'],
      ['/command', 'Get-Date'],
      ['-File', 'start.ps1'],
      ['-f', 'start.ps1'],
      ['-EncodedCommand', 'AA=='],
      ['-ec', 'AA=='],
      ['-CommandWithArgs', 'Get-Date'],
      ['-cwa', 'Get-Date'],
    ]) {
      assert.deepStrictEqual(
        started('pwsh.exe', { platform: 'win32' }, shellArgs).args,
        shellArgs,
      );
    }
  });

  test('has bash tell its folder at each prompt, ahead of a prompt command it inherits', () => {
    const alone = started('/bin/bash').env.PROMPT_COMMAND ?? '';
    assert.match(alone, /9;9;/);
    assert.strictEqual(
      started('/bin/bash', { env: { PROMPT_COMMAND: 'history -a' } }).env
        .PROMPT_COMMAND,
      `${alone}; history -a`,
    );
  });

  test('has bash on Windows tell its folder as a Windows path, as Git Bash has the temporary folder at /tmp, working it out only once the folder changes, as that takes a process', () => {
    assert.match(gitBashPromptCommand({}), /\$\(pwd -W/);
    assert.match(gitBashPromptCommand({}), /\$PWD != /);
    assert.strictEqual(
      gitBashPromptCommand({ Prompt_Command: 'history -a' }),
      `${gitBashPromptCommand({})}; history -a`,
    );
  });

  test('has zsh tell its folder at each prompt through a .zshenv of its own, which reads that of the user from where the user keeps it', () => {
    const isFile = (file: string) => file === path.join(zshFolder, '.zshenv');
    const moved = started('/bin/zsh', {
      isFile,
      env: { ZDOTDIR: '/home/me/.config/zsh' },
    }).env;
    assert.strictEqual(moved.ZDOTDIR, zshFolder);
    assert.strictEqual(moved.FASTFORWARD_ZDOTDIR, '/home/me/.config/zsh');
    const home = started('/bin/zsh', { isFile, env: {} }).env;
    assert.strictEqual(home.ZDOTDIR, zshFolder);
    assert.strictEqual(home.FASTFORWARD_ZDOTDIR, undefined);
  });

  test('leaves zsh be when its .zshenv is missing, as zsh would then miss the files of the user', () => {
    const { env } = started('/bin/zsh', {
      env: { ZDOTDIR: '/home/me/.config/zsh' },
    });
    assert.strictEqual(env.ZDOTDIR, '/home/me/.config/zsh');
    assert.strictEqual(env.FASTFORWARD_ZDOTDIR, undefined);
  });

  test('has fish tell its folder at each prompt, once it has read its configuration', () => {
    const [, args = []] = command('darwin', {
      SHELL: '/opt/homebrew/bin/fish',
    });
    assert.strictEqual(args[0], '--init-command');
    assert.match(args[1] ?? '', /fish_prompt/);
    assert.deepStrictEqual(args.slice(2), ['-l']);
  });

  test('has the Command Prompt tell its folder in its prompt, ahead of the prompt set', () => {
    assert.strictEqual(
      started('cmd.exe', { platform: 'win32', env: {} }).env.PROMPT,
      '$E]9;9;$P$E\\$P$G',
    );
    const { env } = started('C:\\Windows\\System32\\CMD.EXE', {
      platform: 'win32',
      env: { Prompt: '$T$G' },
    });
    assert.strictEqual(env.PROMPT, '$E]9;9;$P$E\\$T$G');
    assert.strictEqual(env.Prompt, undefined);
  });

  test('leaves the shells it does not know alone', () => {
    for (const shell of [
      '/bin/sh',
      '/usr/bin/nu',
      'C:\\Windows\\System32\\wsl.exe',
    ]) {
      const { args, env } = started(shell, {}, ['-x']);
      assert.deepStrictEqual(args, ['-x'], shell);
      assert.deepStrictEqual(
        [env.PROMPT_COMMAND, env.ZDOTDIR, env.PROMPT],
        [undefined, undefined, undefined],
        shell,
      );
    }
  });
});
