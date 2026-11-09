import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TextRequest } from '../shared/protocol';
import { parsePatch, textKey, type DiffFile, type LoadedText } from './diff';
import type { WholeFile } from './diffView';
import { lineKey, wholeLines } from './find';
import { languageOf } from '../../../ui/languages';
import type { SyntaxRange, SyntaxSource } from '../../../ui/syntaxEngine';
import { colorer } from '../../../ui/syntax';
import { partLine, type CodePart } from '../../../ui/syntaxParts';

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
  chosen: string | undefined,
): SidePlan[] {
  let used = 0;
  return files.flatMap((file, fileIndex) => {
    const language = chosen ?? languageOf(file.path);
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

interface NumberedSource {
  readonly plan: SidePlan;
  readonly source: SyntaxSource;
  readonly numbers: readonly number[];
}

function sideSource(plan: SidePlan, text: string | undefined): NumberedSource {
  const { fileIndex, language, shown, wholeText } = plan;
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
    const fromFirstLine = kept.every(
      ({ number }, index) => number === index + 1,
    );
    return {
      plan,
      source: {
        language,
        lines: kept.map(({ line }) => line.text),
        keys: kept.map(keyOf),
        ...(fromFirstLine && { entire: true }),
      },
      numbers: kept.map(({ number }) => number),
    };
  }
  const keys: (string | undefined)[] = [];
  for (const line of shown) {
    keys[line.number - 1] = keyOf(line);
  }
  return {
    plan,
    source: {
      language,
      lines: lines.slice(0, keys.length),
      keys,
      entire: true,
    },
    numbers: Array.from({ length: keys.length }, (_, index) => index + 1),
  };
}

function oldNumbersOfUnchanged(file: DiffFile): Map<number, number> {
  const found = new Map<number, number>();
  let oldNumber = 1;
  let newNumber = 1;
  for (const line of file.hunks.flatMap((hunk) => hunk.lines)) {
    const gap =
      line.oldNumber === undefined
        ? (line.newNumber ?? newNumber) - newNumber
        : line.oldNumber - oldNumber;
    for (let offset = 0; offset < gap; offset += 1) {
      found.set(newNumber + offset, oldNumber + offset);
    }
    oldNumber += gap;
    newNumber += gap;
    if (line.oldNumber !== undefined && line.newNumber !== undefined) {
      found.set(line.newNumber, line.oldNumber);
    }
    oldNumber = (line.oldNumber ?? oldNumber - 1) + 1;
    newNumber = (line.newNumber ?? newNumber - 1) + 1;
  }
  return found;
}

function twinned(numbered: readonly NumberedSource[]): SyntaxSource[] {
  return numbered.map(({ plan, source, numbers }, index) => {
    const old = index === 0 ? undefined : numbered[index - 1];
    if (
      old === undefined ||
      plan.side !== 'new' ||
      old.plan.side !== 'old' ||
      old.plan.file !== plan.file
    ) {
      return source;
    }
    const oldNumbers = oldNumbersOfUnchanged(plan.file);
    const oldIndexes = new Map(
      old.numbers.map((number, line) => [number, line]),
    );
    return {
      ...source,
      twin: {
        source: index - 1,
        lines: numbers.map((number) => {
          const oldNumber = oldNumbers.get(number);
          return oldNumber === undefined
            ? undefined
            : oldIndexes.get(oldNumber);
        }),
      },
    };
  });
}

interface PlannedSource {
  readonly source: SyntaxSource;
  readonly blob?: string;
}

function plannedSources(
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
  texts: ReadonlyMap<string, LoadedText>,
  open: ReadonlySet<number> | undefined,
  chosen: string | undefined,
): PlannedSource[] {
  if (whole) {
    const language = chosen ?? languageOf(whole.path);
    const lines = wholeLines(whole).slice(0, maxSourceLines);
    return language
      ? [
          {
            source: {
              language,
              lines,
              keys: lines.map((_, index) => lineKey(0, index)),
            },
          },
        ]
      : [];
  }
  const numbered = sidePlans(files, open, chosen).flatMap((plan) => {
    const loaded = texts.get(textKey(plan.file.path, plan.side));
    const awaited =
      plan.wholeText &&
      loaded !== undefined &&
      loaded.blob !== plan.file.blobs?.[plan.side];
    return awaited ? [] : [sideSource(plan, loaded?.text)];
  });
  return twinned(numbered).map((source, index) => {
    const { plan } = numbered[index];
    const blob = plan.file.blobs?.[plan.side];
    return source.entire && blob !== undefined ? { source, blob } : { source };
  });
}

export function syntaxSources(
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
  texts: ReadonlyMap<string, LoadedText> = new Map(),
  open?: ReadonlySet<number>,
  chosen?: string,
): SyntaxSource[] {
  return plannedSources(files, whole, texts, open, chosen).map(
    ({ source }) => source,
  );
}

interface Kept {
  readonly part: CodePart;
  readonly generation: number;
}

const maxKeptLines = 200_000;
const kept = new Map<string, Kept>();
let keptLines = 0;
const newestGenerations = new Map<string, number>();

const newestGeneration = (language: string) =>
  newestGenerations.get(language) ?? 0;

function noteGeneration(language: string, generation: number) {
  newestGenerations.set(
    language,
    Math.max(newestGeneration(language), generation),
  );
}

const keptKey = (language: string, blob: string) => `${language}\n${blob}`;

function forget(key: string, { part }: Kept) {
  kept.delete(key);
  keptLines -= part.ends.length;
}

function keptPart(language: string, blob: string): CodePart | undefined {
  const key = keptKey(language, blob);
  const found = kept.get(key);
  if (found === undefined) {
    return undefined;
  }
  forget(key, found);
  if (found.generation < newestGeneration(language)) {
    return undefined;
  }
  kept.set(key, found);
  keptLines += found.part.ends.length;
  return found.part;
}

export function keepColors(
  language: string,
  blob: string,
  part: CodePart,
  generation: number,
): void {
  noteGeneration(language, generation);
  const key = keptKey(language, blob);
  const before = keptPart(language, blob);
  if (
    generation < newestGeneration(language) ||
    (before && before.ends.length >= part.ends.length)
  ) {
    return;
  }
  const replaced = kept.get(key);
  if (replaced) {
    forget(key, replaced);
  }
  kept.set(key, { part, generation });
  keptLines += part.ends.length;
  for (const [oldest, each] of kept) {
    if (keptLines <= maxKeptLines) {
      break;
    }
    forget(oldest, each);
  }
}

export function keptColorsOf(
  files: readonly DiffFile[],
  open?: ReadonlySet<number>,
  chosen?: string,
): Map<string, readonly SyntaxRange[]> {
  const found = new Map<string, readonly SyntaxRange[]>();
  for (const { file, fileIndex, language, side, shown } of sidePlans(
    files,
    open,
    chosen,
  )) {
    const blob = file.blobs?.[side];
    const part = blob === undefined ? undefined : keptPart(language, blob);
    if (part === undefined) {
      continue;
    }
    for (const { owned, index, number } of shown) {
      const ranges = owned ? partLine(part, number - 1) : undefined;
      if (ranges !== undefined) {
        found.set(lineKey(fileIndex, index), ranges);
      }
    }
  }
  return found;
}

export function textsToLoad(
  files: readonly DiffFile[],
  diff: number,
  requested: Set<string>,
  open?: ReadonlySet<number>,
  texts: ReadonlyMap<string, LoadedText> = new Map(),
  chosen?: string,
): TextRequest[] {
  return sidePlans(files, open, chosen).flatMap(({ file, side, wholeText }) => {
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

export function useTextsToLoad(
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
  diff: number,
  open: ReadonlySet<number>,
  texts: ReadonlyMap<string, LoadedText>,
  chosen: string | undefined,
  onLoadTexts: (texts: TextRequest[]) => void,
): void {
  const requested = useRef(new Set<string>());
  useLayoutEffect(() => {
    const load = whole
      ? []
      : textsToLoad(files, diff, requested.current, open, texts, chosen);
    if (load.length > 0) {
      onLoadTexts(load);
    }
  }, [files, whole, diff, open, texts, onLoadTexts, chosen]);
}

export function usePrefetchedColors(
  patch: string | undefined,
  texts: ReadonlyMap<string, LoadedText> | undefined,
  highlight: boolean,
): void {
  const files = useMemo(
    () => (patch === undefined ? [] : parsePatch(patch)),
    [patch],
  );
  useEffect(() => {
    if (!highlight || texts === undefined) {
      return undefined;
    }
    const planned = plannedSources(
      files,
      undefined,
      texts,
      undefined,
      undefined,
    );
    if (!planned.some(({ blob }) => blob !== undefined)) {
      return undefined;
    }
    return colorer().color(
      planned.map(({ source }) => source),
      () => undefined,
      (index, part, generation) => {
        const { source, blob } = planned[index] ?? {};
        if (source !== undefined && blob !== undefined) {
          keepColors(source.language, blob, part, generation);
        }
      },
      true,
    );
  }, [files, texts, highlight]);
}

const noRanges: ReadonlyMap<string, readonly SyntaxRange[]> = new Map();

interface Colored {
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

export function useSyntax(
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
  texts: ReadonlyMap<string, LoadedText>,
  open: ReadonlySet<number>,
  highlight = true,
  chosen?: string,
): ReadonlyMap<string, readonly SyntaxRange[]> {
  const planned = useMemo(
    () => (highlight ? plannedSources(files, whole, texts, open, chosen) : []),
    [highlight, files, whole, texts, open, chosen],
  );
  const [colored, setColored] = useState<Colored>();
  const shown = useRef<Colored>(undefined);
  useLayoutEffect(() => {
    const ranges = startingRanges(shown.current, files, whole, chosen, open);
    const keptRanges =
      highlight && whole === undefined
        ? keptColorsOf(files, open, chosen)
        : new Map<string, readonly SyntaxRange[]>();
    for (const [key, line] of keptRanges) {
      ranges.set(key, line);
    }
    const keptGenerations = new Map(
      planned.map(({ source: { language } }) => [
        language,
        newestGeneration(language),
      ]),
    );
    const languagesOfKeys = new Map(
      planned.flatMap(({ source: { keys, language } }) =>
        keys.flatMap((key) => (key === undefined ? [] : [[key, language]])),
      ),
    );
    const ofWholeTexts = new Set(
      planned.flatMap(({ source }) => (source.entire ? source.keys : [])),
    );
    const publish = () => {
      shown.current = { files, whole, ranges: new Map(ranges), chosen };
      setColored(shown.current);
    };
    publish();
    return planned.length === 0
      ? undefined
      : colorer().color(
          planned.map(({ source }) => source),
          (found, generations) => {
            for (const [language, generation] of Object.entries(generations)) {
              noteGeneration(language, generation);
            }
            const newer = (language: string | undefined) =>
              language !== undefined &&
              (generations[language] ?? 0) >
                (keptGenerations.get(language) ?? 0);
            for (const [key, line] of found) {
              if (
                ofWholeTexts.has(key) ||
                !keptRanges.has(key) ||
                newer(languagesOfKeys.get(key))
              ) {
                ranges.set(key, line);
              }
            }
            publish();
          },
          (index, part, generation) => {
            const { source, blob } = planned[index] ?? {};
            if (source !== undefined && blob !== undefined) {
              keepColors(source.language, blob, part, generation);
            }
          },
        );
  }, [planned, highlight, files, whole, chosen, open]);
  return highlight && colored?.files === files && colored.whole === whole
    ? colored.ranges
    : noRanges;
}
