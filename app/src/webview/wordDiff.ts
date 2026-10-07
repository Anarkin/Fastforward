import {
  changeBlocks,
  type ChangeBlock,
  type DiffFile,
  type NumberedLine,
} from './diff';
import { keyedLine, type FindRange } from './find';

const maxTokens = 1_000_000;

const tokenPattern = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;

export const wordPattern = /[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]/gu;

export function tokenize(text: string): string[] {
  return text.match(tokenPattern) ?? [];
}

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

function fewEnoughTokens(
  removed: readonly string[],
  added: readonly string[],
): boolean {
  const nextRemoved = tokenSteps(removed, tokenPattern);
  const nextAdded = tokenSteps(added, tokenPattern);
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
  readonly line: number;
  readonly start: number;
}

function tokensOf(lines: readonly string[]): Token[] {
  return lines.flatMap((text, line) => {
    let start = 0;
    return tokenize(text).map((token) => {
      const placed = { text: token, line, start };
      start += token.length;
      return placed;
    });
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

function rangesByLine(
  tokens: readonly Token[],
  changed: readonly boolean[],
  lines: number,
): FindRange[][] {
  const ranges: FindRange[][] = Array.from({ length: lines }, () => []);
  let line = -1;
  let running = false;
  tokens.forEach((token, index) => {
    if (token.line !== line) {
      line = token.line;
      running = false;
    }
    if (/^\s+$/.test(token.text)) {
      return;
    }
    if (!changed[index]) {
      running = false;
      return;
    }
    const end = token.start + token.text.length;
    const current = ranges[line];
    const last = current.at(-1);
    if (running && last) {
      current[current.length - 1] = { start: last.start, end };
    } else {
      current.push({ start: token.start, end });
    }
    running = true;
  });
  return ranges;
}

export function blockWordRanges(
  removed: readonly string[],
  added: readonly string[],
):
  | { readonly removed: FindRange[][]; readonly added: FindRange[][] }
  | undefined {
  if (
    removed.length === 0 ||
    added.length === 0 ||
    !fewEnoughTokens(removed, added)
  ) {
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
    removed: rangesByLine(before, changed.a, removed.length),
    added: rangesByLine(after, changed.b, added.length),
  };
}

export function wholeText(text: string): FindRange[] | undefined {
  const start = text.search(/\S/);
  return start === -1 ? undefined : [{ start, end: text.trimEnd().length }];
}

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

const rangesOfChange = new WeakMap<Change, ReadonlyMap<number, FindRange[]>>();

function changeRanges(change: Change): ReadonlyMap<number, FindRange[]> {
  let ranges = rangesOfChange.get(change);
  if (!ranges) {
    const found = blockWordRanges(
      change.removed.map(({ line }) => line.text),
      change.added.map(({ line }) => line.text),
    );
    const byLine = new Map<number, FindRange[]>();
    const place = (
      { line, index }: NumberedLine,
      words: FindRange[] | undefined,
    ) => {
      const marked = words ?? wholeText(line.text);
      if (marked) {
        byLine.set(index, marked);
      }
    };
    change.removed.forEach((line, i) => place(line, found?.removed[i]));
    change.added.forEach((line, i) => place(line, found?.added[i]));
    ranges = byLine;
    rangesOfChange.set(change, ranges);
  }
  return ranges;
}

export type WordRanges = Pick<ReadonlyMap<string, readonly FindRange[]>, 'get'>;

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
