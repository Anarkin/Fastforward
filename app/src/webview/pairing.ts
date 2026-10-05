import { tokenSteps, wordPattern } from './wordDiff';

export const similarEnough = 0.5;

const maxCells = 40_000;

const maxComparedWords = 1_000_000;

export type LinePair = readonly [number | undefined, number | undefined];

interface Words {
  readonly counts: ReadonlyMap<string, number>;
  readonly total: number;
}

function wordsOf(text: string): Words {
  const words = text.match(wordPattern) ?? [];
  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return { counts, total: words.length };
}

export function lineSimilarity(a: string, b: string): number {
  return wordSimilarity(wordsOf(a), wordsOf(b));
}

function wordSimilarity(before: Words, after: Words): number {
  if (before.total === 0 || after.total === 0) {
    return before.total === after.total ? similarEnough : 0;
  }
  const fewer =
    before.counts.size <= after.counts.size ? before.counts : after.counts;
  const more = fewer === before.counts ? after.counts : before.counts;
  let common = 0;
  for (const [word, count] of fewer) {
    common += Math.min(count, more.get(word) ?? 0);
  }
  return (2 * common) / (before.total + after.total);
}

function inOrder(
  removed: readonly number[],
  added: readonly number[],
): LinePair[] {
  return Array.from(
    { length: Math.max(removed.length, added.length) },
    (_, index): LinePair => [removed[index], added[index]],
  );
}

function fewEnoughWords(
  removed: readonly string[],
  added: readonly string[],
): boolean {
  let compared = 0;
  const count = (lines: readonly string[], comparisons: number) => {
    const next = tokenSteps(lines, wordPattern);
    while (next()) {
      compared += comparisons;
      if (compared > maxComparedWords) {
        return false;
      }
    }
    return true;
  };
  return count(removed, added.length) && count(added, removed.length);
}

const range = (length: number) => Array.from({ length }, (_, index) => index);

export function alignLines(
  removed: readonly string[],
  added: readonly string[],
): LinePair[] {
  const rows = removed.length;
  const columns = added.length;
  if (
    rows === 0 ||
    columns === 0 ||
    rows * columns > maxCells ||
    !fewEnoughWords(removed, added)
  ) {
    return inOrder(range(rows), range(columns));
  }
  const removedWords = removed.map(wordsOf);
  const addedWords = added.map(wordsOf);
  const similarity = removedWords.map((before) =>
    addedWords.map((after) => wordSimilarity(before, after)),
  );
  const best = Array.from({ length: rows + 1 }, () =>
    Array.from({ length: columns + 1 }, () => 0),
  );
  const pairs = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => false),
  );
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = columns - 1; j >= 0; j--) {
      const skip = Math.max(best[i + 1][j], best[i][j + 1]);
      const score = similarity[i][j];
      const paired = score >= similarEnough ? score + best[i + 1][j + 1] : -1;
      pairs[i][j] = paired >= skip;
      best[i][j] = Math.max(skip, paired);
    }
  }
  const aligned: LinePair[] = [];
  let gapRemoved: number[] = [];
  let gapAdded: number[] = [];
  const closeGap = () => {
    aligned.push(...inOrder(gapRemoved, gapAdded));
    gapRemoved = [];
    gapAdded = [];
  };
  let i = 0;
  let j = 0;
  while (i < rows && j < columns) {
    if (pairs[i][j]) {
      closeGap();
      aligned.push([i++, j++]);
    } else if (best[i + 1][j] >= best[i][j + 1]) {
      gapRemoved.push(i++);
    } else {
      gapAdded.push(j++);
    }
  }
  while (i < rows) {
    gapRemoved.push(i++);
  }
  while (j < columns) {
    gapAdded.push(j++);
  }
  closeGap();
  return aligned;
}
