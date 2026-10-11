import type { ChangeBlock } from './diff';

export const similarEnough = 0.5;

const maxCells = 40_000;

const maxComparedWords = 1_000_000;

export const sideBySideWords = 4_000_000;

export interface PairingBudget {
  words: number;
  spent: boolean;
}

export function pairingBudget(): PairingBudget {
  return { words: sideBySideWords, spent: false };
}

export type LinePair = readonly [number | undefined, number | undefined];

const wordPattern =
  /[\p{L}\p{M}\p{N}_\u200c\u200d]+|\p{RI}{2}|[^\p{L}\p{M}\p{N}_\s][\p{M}\p{EMod}\u{e0020}-\u{e007f}]*(?:\u200d[^\p{L}\p{M}\p{N}_\s][\p{M}\p{EMod}\u{e0020}-\u{e007f}]*)*/gu;

export function tokenSteps(
  lines: readonly string[],
  pattern: RegExp,
): () => boolean {
  const tokens = new RegExp(pattern);
  let line = 0;
  return () => {
    while (line < lines.length) {
      if (tokens.test(lines[line])) {
        return true;
      }
      line++;
    }
    return false;
  };
}

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

function comparedWords(
  removed: readonly string[],
  added: readonly string[],
): number | undefined {
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
  return count(removed, added.length) && count(added, removed.length)
    ? compared
    : undefined;
}

const range = (length: number) => Array.from({ length }, (_, index) => index);

export function alignLines(
  removed: readonly string[],
  added: readonly string[],
  budget?: PairingBudget,
): LinePair[] {
  return alignment(removed, added, budget).pairs;
}

function charged(budget: PairingBudget | undefined, words: number): boolean {
  if (!budget) {
    return true;
  }
  if (budget.spent || words > budget.words) {
    budget.spent = true;
    return false;
  }
  budget.words -= words;
  return true;
}

interface Aligned {
  readonly pairs: LinePair[];
  readonly words: number;
}

function alignment(
  removed: readonly string[],
  added: readonly string[],
  budget: PairingBudget | undefined,
): Aligned {
  const rows = removed.length;
  const columns = added.length;
  const compared =
    rows === 0 || columns === 0 || rows * columns > maxCells || budget?.spent
      ? undefined
      : comparedWords(removed, added);
  if (compared === undefined) {
    return { pairs: inOrder(range(rows), range(columns)), words: 0 };
  }
  if (!charged(budget, compared)) {
    return { pairs: inOrder(range(rows), range(columns)), words: compared };
  }
  return { pairs: similarPairs(removed, added), words: compared };
}

function similarPairs(
  removed: readonly string[],
  added: readonly string[],
): LinePair[] {
  const rows = removed.length;
  const columns = added.length;
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

type Change = Extract<ChangeBlock, { kind: 'change' }>;

const pairsOfChange = new WeakMap<Change, Aligned>();

export function changePairs(
  change: Change,
  budget?: PairingBudget,
): readonly LinePair[] {
  const known = pairsOfChange.get(change);
  if (known) {
    return charged(budget, known.words)
      ? known.pairs
      : inOrder(range(change.removed.length), range(change.added.length));
  }
  const made = alignment(
    change.removed.map(({ line }) => line.text),
    change.added.map(({ line }) => line.text),
    budget,
  );
  if (!budget?.spent) {
    pairsOfChange.set(change, made);
  }
  return made.pairs;
}
