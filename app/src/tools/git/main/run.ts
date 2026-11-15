import type { Readable } from 'node:stream';
import { strings } from '../../../lib/shared/strings';
import { withoutCredentials } from './credentials';
import { monitorArgs } from './fsMonitor';
import {
  gitCommand,
  gitEnv,
  gitProcessOptions,
  unnamedBareRefused,
  userCodeEnv,
} from './gitCommand';
import {
  keptRunning,
  stopEveryGit,
  stopGit,
  stopping,
  writingRefs,
} from './gitProcesses';
import { KeptGits } from './keptGit';
import { spawnGit, type GitChild } from './spawnedGit';

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

export async function stopRunningGit(waitTime?: number): Promise<void> {
  keptGits.stopAll();
  await stopEveryGit(waitTime);
}

export function exitedWith(
  error: { readonly code?: number | string | null },
  okExitCodes: readonly number[],
): boolean {
  return typeof error.code === 'number' && okExitCodes.includes(error.code);
}
