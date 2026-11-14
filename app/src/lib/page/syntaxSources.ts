import type { HighlighterCore } from 'shiki/core';
import { INITIAL, type StateStack } from 'shiki/textmate';
import {
  generationOf,
  grammars,
  lineColorer,
  loadLanguages,
  publishTime,
  ready,
  sliceTime,
  type ColoredLine,
  type LineColorer,
  type LineRanges,
  type SyntaxRange,
} from './syntaxEngine';
import {
  cached,
  cachedPrefix,
  store,
  type CachedPrefix,
  type Colors,
} from './syntaxCache';

interface Twin {
  readonly source: number;
  readonly lines: readonly (number | undefined)[];
}

export interface SyntaxSource {
  readonly language: string;
  readonly lines: readonly string[];
  readonly keys: readonly (string | undefined)[];
  readonly twin?: Twin;
  readonly entire?: true;
}

type EntireColors = (source: number, lines: LineRanges) => void;

function apply(
  source: SyntaxSource,
  lines: LineRanges,
  ranges: Map<string, readonly SyntaxRange[]>,
  from = 0,
) {
  lines.forEach((line, index) => {
    const key = source.keys[from + index];
    if (key !== undefined) {
      ranges.set(key, line);
    }
  });
}

interface PendingTwin {
  readonly key: string;
  readonly text: readonly string[];
  readonly lines: readonly (number | undefined)[];
}

interface Pending {
  readonly source: SyntaxSource;
  readonly index: number;
  readonly key: string;
  readonly twin?: PendingTwin;
  readonly prefix?: CachedPrefix & { readonly generation: number };
}

const keyOf = (source: SyntaxSource) =>
  `${source.language}\n${source.lines.join('\n')}`;

export function uncachedSources(
  sources: readonly SyntaxSource[],
  ranges: Map<string, readonly SyntaxRange[]>,
  entire?: EntireColors,
): Pending[] {
  const keys = sources.map(keyOf);
  const colored = (source: SyntaxSource, index: number, lines: LineRanges) => {
    apply(source, lines, ranges);
    if (source.entire && lines.length === source.lines.length) {
      entire?.(index, lines);
    }
  };
  return sources.flatMap((source, index): Pending[] => {
    if (source.lines.length === 0) {
      return [];
    }
    const key = keys[index];
    const found = cached(key);
    if (found) {
      colored(source, index, found.ranges);
      return [];
    }
    const kept = cachedPrefix(key);
    const prefix = kept && {
      ...kept,
      generation: generationOf(source.language),
    };
    if (prefix) {
      colored(source, index, prefix.ranges.slice(0, prefix.lines));
      if (prefix.lines === source.lines.length) {
        return [];
      }
    }
    const twin = source.twin;
    const twinSource = twin && sources[twin.source];
    return [
      {
        source,
        index,
        key,
        ...(prefix && { prefix }),
        ...(twin &&
          twin.source < index &&
          twinSource?.language === source.language && {
            twin: {
              key: keys[twin.source],
              text: twinSource.lines,
              lines: twin.lines,
            },
          }),
      },
    ];
  });
}

interface Coloring extends Colors {
  readonly pending: Pending;
  ranges: (readonly SyntaxRange[])[];
  states: StateStack[];
  color?: LineColorer;
  pulls?: Coloring;
  twin?: Colors;
}

const stateBefore = (colors: Colors, line: number) =>
  line === 0 ? INITIAL : colors.states?.[line - 1];

const complete = (coloring: Coloring) =>
  coloring.ranges.length === coloring.pending.source.lines.length;

function coloredByTwin(
  coloring: Coloring,
  line: number,
  before: StateStack,
): ColoredLine | undefined {
  const { source, twin } = coloring.pending;
  const twinLine = twin?.lines[line];
  const colors = coloring.twin;
  if (
    twinLine === undefined ||
    colors === undefined ||
    twin?.text[twinLine] !== source.lines[line]
  ) {
    return undefined;
  }
  const twinBefore = stateBefore(colors, twinLine);
  const after = colors.states?.[twinLine];
  return twinBefore !== undefined &&
    after !== undefined &&
    before.equals(twinBefore)
    ? { ranges: colors.ranges[twinLine], after }
    : undefined;
}

