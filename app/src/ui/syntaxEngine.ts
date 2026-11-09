import {
  createHighlighterCore,
  type HighlighterCore,
  type LanguageRegistration,
  type ThemeRegistrationRaw,
} from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import { bundledLanguagesInfo } from 'shiki/langs';
import { EncodedTokenMetadata, INITIAL, type StateStack } from 'shiki/textmate';
import { errorText } from './errors';
import { languageIds } from './languages';
import { onceMade } from './onceMade';
import { packedPart, type CodePart } from './syntaxParts';

const kinds = [
  {
    kind: 'keyword',
    scopes: [
      'keyword',
      'storage',
      'constant.language',
      'constant.character.escape',
      'variable.language',
      'punctuation',
      'meta.brace',
    ],
  },
  {
    kind: 'type',
    scopes: [
      'entity.name.type',
      'entity.name.class',
      'entity.other.inherited-class',
      'support.type',
      'support.class',
    ],
  },
  { kind: 'function', scopes: ['entity.name.function', 'support.function'] },
  {
    kind: 'string',
    scopes: [
      'string',
      'markup.inline.raw',
      'punctuation.definition.raw',
      'markup.raw.block',
    ],
  },
  { kind: 'number', scopes: ['constant.numeric'] },
  { kind: 'comment', scopes: ['comment', 'punctuation.definition.comment'] },
] as const;

export interface SyntaxRange {
  readonly start: number;
  readonly end: number;
  readonly kind: (typeof kinds)[number]['kind'];
}

const plainScopes = [
  'meta.embedded',
  'meta.template.expression',
  'support.type.property-name',
  'punctuation.support.type.property-name',
];

const plainColor = '#000000';

const colorOf = (index: number) =>
  `#${(index + 1).toString(16).padStart(6, '0')}`;

const kindsByColor = new Map(
  kinds.map(({ kind }, index) => [colorOf(index), kind]),
);

const themeName = 'fastforward';

const theme: ThemeRegistrationRaw = {
  name: themeName,
  settings: [
    { settings: { foreground: plainColor, background: '#ffffff' } },
    ...kinds.map(({ scopes }, index) => ({
      scope: [...scopes],
      settings: { foreground: colorOf(index) },
    })),
    { scope: plainScopes, settings: { foreground: plainColor } },
  ],
};

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

const maxLineLength = 20_000;

export type LineRanges = readonly (readonly SyntaxRange[])[];

interface Colors {
  readonly ranges: LineRanges;
  readonly states?: readonly StateStack[];
}

const maxCachedLines = 100_000;
const maxCachedChars = 8_000_000;
const cache = new Map<string, Colors>();
const cachedByFirstLine = new Map<string, Set<string>>();
let cachedLines = 0;
let cachedChars = 0;

function cached(key: string): Colors | undefined {
  const colors = cache.get(key);
  if (colors) {
    cache.delete(key);
    cache.set(key, colors);
  }
  return colors;
}

function textStart(key: string): number {
  return key.indexOf('\n') + 1;
}

function textLength(key: string): number {
  return key.length - textStart(key);
}

function firstLineOf(key: string): string {
  const end = key.indexOf('\n', textStart(key));
  return end === -1 ? key : key.slice(0, end);
}

function store(key: string, colors: Colors) {
  if (textLength(key) > maxCachedChars / 4 || cache.has(key)) {
    return;
  }
  cache.set(key, colors);
  const firstLine = firstLineOf(key);
  const alike = cachedByFirstLine.get(firstLine) ?? new Set();
  cachedByFirstLine.set(firstLine, alike.add(key));
  cachedLines += colors.ranges.length;
  cachedChars += textLength(key);
  for (const [oldest, colored] of cache) {
    if (cachedLines <= maxCachedLines && cachedChars <= maxCachedChars) {
      break;
    }
    uncache(oldest, colored);
  }
}

function uncache(key: string, { ranges }: Colors) {
  cache.delete(key);
  const firstLine = firstLineOf(key);
  const alike = cachedByFirstLine.get(firstLine);
  alike?.delete(key);
  if (alike?.size === 0) {
    cachedByFirstLine.delete(firstLine);
  }
  cachedLines -= ranges.length;
  cachedChars -= textLength(key);
}

function languageOfKey(key: string): string {
  return key.slice(0, textStart(key) - 1);
}

function forgetCached(languages: ReadonlySet<string>) {
  for (const [key, colors] of cache) {
    if (languages.has(languageOfKey(key))) {
      uncache(key, colors);
    }
  }
}

const registered = new Map<string, LanguageRegistration>();
const generations = new Map<string, number>();

const generationOf = (language: string) => generations.get(language) ?? 0;

