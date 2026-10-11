import {
  changeBlocks,
  type ChangeBlock,
  type DiffFile,
  type NumberedLine,
} from './diff';
import { keyedLine, type FindRange } from './find';
import { changePairs, tokenSteps } from './pairing';

const maxTokens = 1_000_000;

const tokenPattern =
  /[\p{L}\p{M}\p{N}_\u200c\u200d]+|\s+|\p{RI}{2}|[^\p{L}\p{M}\p{N}_\s][\p{M}\p{EMod}\u{e0020}-\u{e007f}]*(?:\u200d[^\p{L}\p{M}\p{N}_\s][\p{M}\p{EMod}\u{e0020}-\u{e007f}]*)*/gu;

export function tokenize(text: string): string[] {
  return text.match(tokenPattern) ?? [];
}

function fewEnoughTokens(removed: string, added: string): boolean {
  const nextRemoved = tokenSteps([removed], tokenPattern);
  const nextAdded = tokenSteps([added], tokenPattern);
  let a = 0;
  let b = 0;
  while (a * b <= maxTokens) {
    const removedOne = nextRemoved();
    const addedOne = nextAdded();
    if (!removedOne && !addedOne) {
      return true;
    }
    a += removedOne ? 1 : 0;
    b += addedOne ? 1 : 0;
  }
  return false;
}

interface Token {
  readonly text: string;
  readonly start: number;
}

function tokensOf(text: string): Token[] {
  let start = 0;
  return tokenize(text).map((token) => {
    const placed = { text: token, start };
    start += token.length;
    return placed;
  });
}

