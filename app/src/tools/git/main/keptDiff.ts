import { randomBytes } from 'node:crypto';
import type { FileChange } from '../shared/protocol';
import { isFullHash } from '../../../lib/shared/hashes';
import { keptFirstParent } from './objects';
import { strings } from '../../../lib/shared/strings';
import { StoppedReading, type GitOutput } from './gitOutput';
import { keptGits } from './run';
import {
  diffArgs,
  diffOptionArgs,
  listArgs,
  type PatchScope,
} from '../../../lib/main/diffArgs';
import { PatchBudget, type ReadPatch } from './patchBudget';
import { parseChanges } from './rawChanges';

const keptMarkerText = `\u0001fastforward-diff-tree ${randomBytes(16).toString('hex')} `;

const keptMarker = Buffer.from(keptMarkerText, 'latin1');

const keptDiffArgs = [
  'diff-tree',
  '--stdin',
  '--always',
  '--root',
  '-r',
  '--diff-merges=first-parent',
  '-M',
  ...diffArgs,
  `--format=${keptMarkerText.replace('\u0001', '%x01')}%H`,
];

const keptRequest = (hash: string, parent: string) =>
  `${hash} ${parent}\n${hash} ${hash}\n`;

async function keptDiff<T>(
  gitPath: string,
  cwd: string,
  hash: string,
  args: readonly string[],
  read: (output: GitOutput) => Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T | 'stopped' | undefined> {
  if (!isFullHash(hash)) {
    return undefined;
  }
  const parent = await keptFirstParent(gitPath, cwd, hash, signal);
  if (parent === undefined) {
    return undefined;
  }
  signal?.throwIfAborted();
  const git = await keptGits.use(gitPath, cwd, [...keptDiffArgs, ...args]);
  return git
    ?.request(keptRequest(hash, parent), read, { signal, timeout: false })
    .catch((error: unknown) => {
      signal?.throwIfAborted();
      return error instanceof StoppedReading ? 'stopped' : undefined;
    });
}

async function readKeptAnswer(
  output: GitOutput,
  hash: string,
  end: number,
  onPart: (part: Buffer) => boolean,
): Promise<void> {
  const header = (await output.until(end)).toString('latin1');
  if (header !== `${keptMarkerText}${hash}`) {
    throw new Error(strings.errors.keptGitOutOfStep);
  }
  while ((await output.peek(1))[0] === 0x0a) {
    await output.take(1);
  }
  const follows = (await output.peek(1))[0] !== keptMarker[0];
  if (follows) {
    await output.streamUntil(
      Buffer.concat([Buffer.from([end]), keptMarker]),
      onPart,
    );
    onPart(Buffer.from([end]));
  }
  const ending = (await output.until(end)).toString('latin1');
  if (ending !== (follows ? hash : `${keptMarkerText}${hash}`)) {
    throw new Error(strings.errors.keptGitOutOfStep);
  }
}

export async function keptFiles(
  gitPath: string,
  cwd: string,
  hash: string,
  signal: AbortSignal | undefined,
): Promise<FileChange[] | undefined> {
  const read = await keptDiff(
    gitPath,
    cwd,
    hash,
    listArgs,
    async (output) => {
      const parts: Buffer[] = [];
      await readKeptAnswer(output, hash, 0, (part) => {
        parts.push(part);
        return false;
      });
      return parseChanges(Buffer.concat(parts).toString('utf8'));
    },
    signal,
  );
  return read === 'stopped' ? undefined : read;
}

export async function keptPatch(
  gitPath: string,
  cwd: string,
  hash: string,
  scope: PatchScope,
  signal: AbortSignal | undefined,
): Promise<ReadPatch | undefined> {
  const budget = new PatchBudget();
  const read = await keptDiff(
    gitPath,
    cwd,
    hash,
    ['--patch', ...diffOptionArgs(scope)],
    async (output) => {
      await readKeptAnswer(output, hash, 0x0a, (part) => budget.add(part));
      return 'read';
    },
    signal,
  );
  return read === undefined
    ? undefined
    : { ...budget.end(), exited: Promise.resolve() };
}
