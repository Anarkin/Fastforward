import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parsePatch, type DiffFile } from './diff';
import type { LoadedText } from './sideTexts';
import type { SyntaxRange } from '../../syntax/page/engine';
import { colorer } from '../../syntax/page/colorer';
import type { WholeFile } from './diffRows';
import { plannedSources } from './diffSyntaxSources';
import {
  keepColors,
  keptColorsOf,
  newestGeneration,
  noteGeneration,
} from './keptColors';
import { startingRanges, type Colored } from './carriedRanges';

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

interface SyntaxInput {
  readonly files: readonly DiffFile[];
  readonly whole: WholeFile | undefined;
  readonly texts: ReadonlyMap<string, LoadedText>;
  readonly open: ReadonlySet<number>;
}

export const noSyntaxInput: SyntaxInput = {
  files: [],
  whole: undefined,
  texts: new Map(),
  open: new Set(),
};

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
