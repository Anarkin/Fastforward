import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const minimumGitVersion = [2, 52] as const;

interface FoundGit {
  readonly path: string;
  readonly version: string;
}

export type GitSearch =
  | ({ readonly kind: 'found' } & FoundGit)
  | { readonly kind: 'missing' }
  | {
      readonly kind: 'tooOld';
      readonly path: string;
      readonly version: string;
    };

export async function findGit(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<GitSearch> {
  const candidate = onPath('git', env, platform);
  if (!candidate) {
    return { kind: 'missing' };
  }
  const version = parseVersion(await versionOutput(candidate));
  if (!version) {
    return { kind: 'missing' };
  }
  return isSupported(version)
    ? { kind: 'found', path: candidate, version }
    : { kind: 'tooOld', path: candidate, version };
}

export function onPath(
  command: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string | undefined {
  const windows = platform === 'win32';
  const pathKey =
    Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
  const folders = (env[pathKey] ?? '')
    .split(windows ? ';' : ':')
    .filter(Boolean);
  const extensions = windows
    ? (env.PATHEXT ?? '.EXE;.COM')
        .split(';')
        .filter((extension) => /^\.(?:exe|com)$/i.test(extension))
    : [''];
  for (const folder of folders) {
    for (const extension of extensions) {
      const file = path.join(folder, command + extension.toLowerCase());
      if (isExecutable(file, windows)) {
        return file;
      }
    }
  }
  return undefined;
}

function isExecutable(file: string, windows: boolean): boolean {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) {
      return false;
    }
    if (!windows) {
      fs.accessSync(file, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

function versionOutput(gitPath: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      gitPath,
      ['--version'],
      { windowsHide: true, timeout: 10_000 },
      (error, stdout) => resolve(error ? '' : stdout),
    );
  });
}

export function parseVersion(output: string): string | undefined {
  return /^git version (\d+\.\d+(?:\.\d+)?)/.exec(output.trim())?.[1];
}

export function isSupported(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  const [needMajor, needMinor] = minimumGitVersion;
  return major > needMajor || (major === needMajor && minor >= needMinor);
}
