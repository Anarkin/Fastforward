import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ShellLaunch } from './hostProtocol';
import { integrated, type IntegrationSystem } from './shellIntegration';
import type { TerminalSettings } from '../shared/settings';
import { brand } from '../../../lib/shared/strings';

export interface ShellSystem extends IntegrationSystem {
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly version: string;
  readonly isFolder: (folder: string) => Promise<boolean>;
  readonly isProgram: (file: string) => Promise<boolean>;
}

export function isProgram(file: string): Promise<boolean> {
  return fs.promises.stat(file).then(
    (stats) => stats.isFile(),
    () =>
      fs.promises.lstat(file).then(
        (stats) => stats.isSymbolicLink(),
        () => false,
      ),
  );
}

const leftOut = /^(?:ELECTRON_|FASTFORWARD_)/i;

export async function shellLaunch(
  settings: TerminalSettings,
  folder: string | undefined,
  system: ShellSystem,
): Promise<ShellLaunch> {
  const [launched, startsInFolder] = await Promise.all([
    shellCommand(settings, system).then((command) =>
      integrated(command, shellEnv(system), system),
    ),
    folder !== undefined && system.isFolder(folder),
  ]);
  return {
    ...launched,
    cwd: folder !== undefined && startsInFolder ? folder : system.home,
  };
}

async function shellCommand(
  settings: TerminalSettings,
  { platform, env, isProgram: found }: ShellSystem,
): Promise<Pick<ShellLaunch, 'file' | 'args'>> {
  const args = settings.shellArgs.filter((arg) => typeof arg === 'string');
  if (settings.shell !== '') {
    return { file: settings.shell, args };
  }
  switch (platform) {
    case 'win32':
      return {
        file: (await onPath('pwsh.exe', env, found)) ?? 'powershell.exe',
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

async function onPath(
  name: string,
  env: NodeJS.ProcessEnv,
  isFile: (file: string) => Promise<boolean>,
): Promise<string | undefined> {
  const files = (env.PATH ?? env.Path ?? '')
    .split(path.win32.delimiter)
    .filter(Boolean)
    .map((folder) => path.win32.join(folder, name));
  for (const file of files) {
    if (await isFile(file)) {
      return file;
    }
  }
  return undefined;
}

const appImageOwn = ['APPIMAGE', 'APPDIR', 'ARGV0', 'OWD'];
const appImageLists = [
  'PATH',
  'LD_LIBRARY_PATH',
  'XDG_DATA_DIRS',
  'GSETTINGS_SCHEMA_DIR',
];

function withoutAppImage(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { APPIMAGE: image, APPDIR: mounted } = env;
  if (image === undefined || mounted === undefined || mounted === '') {
    return env;
  }
  const inside = (entry: string) =>
    entry === mounted || entry.startsWith(`${mounted}/`);
  const left: NodeJS.ProcessEnv = { ...env };
  for (const name of appImageOwn) {
    delete left[name];
  }
  for (const name of appImageLists) {
    const entries = (env[name] ?? '')
      .split(':')
      .filter((entry) => entry !== '' && !inside(entry));
    if (entries.length === 0) {
      delete left[name];
    } else {
      left[name] = entries.join(':');
    }
  }
  return left;
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
  } = platform === 'linux' ? withoutAppImage(env) : env;
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
