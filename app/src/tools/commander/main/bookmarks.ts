import * as path from 'node:path';
import { folderKey } from '../shared/paths';

export interface BookmarkSystem {
  readonly paths: path.PlatformPath;
  readonly platform: string;
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

const wholeWindowsPath = /^(?:[a-z]:[\\/]|[\\/]{2}[^\\/])/i;

function wholePathOf(
  bookmark: string,
  { paths }: BookmarkSystem,
): string | undefined {
  const whole =
    paths.sep === '\\'
      ? wholeWindowsPath.test(bookmark)
      : bookmark.startsWith('/');
  return whole ? paths.resolve(bookmark) : undefined;
}

function keyOf(bookmark: string, system: BookmarkSystem): string | undefined {
  const whole = wholePathOf(bookmark, system);
  return whole === undefined ? undefined : folderKey(whole, system.platform);
}

function byLetters(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

export function shownBookmarks(
  stored: readonly string[],
  system: BookmarkSystem,
): string[] {
  const shown = new Map<string, string>();
  for (const bookmark of stored) {
    const whole = wholePathOf(bookmark, system);
    if (whole !== undefined) {
      const key = folderKey(whole, system.platform);
      if (!shown.has(key)) {
        shown.set(key, whole);
      }
    }
  }
  return [...shown.values()].toSorted(byLetters);
}

export function withBookmark(
  stored: readonly string[],
  folder: string,
  system: BookmarkSystem,
): readonly string[] {
  const key = keyOf(folder, system);
  return key === undefined ||
    stored.some((bookmark) => keyOf(bookmark, system) === key)
    ? stored
    : [...stored, folder];
}

export function withoutBookmark(
  stored: readonly string[],
  folder: string,
  system: BookmarkSystem,
): readonly string[] {
  const key = keyOf(folder, system);
  const kept = stored.filter(
    (bookmark) => key === undefined || keyOf(bookmark, system) !== key,
  );
  return kept.length === stored.length ? stored : kept;
}
