import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
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
    const child = keptRunning(
      spawn(
        gitPath,
        [...(runsHooks ? [] : gitConfigArgs), ...monitor, ...args],
        {
          cwd,
          env: { ...(runsHooks ? hooksEnv() : gitEnv(pathspecMagic)), ...env },
          ...gitProcessOptions(),
        },
      ),
    );
    const stop = () => void stopGit(child);
    let tooLarge = false;
    const collect = (stream: Readable) => {
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxOutput) {
          tooLarge = true;
          stop();
        } else {
          chunks.push(chunk);
        }
      });
      return chunks;
    };
    const stdout = collect(child.stdout);
    const stderr = collect(child.stderr);
    let settled = false;
    const settle = (
      code: number | null,
      stoppedBy: NodeJS.Signals | null,
      error?: Error,
    ) => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener('abort', stop);
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      if (
        !error &&
        !tooLarge &&
        code !== null &&
        (code === 0 || exitedWith({ code }, okExitCodes))
      ) {
        resolve(Buffer.concat(stdout));
        return;
      }
      const said = Buffer.concat(stderr).toString('utf8');
      const reason =
        error?.message ??
        (tooLarge
          ? strings.errors.gitOutputTooLarge(maxOutput / 1024 / 1024)
          : stoppedBy !== null
            ? strings.errors.gitStoppedBy(stoppedBy)
            : strings.errors.gitExited(code));
      reject(
        Object.assign(
          new Error(strings.errors.gitFailed(args.join(' '), said || reason)),
          { stderr: said.trim() },
        ),
      );
    };
    child.on('error', (error) => settle(null, null, error));
    child.on('close', (code, stoppedBy) => settle(code, stoppedBy));
    signal?.addEventListener('abort', stop, { once: true });
    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
  });
}

export function gitProcessOptions(platform = process.platform): {
  readonly windowsHide: true;
  readonly detached: boolean;
} {
  return { windowsHide: true, detached: platform !== 'win32' };
}

const running = new Set<ChildProcess>();

export function keptRunning<T extends ChildProcess>(child: T): T {
  running.add(child);
  const done = () => running.delete(child);
  child.once('close', done);
  child.once('error', done);
  return child;
}

export async function stopRunningGit(): Promise<void> {
  await Promise.all([...running].map((child) => stopGit(child)));
}

export async function stopGit(
  child: Pick<
    ChildProcess,
    'pid' | 'exitCode' | 'signalCode' | 'stdout' | 'stderr' | 'kill'
  >,
  platform = process.platform,
): Promise<void> {
  child.stdout?.destroy();
  child.stderr?.destroy();
  if (
    child.exitCode !== null ||
    child.signalCode !== null ||
    child.pid === undefined
  ) {
    return;
  }
  const { pid } = child;
  if (platform === 'win32') {
    await new Promise((resolve) => {
      execFile(
        join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32',
          'taskkill.exe',
        ),
        ['/pid', String(pid), '/t', '/f'],
        { windowsHide: true },
        resolve,
      );
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
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
