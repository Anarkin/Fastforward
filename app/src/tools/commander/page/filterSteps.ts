import { stepMatch, type MatchesFound } from '../../../lib/shared/textMatches';
import type { Row } from './listing';

export type FilterMove = 'up' | 'down' | 'pageUp' | 'pageDown';

export function filterStep(
  move: FilterMove,
  from: number,
  count: number,
  page: number,
): number {
  const by =
    move === 'up' ? -1 : move === 'down' ? 1 : move === 'pageUp' ? -page : page;
  return Math.max(0, Math.min(count - 1, from + by));
}

export function keptFiles(
  rows: readonly Row[],
  selected: string | undefined,
): MatchesFound {
  const files = rows.filter((row) => row.entry !== undefined);
  return {
    current: files.findIndex((row) => row.key === selected),
    matches: files.length,
  };
}

export function steppedFile(
  rows: readonly Row[],
  selected: string | undefined,
  step: 1 | -1,
): string | undefined {
  const files = rows.filter((row) => row.entry !== undefined);
  const at = files.findIndex((row) => row.key === selected);
  const next =
    at === -1
      ? step === 1
        ? 0
        : files.length - 1
      : stepMatch(at, files.length, step);
  return files.at(next)?.key;
}
