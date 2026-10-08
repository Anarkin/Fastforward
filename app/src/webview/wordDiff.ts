import { changeBlocks, type ChangeBlock, type DiffFile } from './diff';
import { keyedLine, type FindRange } from './find';
import { changePairs, tokenSteps } from './pairing';

const maxTokens = 1_000_000;

const tokenPattern = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;

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

export function pairWordRanges(
  removed: string,
  added: string,
): { readonly removed: FindRange[]; readonly added: FindRange[] } | undefined {
  if (!fewEnoughTokens(removed, added)) {
    return undefined;
  }
  const before = tokensOf(removed);
  const after = tokensOf(added);
  const changed = changedTokens(
    before.map((token) => token.text),
    after.map((token) => token.text),
  );
  if (
    !before.some(
      (token, index) => !changed.a[index] && !/^\s+$/.test(token.text),
    )
  ) {
    return undefined;
  }
  return {
    removed: changedRanges(before, changed.a),
    added: changedRanges(after, changed.b),
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

const rangesOfChange = new WeakMap<Change, ReadonlyMap<number, LineWords>>();

function changeRanges(change: Change): ReadonlyMap<number, LineWords> {
  let ranges = rangesOfChange.get(change);
  if (!ranges) {
    const byLine = new Map<number, LineWords>();
    for (const [left, right] of changePairs(change)) {
      const removed = left === undefined ? undefined : change.removed[left];
      const added = right === undefined ? undefined : change.added[right];
      const found =
        removed && added
          ? pairWordRanges(removed.line.text, added.line.text)
          : undefined;
      if (removed) {
        byLine.set(removed.index, found?.removed ?? 'whole');
      }
      if (added) {
        byLine.set(added.index, found?.added ?? 'whole');
      }
    }
    ranges = byLine;
    rangesOfChange.set(change, ranges);
  }
  return ranges;
}

export type WordRanges = Pick<ReadonlyMap<string, LineWords>, 'get'>;

export function wordRanges(files: readonly DiffFile[]): WordRanges {
  return {
    get: (key) => {
      const [file, line] = keyedLine(key);
      const diffFile = files.at(file);
      const change = diffFile && lineChanges(diffFile).get(line);
      return change && changeRanges(change).get(line);
    },
  };
}
