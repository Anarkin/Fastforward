import * as path from 'node:path';
import type { ShellLaunch } from './hostProtocol';
import type { TerminalSettings } from '../shared/settings';
import { brand } from '../../../shared/strings';

export interface ShellSystem {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly version: string;
  readonly isFolder: (folder: string) => boolean;
  readonly isFile: (file: string) => boolean;
}

const leftOut = /^(?:ELECTRON_|FASTFORWARD_)/i;

export function shellLaunch(
  settings: TerminalSettings,
  folder: string | undefined,
  system: ShellSystem,
): ShellLaunch {
  return {
    ...shellCommand(settings, system),
    cwd: folder !== undefined && system.isFolder(folder) ? folder : system.home,
    env: shellEnv(system),
  };
}

function shellCommand(
  settings: TerminalSettings,
  { platform, env, isFile }: ShellSystem,
): Pick<ShellLaunch, 'file' | 'args'> {
  const args = settings.shellArgs.filter((arg) => typeof arg === 'string');
  if (settings.shell !== '') {
    return { file: settings.shell, args };
  }
  switch (platform) {
    case 'win32':
      return {
        file: onPath('pwsh.exe', env, isFile) ?? 'powershell.exe',
        args,
      };
    case 'darwin':
      return {
        file: env.SHELL || '/bin/zsh',
        args: args.length > 0 ? args : ['-l'],
      };
    default:
      return { file: env.SHELL || '/bin/sh', args };
  }
}

function onPath(
  name: string,
  env: NodeJS.ProcessEnv,
  isFile: (file: string) => boolean,
): string | undefined {
  return (env.PATH ?? env.Path ?? '')
    .split(path.win32.delimiter)
    .filter(Boolean)
    .map((folder) => path.win32.join(folder, name))
    .find(isFile);
}

function shellEnv({
  platform,
  env,
  version,
}: ShellSystem): Record<string, string> {
  const {
    ORIGINAL_XDG_CURRENT_DESKTOP: desktop,
    XDG_CURRENT_DESKTOP: replaced,
    ...rest
  } = env;
  const kept = Object.entries({
    ...rest,
    XDG_CURRENT_DESKTOP: desktop ?? replaced,
  }).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === 'string' && !leftOut.test(entry[0]),
  );
  return {
    ...Object.fromEntries(kept),
    ...(platform !== 'win32' && { TERM: 'xterm-256color' }),
    COLORTERM: 'truecolor',
    TERM_PROGRAM: brand,
    TERM_PROGRAM_VERSION: version,
    ...(platform === 'darwin' && !env.LANG && { LANG: 'en_US.UTF-8' }),
  };
}