export function tokenizing(
  highlighter: HighlighterCore,
  pending: readonly Pending[],
  entire?: EntireColors,
): (deadline: number, ranges: Map<string, readonly SyntaxRange[]>) => boolean {
  let generation = grammars;
  const colorings: Coloring[] = pending.map((each) => ({
    pending: each,
    ranges: [],
    states: [],
  }));
  const byKey = new Map<string, Coloring>();
  for (const coloring of colorings.toReversed()) {
    byKey.set(coloring.pending.key, coloring);
  }
  const restart = () => {
    for (const coloring of colorings) {
      const twinKey = coloring.pending.twin?.key;
      const { prefix } = coloring.pending;
      const kept =
        prefix?.generation === generationOf(coloring.pending.source.language)
          ? prefix
          : undefined;
      coloring.ranges = kept?.ranges.slice(0, kept.lines) ?? [];
      coloring.states = kept?.states.slice(0, kept.lines) ?? [];
      coloring.color = undefined;
      coloring.pulls = twinKey === undefined ? undefined : byKey.get(twinKey);
      coloring.twin =
        twinKey === undefined ? undefined : (coloring.pulls ?? cached(twinKey));
    }
  };
  restart();
  const pulled = new Set(colorings.map(({ pulls }) => pulls));
  const groups = colorings
    .filter((coloring) => !pulled.has(coloring))
    .map((driver) => {
      const group = [driver];
      for (let next = driver.pulls; next && !group.includes(next);) {
        group.push(next);
        next = next.pulls;
      }
      return group;
    });
  const record = (
    coloring: Coloring,
    line: ColoredLine,
    ranges: Map<string, readonly SyntaxRange[]>,
  ) => {
    const { source, index, key } = coloring.pending;
    apply(source, [line.ranges], ranges, coloring.ranges.length);
    coloring.ranges.push(line.ranges);
    coloring.states.push(line.after);
    if (complete(coloring)) {
      store(key, { ranges: coloring.ranges, states: coloring.states });
      if (source.entire) {
        entire?.(index, coloring.ranges);
      }
    }
  };
  const advance = (
    coloring: Coloring,
    ranges: Map<string, readonly SyntaxRange[]>,
  ): void => {
    const { source, twin } = coloring.pending;
    const line = coloring.ranges.length;
    const twinLine = twin?.lines[line];
    const { pulls } = coloring;
    if (
      twinLine !== undefined &&
      pulls &&
      !complete(pulls) &&
      pulls.ranges.length <= twinLine
    ) {
      advance(pulls, ranges);
      return;
    }
    const before = stateBefore(coloring, line) ?? INITIAL;
    const byTwin = coloredByTwin(coloring, line, before);
    if (byTwin) {
      record(coloring, byTwin, ranges);
      return;
    }
    coloring.color ??= lineColorer(highlighter, source.language);
    record(coloring, coloring.color(source.lines[line], before), ranges);
  };
  let index = 0;
  return (deadline, ranges) => {
    while (index < groups.length) {
      if (generation !== grammars) {
        generation = grammars;
        restart();
        index = 0;
      }
      const unfinished = groups[index].find((each) => !complete(each));
      if (unfinished !== undefined) {
        advance(unfinished, ranges);
      }
      if (groups[index].every(complete)) {
        index += 1;
      }
      if (unfinished !== undefined && performance.now() >= deadline) {
        break;
      }
    }
    return index < groups.length;
  };
}

export function startColoring(
  sources: readonly SyntaxSource[],
  ranges: Map<string, readonly SyntaxRange[]>,
  publish: () => void,
  later: (run: () => void) => void = (run) => setTimeout(run),
  entire?: EntireColors,
): () => void {
  let current = true;
  let job = 0;
  const pending = uncachedSources(sources, ranges, entire);
  publish();
  const work = (highlighter: HighlighterCore, todo: readonly Pending[]) => {
    const step = tokenizing(highlighter, todo, entire);
    const mine = job;
    let published = -Infinity;
    const slice = () => {
      if (!current || job !== mine) {
        return;
      }
      const more = step(performance.now() + sliceTime, ranges);
      if (!more || performance.now() - published >= publishTime) {
        publish();
        published = performance.now();
      }
      if (more) {
        later(slice);
      }
    };
    later(slice);
  };
  const loaded = ready?.getLoadedLanguages() ?? [];
  const now = pending.filter(({ source }) => loaded.includes(source.language));
  const missing = pending.filter((item) => !now.includes(item));
  if (ready && now.length > 0) {
    work(ready, now);
  }
  if (missing.length > 0) {
    const before = grammars;
    void loadLanguages(missing.map(({ source }) => source.language)).then(
      (highlighter) => {
        if (!current) {
          return;
        }
        if (grammars === before) {
          work(highlighter, missing);
        } else {
          job += 1;
          work(highlighter, uncachedSources(sources, ranges, entire));
        }
      },
    );
  }
  return () => {
    current = false;
  };
}
