import type { ChildProcess } from 'node:child_process';
import { fsPromises } from '../../../lib/main/files';
import { join } from 'node:path';
import { commonDirOf, gitDirOf } from './gitDir';
import { processHolderAt } from './processHold';
import { stopTree } from './processTree';
import { GitChild, koffiOnWindows } from './spawnedGit';

interface Write {
  readonly cwd: string;
  readonly since: number;
}

const running = new Map<GitChild, Promise<void>>();
const writing = new Map<GitChild, Write>();
export const writingRefs = new Map<GitChild, Write>();
const writeTime = 30_000;
let writesDeadline: number | undefined;

export function keptRunning(child: GitChild, write?: Write): GitChild {
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

export async function stopEveryGit(waitTime = writeTime): Promise<void> {
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
      (
        await fsPromises
          .readdir(join(common, folder), { recursive: true })
          .catch(() => [])
      )
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
  const locked = await fsPromises.lstat(lock).catch(() => undefined);
  if (locked !== undefined && locked.mtimeMs >= since - 1000) {
    await fsPromises
      .rm(lock, { force: true, maxRetries: 10 })
      .catch(() => undefined);
  }
}

type StoppableGit =
  | GitChild
  | Pick<
      ChildProcess,
      'pid' | 'exitCode' | 'signalCode' | 'stdout' | 'stderr' | 'kill'
    >;

export const stopping = new Map<StoppableGit, Promise<void>>();

const held = processHolderAt(koffiOnWindows());

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
  await (child instanceof GitChild
    ? child.stop()
    : stopTree(child, platform, held));
  if (refsLeft !== undefined && platform === 'win32') {
    await removeRefLocks(refsLeft);
  }
}
