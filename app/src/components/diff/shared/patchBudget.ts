import type { FileChange } from '../../../lib/shared/changes';
import type { LeftOut } from './diffProtocol';

export const collapseThreshold = 25_000;

export function isLargeChange(file: {
  readonly insertions: number;
  readonly deletions: number;
  readonly uncounted?: boolean;
}): boolean {
  return (
    file.uncounted === true ||
    file.insertions + file.deletions > collapseThreshold
  );
}

export const patchLineBudget = 25_000;

export const patchByteBudget = 16 * 1024 * 1024;

export const patchPathBudget = 16_000;

export function deferredChanges(
  files: readonly FileChange[],
): ReadonlySet<string> {
  const deferred = new Set<string>();
  let lines = 0;
  let paths = 0;
  let bytes = 0;
  let full = false;
  for (const file of files) {
    if (isLargeChange(file)) {
      deferred.add(file.path);
      continue;
    }
    lines += file.insertions + file.deletions;
    paths += file.path.length + (file.oldPath?.length ?? 0);
    bytes += file.bytes ?? 0;
    full ||=
      lines > patchLineBudget ||
      paths > patchPathBudget ||
      bytes > patchByteBudget;
    if (full) {
      deferred.add(file.path);
    }
  }
  return deferred;
}

export function includedChanges(
  files: readonly FileChange[],
): string[] | undefined {
  const deferred = deferredChanges(files);
  return deferred.size === 0
    ? undefined
    : files
        .filter((file) => !deferred.has(file.path))
        .flatMap((file) =>
          file.oldPath ? [file.oldPath, file.path] : [file.path],
        );
}

export function leftOutChanges(files: readonly FileChange[]): LeftOut[] {
  const deferred = deferredChanges(files);
  return files
    .filter((file) => deferred.has(file.path))
    .map((file) => ({
      path: file.path,
      lines: file.uncounted ? undefined : file.insertions + file.deletions,
    }));
}