function embeddersOf(loaded: ReadonlySet<string>): Set<string> {
  const stale = new Set<string>();
  const embeds = (language: string) =>
    loaded.has(language) || stale.has(language);
  for (let grew = true; grew;) {
    grew = false;
    for (const {
      name,
      embeddedLangs = [],
      embeddedLangsLazy = [],
    } of registered.values()) {
      if (
        !stale.has(name) &&
        !loaded.has(name) &&
        [...embeddedLangs, ...embeddedLangsLazy].some(embeds)
      ) {
        stale.add(name);
        grew = true;
      }
    }
  }
  return stale;
}

function linesInCommon(key: string, other: string): number {
  const from = textStart(key);
  let low = from;
  let high = Math.min(key.length, other.length);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (key.slice(from, middle) === other.slice(from, middle)) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  let lines = 0;
  for (
    let end = key.indexOf('\n', from);
    end !== -1 && end < low;
    end = key.indexOf('\n', end + 1)
  ) {
    lines += 1;
  }
  const endsLine = (text: string) => low === text.length || text[low] === '\n';
  return endsLine(key) && endsLine(other) ? lines + 1 : lines;
}

interface CachedPrefix {
  readonly ranges: LineRanges;
  readonly states: readonly StateStack[];
  readonly lines: number;
  readonly generation: number;
}

function cachedPrefix(key: string): CachedPrefix | undefined {
  let best: CachedPrefix | undefined;
  for (const other of cachedByFirstLine.get(firstLineOf(key)) ?? []) {
    const colors = cache.get(other);
    const lines = linesInCommon(key, other);
    if (colors?.states && lines > (best?.lines ?? 0)) {
      best = {
        ranges: colors.ranges,
        states: colors.states,
        lines,
        generation: generationOf(languageOfKey(key)),
      };
    }
  }
  return best;
}

const tokenizeTimeLimit = 500;

interface ColoredLine {
  readonly ranges: readonly SyntaxRange[];
  readonly after: StateStack;
}

type LineColorer = (line: string, before: StateStack) => ColoredLine;

const statesAfterEmptyLines = new WeakMap<
  object,
  WeakMap<StateStack, StateStack>
>();

function lineColorer(
  highlighter: HighlighterCore,
  language: string,
): LineColorer {
  const grammar = highlighter.getLanguage(language);
  const afterEmptyLine =
    statesAfterEmptyLines.get(grammar) ?? new WeakMap<StateStack, StateStack>();
  statesAfterEmptyLines.set(grammar, afterEmptyLine);
  const kindsByIndex = highlighter
    .setTheme(themeName)
    .colorMap.map((color) => kindsByColor.get(color));
  return (text, before) => {
    const line = text.replace(/\r$/, '');
    if (line.length > maxLineLength) {
      return { ranges: [], after: before };
    }
    const afterEmpty = line === '' ? afterEmptyLine.get(before) : undefined;
    if (afterEmpty !== undefined) {
      return { ranges: [], after: afterEmpty };
    }
    const { tokens, ruleStack } = grammar.tokenizeLine2(
      line,
      before,
      tokenizeTimeLimit,
    );
    if (line === '') {
      afterEmptyLine.set(before, ruleStack);
    }
    const ranges: SyntaxRange[] = [];
    for (let index = 0; index < tokens.length; index += 2) {
      const start = tokens[index];
      const end = index + 2 < tokens.length ? tokens[index + 2] : line.length;
      const kind =
        kindsByIndex[EncodedTokenMetadata.getForeground(tokens[index + 1])];
      const last = ranges.at(-1);
      if (kind === undefined || start === end) {
        continue;
      }
      if (last?.kind === kind && last.end === start) {
        ranges[ranges.length - 1] = { ...last, end };
      } else {
        ranges.push({ start, end, kind });
      }
    }
    return { ranges, after: ruleStack };
  };
}

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
  readonly prefix?: CachedPrefix;
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
    const prefix = cachedPrefix(key);
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

const highlighterMade = onceMade(() =>
  createHighlighterCore({
    themes: [theme],
    engine: createOnigurumaEngine(import('shiki/wasm')),
  }),
);
let ready: HighlighterCore | undefined;
let grammars = 0;

export async function loadLanguages(
  languages: readonly string[],
): Promise<HighlighterCore> {
  const highlighter = await highlighterMade();
  const loaded = highlighter.getLoadedLanguages();
  const added = await Promise.all(
    bundledLanguagesInfo
      .filter(
        (info) => languages.includes(info.id) && !loaded.includes(info.id),
      )
      .map((info) => info.import()),
  );
  if (added.length > 0) {
    await highlighter.loadLanguage(...added);
    const registrations = added.flatMap((module) => module.default);
    for (const registration of registrations) {
      registered.set(registration.name, registration);
    }
    const stale = embeddersOf(new Set(registrations.map(({ name }) => name)));
    for (const language of stale) {
      generations.set(language, generationOf(language) + 1);
    }
    forgetCached(stale);
    grammars += 1;
  }
  ready = highlighter;
  return highlighter;
}

export function makeHighlighter(): Promise<HighlighterCore> {
  return loadLanguages([]);
}

const sliceTime = 10;
const publishTime = 16;

