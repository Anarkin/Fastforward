import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, readFile, rm } from 'node:fs/promises';
import { isAbsolute, join, win32 } from 'node:path';
import type { Readable } from 'node:stream';
import { strings } from '../shared/strings';

const gitConfigArgs = [
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
  '-c',
  'core.disambiguate=none',
];

const elsewhere = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_COMMON_DIR',
  'GIT_GLOB_PATHSPECS',
  'GIT_NOGLOB_PATHSPECS',
  'GIT_ICASE_PATHSPECS',
];

function inheritedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of elsewhere) {
    delete env[name];
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
    GIT_LITERAL_PATHSPECS: pathspecMagic ? '0' : '1',
  };
}

function hooksEnv(): NodeJS.ProcessEnv {
  return { ...inheritedEnv(), GIT_TERMINAL_PROMPT: '0' };
}

export interface GitCommand {
  readonly command: string;
  readonly env: NodeJS.ProcessEnv;
}

const msystems = ['ucrt64', 'clangarm64', 'mingw64', 'mingw32'];

// Git for Windows' launcher in its cmd folder only sets MSYSTEM and puts the
// real git's folders on the PATH before starting it, which costs a process
export function realGit(
  launcher: string,
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
  exists: (file: string) => boolean = existsSync,
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

function gitCommand(gitPath: string, runsHooks = false): GitCommand {
  if (runsHooks) {
    return { command: gitPath, env: {} };
  }
  let found = realGits.get(gitPath);
  if (found === undefined) {
    found = realGit(gitPath) ?? { command: gitPath, env: {} };
    realGits.set(gitPath, found);
  }
  return found;
}

const monitors = new Map<string, Promise<string[]>>();

function monitorArgs(gitPath: string, cwd: string): Promise<string[]> {
  const key = `${gitPath}\0${cwd}`;
  let args = monitors.get(key);
  if (args === undefined) {
    const { command, env } = gitCommand(gitPath);
    args = new Promise((resolve) => {
      execFile(
        command,
        ['config', '--type=bool', '--get', 'core.fsmonitor'],
        { cwd, env: { ...gitEnv(), ...env }, windowsHide: true },
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
  readonly writes?: boolean;
  readonly onOutput?: (chunk: Buffer) => void;
  readonly unbounded?: boolean;
}

const maxOutput = 256 * 1024 * 1024;
const drainTime = 200;

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
    writes = false,
    onOutput,
    unbounded = false,
  }: RunOptions = {},
): Promise<Buffer> {
  signal?.throwIfAborted();
  const monitor = await monitorArgs(gitPath, cwd);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const started = gitCommand(gitPath, runsHooks);
    const child = keptRunning(
      spawn(
        started.command,
        [...(runsHooks ? [] : gitConfigArgs), ...monitor, ...args],
        {
          cwd,
          env: {
            ...(runsHooks ? hooksEnv() : gitEnv(pathspecMagic)),
            ...started.env,
            ...env,
          },
          ...gitProcessOptions(),
        },
      ),
      writes ? { cwd, since: Date.now() } : undefined,
    );
    const stop = () => void stopGit(child);
    let tooLarge = false;
    const collect = (stream: Readable, take?: (chunk: Buffer) => void) => {
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (!unbounded && size > maxOutput) {
          tooLarge = true;
          stop();
        } else if (take) {
          take(chunk);
        } else {
          chunks.push(chunk);
        }
      });
      return chunks;
    };
    const stdout = collect(child.stdout, onOutput);
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
    child.on('exit', () => {
      // What a hook started in the background can hold the pipes open long
      // after git exits, so they are closed once they stop bringing output
      let quiet: NodeJS.Timeout | undefined;
      const wait = () => {
        clearTimeout(quiet);
        quiet = setTimeout(() => {
          child.stdout.destroy();
          child.stderr.destroy();
        }, drainTime);
      };
      child.stdout.on('data', wait);
      child.stderr.on('data', wait);
      child.once('close', () => clearTimeout(quiet));
      wait();
    });
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

interface Write {
  readonly cwd: string;
  readonly since: number;
}

const running = new Map<ChildProcess, Promise<void>>();
const writing = new Map<ChildProcess, Write>();
const writeTime = 30_000;

function keptRunning<T extends ChildProcess>(child: T, write?: Write): T {
  running.set(
    child,
    new Promise((resolve) => {
      const done = () => {
        running.delete(child);
        writing.delete(child);
        resolve();
      };
      child.once('close', done);
      child.once('error', done);
    }),
  );
  if (write) {
    writing.set(child, write);
  }
  return child;
}

export async function writesEnded(waitTime = writeTime): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), waitTime).unref();
  });
  try {
    while (writing.size > 0) {
      const ended = await Promise.race([
        Promise.all(
          [...writing.keys()].flatMap((child) => running.get(child) ?? []),
        ),
        late,
      ]);
      if (ended === 'late') {
        return;
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function stopRunningGit(waitTime = writeTime): Promise<void> {
  await Promise.all([
    writesEnded(waitTime),
    ...[...running.keys()]
      .filter((child) => !writing.has(child))
      .map((child) => stopGit(child)),
  ]);
  const unfinished = [...writing.values()];
  await Promise.all([...running.keys()].map((child) => stopGit(child)));
  if (process.platform === 'win32') {
    await Promise.all(unfinished.map(removeIndexLock));
  }
}

async function removeIndexLock({ cwd, since }: Write): Promise<void> {
  const dotGit = join(cwd, '.git');
  const stats = await lstat(dotGit).catch(() => undefined);
  const gitDir = stats?.isFile()
    ? /^gitdir: (.*)$/m
        .exec(await readFile(dotGit, 'utf8').catch(() => ''))?.[1]
        ?.trim()
    : dotGit;
  if (gitDir === undefined) {
    return;
  }
  const lock = join(
    isAbsolute(gitDir) ? gitDir : join(cwd, gitDir),
    'index.lock',
  );
  const locked = await lstat(lock).catch(() => undefined);
  if (locked !== undefined && locked.mtimeMs >= since - 1000) {
    await rm(lock, { force: true, maxRetries: 10 }).catch(() => undefined);
  }
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
