import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, readdir, rm } from 'node:fs/promises';
import { join, win32 } from 'node:path';
import type { Readable } from 'node:stream';
import { strings } from '../../../../shared/strings';
import { withoutCredentials } from './credentials';
import { commonDirOf, gitDirOf } from './gitDir';
import { stopTree } from './gitSpawner';
import { KeptGits } from './keptGit';
import { GitChild, spawnGit } from './spawnedGit';

const unnamedBareRefused = ['-c', 'safe.bareRepository=explicit'];

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
  'diff.context=3',
  '-c',
  'diff.interHunkContext=0',
  '-c',
  'diff.indentHeuristic=true',
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
  'GIT_NAMESPACE',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_QUARANTINE_PATH',
  'GIT_SHALLOW_FILE',
];

const ofTheLauncher =
  /^GIT_(?:CONFIG_(?:PARAMETERS|COUNT|KEY_\d+|VALUE_\d+)|EXEC_PATH|REFLOG_ACTION)$/;

const askpassOfVsCode = /^VSCODE_GIT_(?:ASKPASS_|IPC_)/;

function inheritedEnv(): NodeJS.ProcessEnv {
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

function userCodeEnv(): NodeJS.ProcessEnv {
  return { ...inheritedEnv(), GIT_TERMINAL_PROMPT: '0', GIT_ADVICE: '0' };
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
    args = printedBy(
      spawnGit(
        command,
        [
          ...unnamedBareRefused,
          'config',
          '--type=bool',
          '--get',
          'core.fsmonitor',
        ],
        {
          cwd,
          env: { ...gitEnv(), ...env },
          detached: gitProcessOptions().detached,
        },
      ),
    ).then((printed) => ['-c', `core.fsmonitor=${printed?.trim() === 'true'}`]);
    monitors.set(key, args);
  }
  return args;
}

function printedBy(child: GitChild): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
  child.stderr.resume();
  child.stdin.end();
  return new Promise((resolve) => {
    child.on('error', () => resolve(undefined));
    child.on('close', (code) =>
      resolve(code === 0 ? Buffer.concat(chunks).toString('utf8') : undefined),
    );
  });
}

interface RunOptions {
  readonly okExitCodes?: readonly number[];
  readonly input?: string;
  readonly pathspecMagic?: boolean;
  readonly signal?: AbortSignal;
  readonly env?: NodeJS.ProcessEnv;
  readonly runsUserCode?: boolean;
  readonly readsNoRepository?: boolean;
  readonly writes?: boolean;
  readonly writesRefs?: boolean;
  readonly onOutput?: (chunk: Buffer) => void;
  readonly onErrorOutput?: (chunk: Buffer) => void;
  readonly onActivity?: () => void;
  readonly progress?: boolean;
  readonly unbounded?: boolean;
}

const maxOutput = 256 * 1024 * 1024;

const progressLine = /\d+% \(\d+\/\d+\)|^(remote: )?[^:]+: \d+, [^,]+\.$/;

function withoutProgress(said: string): string {
  return said
    .split(/\r?\n/)
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
  const monitor = options.readsNoRepository
    ? []
    : await monitorArgs(gitPath, cwd);
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

export async function startGit(
  gitPath: string,
  cwd: string,
  args: readonly string[],
): Promise<GitChild> {
  const monitor = await monitorArgs(gitPath, cwd);
  const started = gitCommand(gitPath);
  return keptRunning(
    spawnGit(
      started.command,
      [...unnamedBareRefused, ...gitConfigArgs, ...monitor, ...args],
      {
        cwd,
        env: { ...gitEnv(), ...started.env, GIT_FLUSH: '1' },
        detached: gitProcessOptions().detached,
      },
    ),
  );
}

let keepingGitRunning = () => false;

export function keepGitRunningWhile(enabled: () => boolean): void {
  keepingGitRunning = enabled;
}

export const keptGits = new KeptGits(startGit, () => keepingGitRunning());

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
    writesRefs = false,
    onOutput,
    onErrorOutput,
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
      spawnGit(
        started.command,
        [
          ...unnamedBareRefused,
          ...(runsUserCode ? [] : gitConfigArgs),
          ...monitor,
          ...args,
        ],
        {
          cwd,
          env: {
            ...(runsUserCode ? userCodeEnv() : gitEnv(pathspecMagic)),
            ...started.env,
            ...env,
          },
          detached: gitProcessOptions().detached,
        },
      ),
      writes ? { cwd, since: Date.now() } : undefined,
    );
    if (writesRefs) {
      writingRefs.set(child, { cwd, since: Date.now() });
      child.once('close', () => writingRefs.delete(child));
    }
    const stop = () => void stopGit(child);
    const fail = (reason: unknown) => {
      const stopped = stopping.get(child);
      if (stopped === undefined) {
        reject(reason);
      } else {
        void stopped.then(() => reject(reason));
      }
    };
    let tooLarge = false;
    let printed = false;
    const collect = (
      stream: Readable,
      take?: (chunk: Buffer) => void,
      peek?: (chunk: Buffer) => void,
    ) => {
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        printed = true;
        onActivity?.();
        peek?.(chunk);
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
    const stderr = collect(child.stderr, undefined, onErrorOutput);
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
        fail(signal.reason);
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
      const said = withoutCredentials(
        progress ? withoutProgress(printedErrors) : printedErrors,
      );
      const stopped = tooLarge || stoppedBy !== null;
      const command = withoutCredentials(args.join(' '));
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
      fail(
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

function closeOutputHeldPastExit(child: GitChild): void {
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

const running = new Map<GitChild, Promise<void>>();
const writing = new Map<GitChild, Write>();
const writingRefs = new Map<GitChild, Write>();
const writeTime = 30_000;
let writesDeadline: number | undefined;

function keptRunning(child: GitChild, write?: Write): GitChild {
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
  keptGits.stopAll();
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
  const gitDir = await gitDirOf(cwd);
  if (gitDir !== undefined) {
    await removeLockSince(join(gitDir, 'index.lock'), since);
  }
}

const refsLockedIn = ['refs', 'reftable'];

const lockedBesideRefs = ['packed-refs.lock', 'shallow.lock', 'config.lock'];

async function removeRefLocks({ cwd, since }: Write): Promise<void> {
  const gitDir = await gitDirOf(cwd);
  if (gitDir === undefined) {
    return;
  }
  const common = await commonDirOf(gitDir);
  const inFolders = await Promise.all(
    refsLockedIn.map(async (folder) =>
      (await readdir(join(common, folder), { recursive: true }).catch(() => []))
        .filter((entry) => entry.endsWith('.lock'))
        .map((entry) => join(common, folder, entry)),
    ),
  );
  await Promise.all(
    [
      ...lockedBesideRefs.map((lock) => join(common, lock)),
      ...inFolders.flat(),
    ].map((lock) => removeLockSince(lock, since)),
  );
}

async function removeLockSince(lock: string, since: number): Promise<void> {
  const locked = await lstat(lock).catch(() => undefined);
  if (locked !== undefined && locked.mtimeMs >= since - 1000) {
    await rm(lock, { force: true, maxRetries: 10 }).catch(() => undefined);
  }
}

type StoppableGit =
  | GitChild
  | Pick<
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
  const refsLeft =
    child instanceof GitChild &&
    child.exitCode === null &&
    child.signalCode === null
      ? writingRefs.get(child)
      : undefined;
  child.stdout?.destroy();
  child.stderr?.destroy();
  await (child instanceof GitChild ? child.stop() : stopTree(child, platform));
  if (refsLeft !== undefined && platform === 'win32') {
    await removeRefLocks(refsLeft);
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
