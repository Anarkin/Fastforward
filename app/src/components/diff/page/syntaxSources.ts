import type { DiffFile } from './diff';
import { textKey, type LoadedText } from './sideTexts';
import { lineKey, wholeLines } from './lines';
import { languageOf } from '../../../lib/page/languages';
import type { SyntaxSource } from '../../syntax/page/colorer';
import type { WholeFile } from './rows';

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

export function sidePlans(
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
  const lines = wholeText ? text?.split(/\r\n|\r|\n/) : undefined;
  if (
    lines === undefined ||
    shown.some(
      ({ line, number }) => lines[number - 1] !== line.text.replace(/\r$/, ''),
    )
  ) {
    const kept = shown.slice(0, maxSourceLines);
    const asInBlob = kept.every(
      ({ line, number }, index) =>
        number === index + 1 &&
        (plan.side === 'new' || line.kind !== 'context'),
    );
    return {
      plan,
      source: {
        language,
        lines: kept.map(({ line }) => line.text),
        keys: kept.map(keyOf),
        ...(asInBlob && { entire: true }),
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

export function plannedSources(
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
