import { tokenize } from './wordDiff';

export const similarEnough = 0.5;

const maxCells = 40_000;

export type LinePair = readonly [number | undefined, number | undefined];

function words(text: string): string[] {
  return tokenize(text).filter((token) => !/^\s+$/.test(token));
}

export function lineSimilarity(a: string, b: string): number {
  const before = words(a);
  const after = words(b);
  if (before.length === 0 || after.length === 0) {
    return before.length === after.length ? similarEnough : 0;
  }
  const counts = new Map<string, number>();
  for (const word of before) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  let common = 0;
  for (const word of after) {
    const left = counts.get(word) ?? 0;
    if (left > 0) {
      counts.set(word, left - 1);
      common++;
    }
  }
  return (2 * common) / (before.length + after.length);
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

const range = (length: number) => Array.from({ length }, (_, index) => index);

export function alignLines(
  removed: readonly string[],
  added: readonly string[],
): LinePair[] {
  const rows = removed.length;
  const columns = added.length;
  if (rows === 0 || columns === 0 || rows * columns > maxCells) {
    return inOrder(range(rows), range(columns));
  }
  const similarity = removed.map((before) =>
    added.map((after) => lineSimilarity(before, after)),
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
