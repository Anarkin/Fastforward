import type { DiffFile } from './diff';
import type { FindRange } from './find';
import { lineKey } from './find';

const maxCells = 1_000_000;

export function tokenize(text: string): string[] {
  return text.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) ?? [];
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
): { readonly a: boolean[]; readonly b: boolean[] } | undefined {
  const rows = a.length + 1;
  const columns = b.length + 1;
  if (rows * columns > maxCells) {
    return undefined;
  }
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
  if (removed.length === 0 || added.length === 0) {
    return undefined;
  }
  const before = tokensOf(removed);
  const after = tokensOf(added);
  const changed = changedTokens(
    before.map((token) => token.text),
    after.map((token) => token.text),
  );
  if (
    !changed ||
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

export function wordRanges(
  files: readonly DiffFile[],
): Map<string, FindRange[]> {
  const ranges = new Map<string, FindRange[]>();
  files.forEach((file, fileIndex) => {
    let next = 0;
    for (const hunk of file.hunks) {
      let removed: { text: string; index: number }[] = [];
      let added: { text: string; index: number }[] = [];
      const compare = () => {
        const found = blockWordRanges(
          removed.map((line) => line.text),
          added.map((line) => line.text),
        );
        if (found) {
          removed.forEach((line, i) =>
            ranges.set(lineKey(fileIndex, line.index), found.removed[i]),
          );
          added.forEach((line, i) =>
            ranges.set(lineKey(fileIndex, line.index), found.added[i]),
          );
        }
        removed = [];
        added = [];
      };
      for (const line of hunk.lines) {
        const placed = { text: line.text, index: next++ };
        if (line.kind === 'removed') {
          if (added.length > 0) {
            compare();
          }
          removed.push(placed);
        } else if (line.kind === 'added') {
          added.push(placed);
        } else {
          compare();
        }
      }
      compare();
    }
  });
  return ranges;
}