export function changedTokens(
  a: readonly string[],
  b: readonly string[],
): { readonly a: boolean[]; readonly b: boolean[] } {
  const rows = a.length + 1;
  const columns = b.length + 1;
  const common = new Uint32Array(rows * columns);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i * columns + j] =
        a[i] === b[j]
          ? common[(i + 1) * columns + j + 1] + 1
          : Math.max(
              common[(i + 1) * columns + j],
              common[i * columns + j + 1],
            );
    }
  }
  const changedA = a.map(() => true);
  const changedB = b.map(() => true);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      changedA[i] = false;
      changedB[j] = false;
      i++;
      j++;
    } else if (common[(i + 1) * columns + j] >= common[i * columns + j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return { a: changedA, b: changedB };
}

function changedRanges(
  tokens: readonly Token[],
  changed: readonly boolean[],
): FindRange[] {
  const ranges: FindRange[] = [];
  let running = false;
  tokens.forEach((token, index) => {
    if (/^\s+$/.test(token.text)) {
      return;
    }
    if (!changed[index]) {
      running = false;
      return;
    }
    const end = token.start + token.text.length;
    const last = ranges.at(-1);
    if (running && last) {
      ranges[ranges.length - 1] = { start: last.start, end };
    } else {
      ranges.push({ start: token.start, end });
    }
    running = true;
  });
  return ranges;
}

const blank = (token: Token) => /^\s+$/.test(token.text);

function insertedPlaces(
  tokens: readonly Token[],
  changed: readonly boolean[],
  other: readonly Token[],
  otherChanged: readonly boolean[],
): FindRange[] {
  const kept = tokens.flatMap((_, index) => (changed[index] ? [] : [index]));
  const otherKept = other.flatMap((_, index) =>
    otherChanged[index] ? [] : [index],
  );
  const hasWords = (
    side: readonly Token[],
    flags: readonly boolean[],
    from: number,
    to: number,
  ) =>
    side
      .slice(from + 1, to)
      .some((token, index) => flags[from + 1 + index] && !blank(token));
  const places: FindRange[] = [];
  for (let gap = 0; gap <= kept.length; gap++) {
    const from = gap === 0 ? -1 : kept[gap - 1];
    const to = kept.at(gap) ?? tokens.length;
    const otherFrom = gap === 0 ? -1 : otherKept[gap - 1];
    const otherTo = otherKept.at(gap) ?? other.length;
    if (
      !hasWords(tokens, changed, from, to) &&
      hasWords(other, otherChanged, otherFrom, otherTo)
    ) {
      const at =
        from === -1 ? 0 : tokens[from].start + tokens[from].text.length;
      places.push({ start: at, end: at });
    }
  }
  return places;
}

function markedRanges(
  tokens: readonly Token[],
  changed: readonly boolean[],
  other: readonly Token[],
  otherChanged: readonly boolean[],
): FindRange[] {
  return [
    ...changedRanges(tokens, changed),
    ...insertedPlaces(tokens, changed, other, otherChanged),
  ].toSorted((a, b) => a.start - b.start);
}

export function pairWordRanges(
  removed: string,
  added: string,
): { readonly removed: FindRange[]; readonly added: FindRange[] } | undefined {
  if (removed === '' || added === '' || !fewEnoughTokens(removed, added)) {
    return undefined;
  }
  const before = tokensOf(removed);
  const after = tokensOf(added);
  const changed = changedTokens(
    before.map((token) => token.text),
    after.map((token) => token.text),
  );
  if (!before.some((token, index) => !changed.a[index] && !blank(token))) {
    return undefined;
  }
  return {
    removed: markedRanges(before, changed.a, after, changed.b),
    added: markedRanges(after, changed.b, before, changed.a),
  };
}

export type LineWords = readonly FindRange[] | 'whole';

type Change = Extract<ChangeBlock, { kind: 'change' }>;

const changesOfFile = new WeakMap<DiffFile, ReadonlyMap<number, Change>>();

function lineChanges(file: DiffFile): ReadonlyMap<number, Change> {
  let changes = changesOfFile.get(file);
  if (!changes) {
    const byLine = new Map<number, Change>();
    for (const blocks of changeBlocks(file)) {
      for (const block of blocks) {
        if (block.kind === 'change') {
          for (const { index } of [...block.removed, ...block.added]) {
            byLine.set(index, block);
          }
        }
      }
    }
    changes = byLine;
    changesOfFile.set(file, changes);
  }
  return changes;
}

export interface Pair {
  readonly removed: NumberedLine | undefined;
  readonly added: NumberedLine | undefined;
}

const pairsOfChange = new WeakMap<Change, ReadonlyMap<number, Pair>>();

function linePairs(change: Change): ReadonlyMap<number, Pair> {
  let pairs = pairsOfChange.get(change);
  if (!pairs) {
    const byLine = new Map<number, Pair>();
    for (const [left, right] of changePairs(change)) {
      const pair = {
        removed: left === undefined ? undefined : change.removed[left],
        added: right === undefined ? undefined : change.added[right],
      };
      for (const side of [pair.removed, pair.added]) {
        if (side) {
          byLine.set(side.index, pair);
        }
      }
    }
    pairs = byLine;
    pairsOfChange.set(change, pairs);
  }
  return pairs;
}

interface PairRanges {
  readonly removed: LineWords;
  readonly added: LineWords;
}

const unpaired: PairRanges = { removed: 'whole', added: 'whole' };

const rangesOfPair = new WeakMap<
  NumberedLine,
  WeakMap<NumberedLine, PairRanges>
>();

function pairRanges({ removed, added }: Pair): PairRanges {
  if (!removed || !added) {
    return unpaired;
  }
  let withRemoved = rangesOfPair.get(removed);
  if (!withRemoved) {
    withRemoved = new WeakMap();
    rangesOfPair.set(removed, withRemoved);
  }
  let ranges = withRemoved.get(added);
  if (!ranges) {
    const found = pairWordRanges(removed.line.text, added.line.text);
    ranges = {
      removed: found?.removed ?? 'whole',
      added: found?.added ?? 'whole',
    };
    withRemoved.set(added, ranges);
  }
  return ranges;
}

export type WordRanges = Pick<ReadonlyMap<string, LineWords>, 'get'>;

export function wordRanges(
  files: readonly DiffFile[],
  laidOut?: ReadonlyMap<string, Pair>,
): WordRanges {
  return {
    get: (key) => {
      const [file, line] = keyedLine(key);
      let pair = laidOut?.get(key);
      if (!laidOut) {
        const diffFile = files.at(file);
        const change = diffFile && lineChanges(diffFile).get(line);
        pair = change && linePairs(change).get(line);
      }
      return (
        pair &&
        pairRanges(pair)[pair.removed?.index === line ? 'removed' : 'added']
      );
    },
  };
}
