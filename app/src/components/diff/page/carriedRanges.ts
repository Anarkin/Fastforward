import type { DiffFile } from './diff';
import { lineKey, wholeLines } from './lines';
import type { SyntaxRange } from '../../syntax/page/engine';
import type { WholeFile } from './rows';
import { syntaxSources } from './syntaxSources';

export interface Colored {
  readonly files: readonly DiffFile[];
  readonly whole: WholeFile | undefined;
  readonly ranges: Map<string, readonly SyntaxRange[]>;
  readonly chosen?: string;
}

function keyedLines(files: readonly DiffFile[], whole: WholeFile | undefined) {
  if (whole) {
    return wholeLines(whole).map((text, index) => ({
      key: lineKey(0, index),
      path: whole.path,
      text,
    }));
  }
  return files.flatMap((file, fileIndex) =>
    file.hunks
      .flatMap((hunk) => hunk.lines)
      .map((line, index) => ({
        key: lineKey(fileIndex, index),
        path: file.path,
        text: line.text,
      })),
  );
}

function coloredKeys(
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
  open: ReadonlySet<number> | undefined,
  chosen: string | undefined,
): ReadonlySet<string | undefined> {
  return new Set(
    syntaxSources(files, whole, undefined, open, chosen).flatMap(
      (source) => source.keys,
    ),
  );
}

export function carriedRanges(
  before: Colored,
  files: readonly DiffFile[],
  whole?: WholeFile,
  open?: ReadonlySet<number>,
): Map<string, readonly SyntaxRange[]> {
  const found = new Map<
    string,
    { readonly ranges: (readonly SyntaxRange[])[]; next: number }
  >();
  for (const { key, path, text } of keyedLines(before.files, before.whole)) {
    const ranges = before.ranges.get(key);
    if (ranges !== undefined) {
      const line = `${path}\n${text}`;
      const same = found.get(line);
      if (same) {
        same.ranges.push(ranges);
      } else {
        found.set(line, { ranges: [ranges], next: 0 });
      }
    }
  }
  const colored = coloredKeys(files, whole, open, before.chosen);
  const carried = new Map<string, readonly SyntaxRange[]>();
  for (const { key, path, text } of keyedLines(files, whole)) {
    const same = found.get(`${path}\n${text}`);
    if (same && colored.has(key)) {
      carried.set(
        key,
        same.ranges[Math.min(same.next, same.ranges.length - 1)],
      );
      same.next += 1;
    }
  }
  return carried;
}

export function startingRanges(
  last: Colored | undefined,
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
  chosen: string | undefined,
  open?: ReadonlySet<number>,
): Map<string, readonly SyntaxRange[]> {
  if (last === undefined || last.chosen !== chosen) {
    return new Map();
  }
  return last.files === files && last.whole === whole
    ? last.ranges
    : carriedRanges(last, files, whole, open);
}
