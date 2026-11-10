import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  isProgram,
  shellLaunch,
  type ShellSystem,
} from '../../../../tools/terminal/main/shellLaunch';
import type { TerminalSettings } from '../../../../tools/terminal/shared/settings';
import { removeFolder, tempFolder } from '../../../repositories';

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
    isFolder: () => Promise.resolve(true),
    isFile: () => Promise.resolve(false),
    isProgram: () => Promise.resolve(false),
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

async function gitBashPromptCommand(env: NodeJS.ProcessEnv): Promise<string> {
  const launch = await started('C:\\Git\\bin\\bash.exe', {
    platform: 'win32',
    env,
  });
  return launch.env.PROMPT_COMMAND ?? '';
}

function powerShellScript(args: readonly string[]): string {
  const encoded = args[args.indexOf('-EncodedCommand') + 1] ?? '';
  return Buffer.from(encoded, 'base64').toString('utf16le');
}

function launched(overrides: Partial<ShellSystem>, folder?: string) {
  return shellLaunch(defaults, folder, system(overrides));
}

async function windowsShell(
  isFound: (file: string) => Promise<boolean>,
): Promise<string> {
  const launch = await launched({
    platform: 'win32',
    env: { Path: 'C:\\Windows;C:\\Program Files\\PowerShell\\7' },
    isProgram: isFound,
  });
  return launch.file;
}

async function command(platform: NodeJS.Platform, env: NodeJS.ProcessEnv) {
  const { file, args } = await launched({ platform, env });
  return [file, args];
}

