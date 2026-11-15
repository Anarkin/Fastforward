import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  integrated,
  type IntegrationSystem,
} from '../../../../../tools/terminal/main/shellIntegration';

const integration = path.join('data', 'shellIntegration');
const zshFolder = path.join(integration, 'zsh');

type Env = Readonly<Record<string, string>>;

function started(
  shell: string,
  {
    env = { SHELL: '/bin/bash', PATH: '/usr/bin' },
    ...overrides
  }: Partial<IntegrationSystem> & { readonly env?: Env } = {},
  shellArgs: readonly string[] = [],
) {
  return integrated({ file: shell, args: shellArgs }, env, {
    platform: 'linux',
    integration,
    isFile: () => Promise.resolve(false),
    ...overrides,
  });
}

async function gitBashPromptCommand(env: Env): Promise<string> {
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

suite('Shell integration', () => {
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
