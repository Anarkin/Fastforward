import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TextRequest } from '../shared/protocol';
import { textKey, type DiffFile, type LoadedText } from './diff';
import type { WholeFile } from './diffView';
import { lineKey, wholeLines } from './find';
import { languageOf } from '../../../ui/languages';
import type { SyntaxRange, SyntaxSource } from '../../../ui/syntaxEngine';
import { colorer } from '../../../ui/syntax';

export type { SyntaxRange } from '../../../ui/syntaxEngine';
export { languageOf } from '../../../ui/languages';

type Side = 'old' | 'new';

const sides = ['old', 'new'] as const;

function sideLines(file: DiffFile, side: Side) {
  return file.hunks
    .flatMap((hunk) => hunk.lines)
    .map((line, index) => ({
      line,
      index,
      number: side === 'old' ? line.oldNumber : line.newNumber,
      owned:
        line.kind === (side === 'old' ? 'removed' : 'added') ||
        (line.kind === 'context' && side === 'new'),
    }))
    .filter(
      (shown): shown is typeof shown & { number: number } =>
        shown.number !== undefined,
    );
}

const maxSourceLines = 5000;

const maxTextLines = 20_000;

interface SidePlan {
  readonly file: DiffFile;
  readonly fileIndex: number;
  readonly language: string;
  readonly side: Side;
  readonly shown: ReturnType<typeof sideLines>;
  readonly wholeText: boolean;
}

function sidePlans(
  files: readonly DiffFile[],
  open: ReadonlySet<number> | undefined,
): SidePlan[] {
  let used = 0;
  return files.flatMap((file, fileIndex) => {
    const language = languageOf(file.path);
    if (
      !language ||
      file.binary ||
      file.placeholder ||
      (open && !open.has(fileIndex))
    ) {
      return [];
    }
    return sides.flatMap((side) => {
      const shown = sideLines(file, side);
      if (!shown.some(({ owned }) => owned)) {
        return [];
      }
      const last = shown.at(-1)?.number ?? 0;
      const gap = last !== shown.length;
      const wholeText =
        used < maxTextLines &&
        !!file.blobs?.[side] &&
        gap &&
        last <= maxSourceLines;
      used += wholeText ? last : Math.min(shown.length, maxSourceLines);
      return [{ file, fileIndex, language, side, shown, wholeText }];
    });
  });
}

function sideSource(
  { fileIndex, language, shown, wholeText }: SidePlan,
  text: string | undefined,
): SyntaxSource {
  const keyOf = ({ owned, index }: (typeof shown)[number]) =>
    owned ? lineKey(fileIndex, index) : undefined;
  const lines = wholeText ? text?.split(/\r?\n/) : undefined;
  if (
    lines === undefined ||
    shown.some(
      ({ line, number }) => lines[number - 1] !== line.text.replace(/\r$/, ''),
    )
  ) {
    const kept = shown.slice(0, maxSourceLines);
    return {
      language,
      lines: kept.map(({ line }) => line.text),
      keys: kept.map(keyOf),
    };
  }
  const keys: (string | undefined)[] = [];
  for (const line of shown) {
    keys[line.number - 1] = keyOf(line);
  }
  return { language, lines: lines.slice(0, keys.length), keys };
}

export function syntaxSources(
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
  texts: ReadonlyMap<string, LoadedText> = new Map(),
  open?: ReadonlySet<number>,
): SyntaxSource[] {
  if (whole) {
    const language = languageOf(whole.path);
    const lines = wholeLines(whole).slice(0, maxSourceLines);
    return language
      ? [{ language, lines, keys: lines.map((_, index) => lineKey(0, index)) }]
      : [];
  }
  return sidePlans(files, open).flatMap((plan) => {
    const loaded = texts.get(textKey(plan.file.path, plan.side));
    const awaited =
      plan.wholeText &&
      loaded !== undefined &&
      loaded.blob !== plan.file.blobs?.[plan.side];
    return awaited ? [] : [sideSource(plan, loaded?.text)];
  });
}

export function textsToLoad(
  files: readonly DiffFile[],
  diff: number,
  requested: Set<string>,
  open?: ReadonlySet<number>,
  texts: ReadonlyMap<string, LoadedText> = new Map(),
): TextRequest[] {
  return sidePlans(files, open).flatMap(({ file, side, wholeText }) => {
    const blob = file.blobs?.[side];
    const key = `${diff}:${textKey(file.path, side)}`;
    if (
      !wholeText ||
      !blob ||
      requested.has(key) ||
      texts.get(textKey(file.path, side))?.blob === blob
    ) {
      return [];
    }
    requested.add(key);
    return [{ path: file.path, side, blob }];
  });
}

const noRanges: ReadonlyMap<string, readonly SyntaxRange[]> = new Map();

interface Colored {
  readonly files: readonly DiffFile[];
  readonly whole: WholeFile | undefined;
  readonly ranges: Map<string, readonly SyntaxRange[]>;
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

export function carriedRanges(
  before: Colored,
  files: readonly DiffFile[],
  whole?: WholeFile,
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
  const carried = new Map<string, readonly SyntaxRange[]>();
  for (const { key, path, text } of keyedLines(files, whole)) {
    const same = found.get(`${path}\n${text}`);
    if (same) {
      carried.set(
        key,
        same.ranges[Math.min(same.next, same.ranges.length - 1)],
      );
      same.next += 1;
    }
  }
  return carried;
}

export function useSyntax(
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
  texts: ReadonlyMap<string, LoadedText>,
  open: ReadonlySet<number>,
  highlight = true,
): ReadonlyMap<string, readonly SyntaxRange[]> {
  const sources = useMemo(
    () => (highlight ? syntaxSources(files, whole, texts, open) : []),
    [highlight, files, whole, texts, open],
  );
  const [colored, setColored] = useState<Colored>();
  const shown = useRef<Colored>(undefined);
  useLayoutEffect(() => {
    const last = shown.current;
    const ranges =
      last === undefined
        ? new Map<string, readonly SyntaxRange[]>()
        : last.files === files && last.whole === whole
          ? last.ranges
          : carriedRanges(last, files, whole);
    const publish = () => {
      shown.current = { files, whole, ranges };
      setColored(shown.current);
    };
    publish();
    return sources.length === 0
      ? undefined
      : colorer().color(sources, (found) => {
          for (const [key, line] of found) {
            ranges.set(key, line);
          }
          publish();
        });
  }, [sources, files, whole]);
  return highlight && colored?.files === files && colored.whole === whole
    ? colored.ranges
    : noRanges;
}
