import { type ChildProcess, execFile } from 'node:child_process';
import { join } from 'node:path';
import { strings } from '../shared/strings';

export const gitConfigArgs = [
  '-c',
  'core.quotePath=false',
  '-c',
  'color.ui=false',
  '-c',
  'log.showSignature=false',
  '-c',
  'diff.suppressBlankEmpty=false',
  '-c',
  'log.showRoot=true',
  '-c',
  'diff.submodule=short',
  '-c',
  'i18n.logOutputEncoding=UTF-8',
  '-c',
  'diff.autoRefreshIndex=false',
];

export function gitEnv(pathspecMagic = false): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_LITERAL_PATHSPECS: pathspecMagic ? '0' : '1',
  };
}

function hooksEnv(): NodeJS.ProcessEnv {
  return { ...process.env, GIT_TERMINAL_PROMPT: '0' };
}

const monitors = new Map<string, Promise<string[]>>();

function monitorArgs(gitPath: string, cwd: string): Promise<string[]> {
  const key = `${gitPath}\0${cwd}`;
  let args = monitors.get(key);
  if (args === undefined) {
    args = new Promise((resolve) => {
      execFile(
        gitPath,
        ['config', '--type=bool', '--get', 'core.fsmonitor'],
        { cwd, env: gitEnv(), windowsHide: true },
        (error, stdout) => {
          const daemon = !error && stdout.trim() === 'true';
          resolve(['-c', `core.fsmonitor=${daemon}`]);
        },
      );
    });
    monitors.set(key, args);
  }
  return args;
}

interface RunOptions {
  readonly okExitCodes?: readonly number[];
  readonly input?: string;
  readonly pathspecMagic?: boolean;
  readonly signal?: AbortSignal;
  readonly env?: NodeJS.ProcessEnv;
  readonly runsHooks?: boolean;
}

const maxOutput = 256 * 1024 * 1024;

export async function runGit(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<string> {
  return (await runGitBytes(gitPath, cwd, args, options)).toString('utf8');
}

export async function runGitBytes(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  {
    okExitCodes = [0],
    input,
    pathspecMagic,
    signal,
    env,
    runsHooks = false,
  }: RunOptions = {},
): Promise<Buffer> {
  signal?.throwIfAborted();
  const monitor = await monitorArgs(gitPath, cwd);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const stop = () => stopGit(child);
    const child = execFile(
      gitPath,
      [...(runsHooks ? [] : gitConfigArgs), ...monitor, ...args],
      {
        cwd,
        env: { ...(runsHooks ? hooksEnv() : gitEnv(pathspecMagic)), ...env },
        maxBuffer: maxOutput,
        windowsHide: true,
        encoding: 'buffer',
      },
      (error, stdout, stderr) => {
        signal?.removeEventListener('abort', stop);
        if (signal?.aborted) {
          reject(signal.reason);
        } else if (error && !exitedWith(error, okExitCodes)) {
          const said = stderr.toString('utf8');
          reject(
            Object.assign(
              new Error(
                strings.errors.gitFailed(args.join(' '), said || error.message),
              ),
              { stderr: said.trim() },
            ),
          );
        } else {
          resolve(stdout);
        }
      },
    );
    signal?.addEventListener('abort', stop, { once: true });
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(input);
  });
}

export function stopGit(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  if (process.platform === 'win32' && child.pid !== undefined) {
    execFile(
      join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
      ['/pid', String(child.pid), '/t', '/f'],
      { windowsHide: true },
      () => undefined,
    );
  } else {
    child.kill();
  }
}

export function exitedWith(
  error: { readonly code?: number | string | null },
  okExitCodes: readonly number[],
): boolean {
  return typeof error.code === 'number' && okExitCodes.includes(error.code);
}

export function splitNul(output: string): string[] {
  return output.split('\0');
}