suite('Shell launch', () => {
  test('starts the shell set in the settings, with the arguments set there', async () => {
    const { file, args } = await shellLaunch(
      { ...defaults, shell: 'C:\\Git\\bin\\bash.exe', shellArgs: ['--login'] },
      undefined,
      system({ platform: 'win32' }),
    );
    assert.deepStrictEqual(
      [file, args],
      ['C:\\Git\\bin\\bash.exe', ['--login']],
    );
  });

  test('takes for a program on the PATH a file, or a link it cannot follow, as PowerShell 7 from the Store is only an alias of the system there, but no folder', async (context) => {
    const folder = tempFolder('programs');
    try {
      const file = path.join(folder, 'pwsh.exe');
      fs.writeFileSync(file, '');
      const alias = path.join(folder, 'alias.exe');
      try {
        fs.symlinkSync(path.join(folder, 'nowhere'), alias, 'file');
      } catch {
        context.skip();
      }

      assert.deepStrictEqual(
        await Promise.all(
          [file, alias, folder, path.join(folder, 'missing.exe')].map(
            isProgram,
          ),
        ),
        [true, true, false, false],
      );
    } finally {
      removeFolder(folder);
    }
  });

  test('starts PowerShell 7 on Windows when it is on the PATH, and Windows PowerShell otherwise', async () => {
    assert.strictEqual(
      await windowsShell((file) =>
        Promise.resolve(file === 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'),
      ),
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    );
    assert.strictEqual(
      await windowsShell(() => Promise.resolve(false)),
      'powershell.exe',
    );
  });

  test('starts the shell of the user, as a login shell on macOS as its Terminal does, or a fallback when it is not known', async () => {
    assert.deepStrictEqual(
      await command('darwin', { SHELL: '/opt/homebrew/bin/nu' }),
      ['/opt/homebrew/bin/nu', ['-l']],
    );
    assert.deepStrictEqual(await command('darwin', {}), ['/bin/zsh', ['-l']]);
    assert.deepStrictEqual(await command('linux', { SHELL: '/bin/bash' }), [
      '/bin/bash',
      [],
    ]);
    assert.deepStrictEqual(await command('linux', {}), ['/bin/sh', []]);
  });

  test('starts in the folder of the tab, or in the home folder for a tab without one or whose folder is gone', async () => {
    assert.strictEqual(
      (await launched({ isFolder: () => Promise.resolve(true) }, '/work/repo'))
        .cwd,
      '/work/repo',
    );
    assert.strictEqual(
      (await launched({ isFolder: () => Promise.resolve(false) }, '/work/gone'))
        .cwd,
      '/home/me',
    );
    assert.strictEqual((await launched({})).cwd, '/home/me');
  });

  test('tells programs they run in a 256-color, true-color terminal of Fastforward, leaving out the variables of Electron and of Fastforward itself', async () => {
    const { env } = await launched({
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

  test('leaves out what the AppImage it runs from adds to the environment, as zsh runs every program under the ARGV0 of the AppImage and programs loaded the libraries inside it', async () => {
    const mounted = '/tmp/.mount_FastfoAbc';
    const { env } = await launched({
      env: {
        APPIMAGE: '/home/me/Fastforward.AppImage',
        APPDIR: mounted,
        ARGV0: 'Fastforward.AppImage',
        OWD: '/home/me',
        PATH: `${mounted}:${mounted}/usr/sbin:/usr/local/bin:/usr/bin`,
        LD_LIBRARY_PATH: `${mounted}/usr/lib`,
        XDG_DATA_DIRS: `${mounted}/usr/share/:/usr/share:/usr/share/gnome`,
        GSETTINGS_SCHEMA_DIR: `${mounted}/usr/share/glib-2.0/schemas:/opt/schemas`,
      },
    });

    assert.deepStrictEqual(
      [
        'APPIMAGE',
        'APPDIR',
        'ARGV0',
        'OWD',
        'PATH',
        'LD_LIBRARY_PATH',
        'XDG_DATA_DIRS',
        'GSETTINGS_SCHEMA_DIR',
      ].map((name) => env[name]),
      [
        undefined,
        undefined,
        undefined,
        undefined,
        '/usr/local/bin:/usr/bin',
        undefined,
        '/usr/share:/usr/share/gnome',
        '/opt/schemas',
      ],
    );
  });

  test('leaves TERM unset on Windows, where programs read the console instead', async () => {
    assert.strictEqual(
      (await launched({ platform: 'win32', env: {} })).env.TERM,
      undefined,
    );
  });

  test('gives a UTF-8 locale on macOS when Fastforward was started without one, as from the Dock', async () => {
    assert.strictEqual(
      (await launched({ platform: 'darwin', env: {} })).env.LANG,
      'en_US.UTF-8',
    );
    assert.strictEqual(
      (await launched({ platform: 'darwin', env: { LANG: 'de_DE.UTF-8' } })).env
        .LANG,
      'de_DE.UTF-8',
    );
  });

  test('gives back the desktop that Electron replaced on Linux', async () => {
    const { env } = await launched({
      env: {
        XDG_CURRENT_DESKTOP: 'Unity',
        ORIGINAL_XDG_CURRENT_DESKTOP: 'GNOME',
      },
    });
    assert.strictEqual(env.XDG_CURRENT_DESKTOP, 'GNOME');
    assert.strictEqual(env.ORIGINAL_XDG_CURRENT_DESKTOP, undefined);
  });

  test('has PowerShell tell its folder at each prompt, wrapping the prompt its profile set, after the arguments set', async () => {
    for (const shell of [
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'powershell.exe',
      'PWSH',
      '/usr/local/bin/pwsh',
    ]) {
      const { args } = await started(shell, { platform: 'win32' }, ['-NoLogo']);
      assert.deepStrictEqual(
        args.slice(0, 3),
        ['-NoLogo', '-NoExit', '-EncodedCommand'],
        shell,
      );
      assert.match(powerShellScript(args), /function global:prompt/, shell);
    }
    assert.deepStrictEqual(
      (await started('pwsh.exe', { platform: 'win32' }, ['-noe'])).args.slice(
        0,
        2,
      ),
      ['-noe', '-EncodedCommand'],
    );
  });

  test('leaves PowerShell its arguments alone when they run a command or a file, as it then has no prompt to wrap', async () => {
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
        (await started('pwsh.exe', { platform: 'win32' }, shellArgs)).args,
        shellArgs,
      );
    }
  });

  test('has bash tell its folder at each prompt, ahead of a prompt command it inherits', async () => {
    const alone = (await started('/bin/bash')).env.PROMPT_COMMAND ?? '';
    assert.match(alone, /9;9;/);
    assert.strictEqual(
      (await started('/bin/bash', { env: { PROMPT_COMMAND: 'history -a' } }))
        .env.PROMPT_COMMAND,
      `${alone}; history -a`,
    );
  });

  test('has bash on Windows tell its folder as a Windows path, as Git Bash has the temporary folder at /tmp, working it out only once the folder changes, as that takes a process', async () => {
    assert.match(await gitBashPromptCommand({}), /\$\(pwd -W/);
    assert.match(await gitBashPromptCommand({}), /\$PWD != /);
    assert.strictEqual(
      await gitBashPromptCommand({ Prompt_Command: 'history -a' }),
      `${await gitBashPromptCommand({})}; history -a`,
    );
  });

  test('has zsh tell its folder at each prompt through a .zshenv of its own, which reads that of the user from where the user keeps it', async () => {
    const isFile = (file: string) =>
      Promise.resolve(file === path.join(zshFolder, '.zshenv'));
    const moved = (
      await started('/bin/zsh', {
        isFile,
        env: { ZDOTDIR: '/home/me/.config/zsh' },
      })
    ).env;
    assert.strictEqual(moved.ZDOTDIR, zshFolder);
    assert.strictEqual(moved.FASTFORWARD_ZDOTDIR, '/home/me/.config/zsh');
    const home = (await started('/bin/zsh', { isFile, env: {} })).env;
    assert.strictEqual(home.ZDOTDIR, zshFolder);
    assert.strictEqual(home.FASTFORWARD_ZDOTDIR, undefined);
  });

  test('leaves zsh be when its .zshenv is missing, as zsh would then miss the files of the user', async () => {
    const { env } = await started('/bin/zsh', {
      env: { ZDOTDIR: '/home/me/.config/zsh' },
    });
    assert.strictEqual(env.ZDOTDIR, '/home/me/.config/zsh');
    assert.strictEqual(env.FASTFORWARD_ZDOTDIR, undefined);
  });

  test('has fish tell its folder at each prompt, once it has read its configuration', async () => {
    const [, args = []] = await command('darwin', {
      SHELL: '/opt/homebrew/bin/fish',
    });
    assert.strictEqual(args[0], '--init-command');
    assert.match(args[1] ?? '', /fish_prompt/);
    assert.deepStrictEqual(args.slice(2), ['-l']);
  });

  test('has the Command Prompt tell its folder in its prompt, ahead of the prompt set', async () => {
    assert.strictEqual(
      (await started('cmd.exe', { platform: 'win32', env: {} })).env.PROMPT,
      '$E]9;9;$P$E\\$P$G',
    );
    const { env } = await started('C:\\Windows\\System32\\CMD.EXE', {
      platform: 'win32',
      env: { Prompt: '$T$G' },
    });
    assert.strictEqual(env.PROMPT, '$E]9;9;$P$E\\$T$G');
    assert.strictEqual(env.Prompt, undefined);
  });

  test('leaves the shells it does not know alone', async () => {
    for (const shell of [
      '/bin/sh',
      '/usr/bin/nu',
      'C:\\Windows\\System32\\wsl.exe',
    ]) {
      const { args, env } = await started(shell, {}, ['-x']);
      assert.deepStrictEqual(args, ['-x'], shell);
      assert.deepStrictEqual(
        [env.PROMPT_COMMAND, env.ZDOTDIR, env.PROMPT],
        [undefined, undefined, undefined],
        shell,
      );
    }
  });
});