export function colorCode(
  language: string,
  code: string,
  publish: (part: CodePart | undefined) => void,
  later: (run: () => void) => void = (run) => setTimeout(run),
): () => void {
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  const id = languageIds.get(language.toLowerCase());
  if (id === undefined) {
    publish(undefined);
    return stop;
  }
  const key = `${id}\n${code}`;
  const lines = code.split('\n');
  const kept = textLength(key) <= maxCachedChars / 4;
  const work = (highlighter: HighlighterCore) => {
    const found = cached(key);
    if (found !== undefined) {
      publish(packedPart(found.ranges, 0, true));
      return;
    }
    let generation = grammars;
    let color = lineColorer(highlighter, id);
    let next = 0;
    let sent = 0;
    let state = INITIAL;
    let waiting: (readonly SyntaxRange[])[] = [];
    let all: (readonly SyntaxRange[])[] = [];
    let published = -Infinity;
    const slice = () => {
      if (stopped) {
        return;
      }
      if (generation !== grammars) {
        generation = grammars;
        color = lineColorer(highlighter, id);
        next = 0;
        sent = 0;
        state = INITIAL;
        waiting = [];
        all = [];
      }
      const deadline = performance.now() + sliceTime;
      while (next < lines.length && performance.now() < deadline) {
        const line = color(lines[next], state);
        state = line.after;
        waiting.push(line.ranges);
        if (kept) {
          all.push(line.ranges);
        }
        next += 1;
      }
      const done = next >= lines.length;
      if (done || performance.now() - published >= publishTime) {
        publish(packedPart(waiting, sent, done));
        sent = next;
        waiting = [];
        published = performance.now();
      }
      if (!done) {
        later(slice);
      } else if (kept) {
        store(key, { ranges: all });
      }
    };
    later(slice);
  };
  void loadLanguages([id]).then(
    (highlighter) => {
      if (!stopped) {
        work(highlighter);
      }
    },
    (error: unknown) => {
      if (!stopped) {
        publish(undefined);
      }
      throw error;
    },
  );
  return stop;
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

export type ToSyntax =
  | {
      readonly type: 'color';
      readonly job: number;
      readonly sources: readonly SyntaxSource[];
    }
  | { readonly type: 'stop'; readonly job: number }
  | {
      readonly type: 'code';
      readonly job: number;
      readonly language: string;
      readonly code: string;
    };

export type FromSyntax =
  | {
      readonly type: 'colors';
      readonly job: number;
      readonly generations: Readonly<Record<string, number>>;
      readonly ranges: readonly (readonly [string, readonly SyntaxRange[]])[];
    }
  | {
      readonly type: 'entire';
      readonly job: number;
      readonly generation: number;
      readonly source: number;
      readonly part: CodePart;
    }
  | {
      readonly type: 'code';
      readonly job: number;
      readonly part: CodePart | undefined;
    }
  | { readonly type: 'failed'; readonly message: string };

class ChangedRanges extends Map<string, readonly SyntaxRange[]> {
  readonly changed = new Map<string, readonly SyntaxRange[]>();

  override set(key: string, ranges: readonly SyntaxRange[]): this {
    this.changed.set(key, ranges);
    return super.set(key, ranges);
  }
}

export function serveColoring(
  post: (message: FromSyntax) => void,
  later?: (run: () => void) => void,
): (message: ToSyntax) => void {
  const jobs = new Map<number, () => void>();
  return (message) => {
    const { job } = message;
    if (message.type === 'stop') {
      jobs.get(job)?.();
      jobs.delete(job);
    } else if (message.type === 'color') {
      const { sources } = message;
      const languages = [...new Set(sources.map(({ language }) => language))];
      const ranges = new ChangedRanges();
      const publish = () => {
        if (ranges.changed.size > 0) {
          post({
            type: 'colors',
            job,
            generations: Object.fromEntries(
              languages.map((language) => [language, generationOf(language)]),
            ),
            ranges: [...ranges.changed],
          });
          ranges.changed.clear();
        }
      };
      jobs.set(
        job,
        startColoring(sources, ranges, publish, later, (source, lines) =>
          post({
            type: 'entire',
            job,
            generation: generationOf(sources[source].language),
            source,
            part: packedPart(lines, 0, true),
          }),
        ),
      );
    } else {
      let finished = false;
      const stop = colorCode(
        message.language,
        message.code,
        (part) => {
          if (part === undefined || part.done) {
            finished = true;
            jobs.delete(job);
          }
          post({ type: 'code', job, part });
        },
        later,
      );
      if (!finished) {
        jobs.set(job, stop);
      }
    }
  };
}

export function sendUncaught(
  post: (message: FromSyntax) => void,
): (event: Pick<ErrorEvent, 'error' | 'message' | 'preventDefault'>) => void {
  return (event) => {
    post({ type: 'failed', message: errorText(event.error ?? event.message) });
    event.preventDefault();
  };
}
