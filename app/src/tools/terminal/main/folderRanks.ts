import { isObject } from '../../../shell/main/settings';
import { sameRoot } from '../../../shell/main/storage';

export interface FolderVisits {
  readonly folder: string;
  readonly visits: number;
  readonly last: number;
}

const hour = 3_600_000;
const day = 24 * hour;
const week = 7 * day;
const maxVisits = 1000;
const aging = 0.9;

function weightOf(age: number): number {
  if (age < hour) {
    return 4;
  }
  if (age < day) {
    return 2;
  }
  return age < week ? 0.5 : 0.25;
}

export function rankedFolders(
  entries: readonly FolderVisits[],
  now: number,
): string[] {
  return entries
    .map(({ folder, visits, last }) => ({
      folder,
      rank: visits * weightOf(now - last),
    }))
    .toSorted((a, b) => b.rank - a.rank)
    .map(({ folder }) => folder);
}

export function withVisit(
  entries: readonly FolderVisits[],
  folder: string,
  now: number,
): FolderVisits[] {
  const known = entries.find((entry) => sameRoot(entry.folder, folder));
  const visited = [
    { folder, visits: (known?.visits ?? 0) + 1, last: now },
    ...entries.filter((entry) => entry !== known),
  ];
  const total = visited.reduce((sum, entry) => sum + entry.visits, 0);
  return total > maxVisits
    ? visited
        .map((entry) => ({ ...entry, visits: entry.visits * aging }))
        .filter((entry) => entry.visits >= 1)
    : visited;
}

export function visitsIn(value: unknown): FolderVisits[] {
  return Array.isArray(value)
    ? value.flatMap((entry: unknown) =>
        isObject(entry) &&
        typeof entry.folder === 'string' &&
        typeof entry.visits === 'number' &&
        Number.isFinite(entry.visits) &&
        typeof entry.last === 'number' &&
        Number.isFinite(entry.last)
          ? [{ folder: entry.folder, visits: entry.visits, last: entry.last }]
          : [],
      )
    : [];
}
