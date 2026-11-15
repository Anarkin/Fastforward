import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileChange } from '../shared/protocol';
import { stampOf } from './fileStamps';
import { gitQuoted } from './patchText';
import { isNullId, type RawChange } from './rawChanges';
import { runGit } from './run';

export async function withoutTouched(
  gitPath: string,
  cwd: string,
  changes: readonly RawChange[],
  reverse = false,
): Promise<FileChange[]> {
  const touched = await touchedChanges(gitPath, cwd, changes, reverse, true);
  return changes
    .filter((change) => !touched.has(change))
    .map(({ file }) => file);
}

export async function touchedChanges(
  gitPath: string,
  cwd: string,
  changes: readonly RawChange[],
  reverse: boolean,
  counted: boolean,
): Promise<ReadonlySet<RawChange>> {
  const unread = changes.filter(
    ({ oldMode, newMode, oldId, newId, file }) =>
      file.status === 'M' &&
      newMode === oldMode &&
      newMode.startsWith('100') &&
      isNullId(reverse ? oldId : newId),
  );
  const suspects = unread.flatMap((change) =>
    !counted ||
    (change.linesCounted &&
      change.file.insertions + change.file.deletions === 0)
      ? [
          {
            change,
            path: change.file.path,
            object: reverse ? change.newId : change.oldId,
          },
        ]
      : [],
  );
  const hashes =
    suspects.length === 0
      ? []
      : await fileHashes.of(
          gitPath,
          cwd,
          suspects.map(({ path }) => path),
        );
  return new Set([
    ...unread.filter(({ linesCounted }) => counted && !linesCounted),
    ...suspects
      .filter(({ object }, index) => hashes[index] === object)
      .map(({ change }) => change),
  ]);
}

type Hasher = (
  gitPath: string,
  cwd: string,
  files: readonly string[],
) => Promise<readonly string[]>;

const hashObjects: Hasher = (gitPath, cwd, files) =>
  runGit(gitPath, cwd, ['hash-object', '--stdin-paths'], {
    input: files.map((file) => `${gitQuoted(file)}\n`).join(''),
  }).then(
    (output) => output.split('\n'),
    () => [],
  );

export class FileHashes {
  private readonly known = new Map<
    string,
    { readonly stamp: string; readonly hash: string }
  >();

  constructor(
    private readonly maxFiles: number,
    private readonly hash: Hasher = hashObjects,
  ) {}

  async of(
    gitPath: string,
    cwd: string,
    files: readonly string[],
  ): Promise<(string | undefined)[]> {
    const stamps = await Promise.all(
      files.map((file) =>
        lstat(join(cwd, file)).then(
          (stats) => stampOf(stats, false),
          () => undefined,
        ),
      ),
    );
    const keys = files.map((file) => join(cwd, file));
    const unknown = files.flatMap((_, index) => {
      const stamp = stamps[index];
      return stamp !== undefined && this.known.get(keys[index])?.stamp !== stamp
        ? [index]
        : [];
    });
    const hashed =
      unknown.length === 0
        ? []
        : await this.hash(
            gitPath,
            cwd,
            unknown.map((index) => files[index]),
          );
    const fresh = new Map(unknown.map((index, at) => [index, hashed[at]]));
    const hashes = files.map((_, index) => {
      if (fresh.has(index)) {
        return fresh.get(index) || undefined;
      }
      const known = this.known.get(keys[index]);
      return known?.stamp === stamps[index] ? known?.hash : undefined;
    });
    for (const [index, hash] of hashes.entries()) {
      const stamp = stamps[index];
      if (hash !== undefined && stamp !== undefined) {
        this.known.delete(keys[index]);
        this.known.set(keys[index], { stamp, hash });
      }
    }
    for (const oldest of this.known.keys()) {
      if (this.known.size <= Math.max(this.maxFiles, files.length)) {
        break;
      }
      this.known.delete(oldest);
    }
    return hashes;
  }
}

const fileHashes = new FileHashes(10_000);
