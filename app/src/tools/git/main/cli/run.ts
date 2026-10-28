import {
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
  execFile,
  spawn,
} from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, readFile, rm } from 'node:fs/promises';
import { isAbsolute, join, win32 } from 'node:path';
import type { Readable } from 'node:stream';
import { strings } from '../../../../shared/strings';

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

function userCodeEnv(): NodeJS.ProcessEnv {
  return { ...inheritedEnv(), GIT_TERMINAL_PROMPT: '0' };
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

function gitCommand(gitPath: string): GitCommand {
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
  readonly runsUserCode?: boolean;
  readonly writes?: boolean;
  readonly onOutput?: (chunk: Buffer) => void;
  readonly onActivity?: () => void;
  readonly progress?: boolean;
  readonly unbounded?: boolean;
}

const maxOutput = 256 * 1024 * 1024;

const progressLine = /\d+% \(\d+\/\d+\)|^(remote: )?[^:]+: \d+, [^,]+\.$/;

function withoutProgress(said: string): string {
  return said
    .split('\n')
    .map((line) => line.slice(line.lastIndexOf('\r') + 1).trimEnd())
    .filter((line) => !progressLine.test(line))
    .join('\n')
    .trim();
}

const quietTimeBeforeClosingOutput = 200;

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
  options: RunOptions = {},
): Promise<Buffer> {
  options.signal?.throwIfAborted();
  const monitor = await monitorArgs(gitPath, cwd);
  for (let attempt = 1; ; attempt++) {
    const ran = await runGitOnce(
      gitPath,
      cwd,
      monitor,
      args,
      options,
      attempt < startAttempts,
    );
    if (ran !== notStarted) {
      return ran;
    }
  }
}

const processNotInitialized = 0xc0000142;
const startAttempts = 3;
const notStarted = Symbol('notStarted');

function runGitOnce(
  gitPath: string,
  cwd: string,
  monitor: readonly string[],
  args: readonly string[],
  {
    okExitCodes = [0],
    input,
    pathspecMagic,
    signal,
    env,
    runsUserCode = false,
    writes = false,
    onOutput,
    onActivity,
    progress = false,
    unbounded = false,
  }: RunOptions,
  startsAgain: boolean,
): Promise<Buffer | typeof notStarted> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const started = gitCommand(gitPath);
    const child = keptRunning(
      spawn(
        started.command,
        [...(runsUserCode ? [] : gitConfigArgs), ...monitor, ...args],
        {
          cwd,
          env: {
            ...(runsUserCode ? userCodeEnv() : gitEnv(pathspecMagic)),
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
    let printed = false;
    const collect = (stream: Readable, take?: (chunk: Buffer) => void) => {
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        printed = true;
        onActivity?.();
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
      if (startsAgain && code === processNotInitialized && !printed) {
        resolve(notStarted);
        return;
      }
      const printedErrors = Buffer.concat(stderr).toString('utf8').trim();
      const said = progress ? withoutProgress(printedErrors) : printedErrors;
      const stopped = tooLarge || stoppedBy !== null;
      const command = args.join(' ');
      const reason = error
        ? strings.errors.gitFailed(command, error.message)
        : tooLarge
          ? strings.errors.gitOutputTooLarge(command, maxOutput / 1024 / 1024)
          : stoppedBy !== null
            ? strings.errors.gitStoppedBy(command, stoppedBy)
            : strings.errors.gitExited(command, code);
      const message = !said
        ? reason
        : stopped
          ? `${reason}\n${said}`
          : strings.errors.gitFailed(command, said);
      reject(
        Object.assign(new Error(message), { stderr: stopped ? message : said }),
      );
    };
    child.on('error', (error) => settle(null, null, error));
    child.on('close', (code, stoppedBy) => settle(code, stoppedBy));
    child.on('exit', () => closeOutputHeldPastExit(child));
    signal?.addEventListener('abort', stop, { once: true });
    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
  });
}

function closeOutputHeldPastExit(child: ChildProcessWithoutNullStreams): void {
  let closing: NodeJS.Timeout | undefined;
  const closeOnceQuiet = () => {
    clearTimeout(closing);
    closing = setTimeout(() => {
      child.stdout.destroy();
      child.stderr.destroy();
    }, quietTimeBeforeClosingOutput);
  };
  child.stdout.on('data', closeOnceQuiet);
  child.stderr.on('data', closeOnceQuiet);
  child.once('close', () => clearTimeout(closing));
  closeOnceQuiet();
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
let writesDeadline: number | undefined;

function keptRunning<T extends ChildProcess>(child: T, write?: Write): T {
  running.set(
    child,
    new Promise((resolve) => {
      const done = () => {
        running.delete(child);
        if (writing.delete(child) && writing.size === 0) {
          writesDeadline = undefined;
        }
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
  if (writing.size === 0) {
    return;
  }
  const deadline = Math.min(
    writesDeadline ?? Infinity,
    performance.now() + waitTime,
  );
  writesDeadline = deadline;
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(
      () => resolve('late'),
      Math.max(0, deadline - performance.now()),
    ).unref();
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
  await Promise.all(stopping.values());
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

type StoppableGit = Pick<
  ChildProcess,
  'pid' | 'exitCode' | 'signalCode' | 'stdout' | 'stderr' | 'kill'
>;

const stopping = new Map<StoppableGit, Promise<void>>();

export function stopGit(
  child: StoppableGit,
  platform = process.platform,
): Promise<void> {
  let stopped = stopping.get(child);
  if (stopped === undefined) {
    stopped = endGit(child, platform).finally(() => stopping.delete(child));
    stopping.set(child, stopped);
  }
  return stopped;
}

async function endGit(
  child: StoppableGit,
  platform: NodeJS.Platform,
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
