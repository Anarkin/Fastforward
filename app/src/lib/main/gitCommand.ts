import { win32 } from 'node:path';
import { fs } from './files';

export const unnamedBareRefused = ['-c', 'safe.bareRepository=explicit'];

const elsewhere = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_COMMON_DIR',
  'GIT_GLOB_PATHSPECS',
  'GIT_NOGLOB_PATHSPECS',
  'GIT_ICASE_PATHSPECS',
  'GIT_NAMESPACE',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_QUARANTINE_PATH',
  'GIT_SHALLOW_FILE',
];

const ofTheLauncher =
  /^GIT_(?:CONFIG_(?:PARAMETERS|COUNT|KEY_\d+|VALUE_\d+)|EXEC_PATH|REFLOG_ACTION)$/;

const askpassOfVsCode = /^VSCODE_GIT_(?:ASKPASS_|IPC_)/;

export function inheritedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const names = Object.keys(env);
  const askedByVsCode = names.some((name) => askpassOfVsCode.test(name));
  for (const name of names) {
    if (
      elsewhere.includes(name) ||
      ofTheLauncher.test(name) ||
      askpassOfVsCode.test(name) ||
      (askedByVsCode && name === 'GIT_ASKPASS')
    ) {
      delete env[name];
    }
  }
  return env;
}

export function gitEnv(pathspecMagic = false): NodeJS.ProcessEnv {
  return {
    ...inheritedEnv(),
    GIT_OPTIONAL_LOCKS: '0',
    LC_ALL: 'C',
    GIT_FLUSH: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ADVICE: '0',
    GIT_LITERAL_PATHSPECS: pathspecMagic ? '0' : '1',
  };
}

export interface GitCommand {
  readonly command: string;
  readonly env: NodeJS.ProcessEnv;
}

const msystems = ['ucrt64', 'clangarm64', 'mingw64', 'mingw32'];

export function realGit(
  launcher: string,
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
  exists: (file: string) => boolean = fs.existsSync,
): GitCommand | undefined {
  const { dir, base } = win32.parse(launcher);
  const root = win32.dirname(dir);
  const msystem = msystems.find((name) =>
    exists(win32.join(root, name, 'bin', 'git.exe')),
  );
  if (
    platform !== 'win32' ||
    base.toLowerCase() !== 'git.exe' ||
    win32.basename(dir).toLowerCase() !== 'cmd' ||
    !exists(win32.join(root, 'usr', 'bin', 'sh.exe')) ||
    msystem === undefined
  ) {
    return undefined;
  }
  const pathKey =
    Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
  const drive =
    env.HOMEDRIVE === undefined || env.HOMEPATH === undefined
      ? undefined
      : env.HOMEDRIVE + env.HOMEPATH;
  const home =
    env.HOME ??
    (drive !== undefined && exists(drive) ? drive : env.USERPROFILE);
  return {
    command: win32.join(root, msystem, 'bin', 'git.exe'),
    env: {
      MSYSTEM: msystem.toUpperCase(),
      [pathKey]: [
        win32.join(root, msystem, 'bin'),
        win32.join(root, 'usr', 'bin'),
        ...(home === undefined ? [] : [win32.join(home, 'bin')]),
        ...(env[pathKey] === undefined ? [] : [env[pathKey]]),
      ].join(';'),
    },
  };
}

const realGits = new Map<string, GitCommand>();

export function gitCommand(gitPath: string): GitCommand {
  let found = realGits.get(gitPath);
  if (found === undefined) {
    found = realGit(gitPath) ?? { command: gitPath, env: {} };
    realGits.set(gitPath, found);
  }
  return found;
}
