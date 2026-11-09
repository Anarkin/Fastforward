import {
  createHighlighterCore,
  type HighlighterCore,
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

export interface SyntaxSource {
  readonly language: string;
  readonly lines: readonly string[];
  readonly keys: readonly (string | undefined)[];
}

const maxLineLength = 20_000;

export type LineRanges = readonly (readonly SyntaxRange[])[];

const maxCachedLines = 100_000;
const maxCachedChars = 8_000_000;
const cache = new Map<string, LineRanges>();
let cachedLines = 0;
let cachedChars = 0;

function cached(key: string): LineRanges | undefined {
  const ranges = cache.get(key);
  if (ranges) {
    cache.delete(key);
    cache.set(key, ranges);
  }
  return ranges;
}

function textLength(key: string): number {
  return key.length - key.indexOf('\n') - 1;
}

function store(key: string, ranges: LineRanges) {
  if (textLength(key) > maxCachedChars / 4 || cache.has(key)) {
    return;
  }
  cache.set(key, ranges);
  cachedLines += ranges.length;
  cachedChars += textLength(key);
  for (const [oldest, { length }] of cache) {
    if (cachedLines <= maxCachedLines && cachedChars <= maxCachedChars) {
      break;
    }
    cache.delete(oldest);
    cachedLines -= length;
    cachedChars -= textLength(oldest);
  }
}

const tokenizeTimeLimit = 500;

interface ColoredLine {
  readonly ranges: readonly SyntaxRange[];
  readonly after: StateStack;
}

type LineColorer = (line: string, before: StateStack) => ColoredLine;

function lineColorer(
  highlighter: HighlighterCore,
  language: string,
): LineColorer {
  const grammar = highlighter.getLanguage(language);
  const kindsByIndex = highlighter
    .setTheme(themeName)
    .colorMap.map((color) => kindsByColor.get(color));
  return (text, before) => {
    const line = text.replace(/\r$/, '');
    if (line === '' || line.length > maxLineLength) {
      return { ranges: [], after: before };
    }
    const { tokens, ruleStack } = grammar.tokenizeLine2(
      line,
      before,
      tokenizeTimeLimit,
    );
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

interface Pending {
  readonly source: SyntaxSource;
  readonly key: string;
}

export function uncachedSources(
  sources: readonly SyntaxSource[],
  ranges: Map<string, readonly SyntaxRange[]>,
): Pending[] {
  return sources.flatMap((source) => {
    if (source.lines.length === 0) {
      return [];
    }
    const key = `${source.language}\n${source.lines.join('\n')}`;
    const found = cached(key);
    if (found) {
      apply(source, found, ranges);
      return [];
    }
    return [{ source, key }];
  });
}

export function tokenizing(
  highlighter: HighlighterCore,
  pending: readonly Pending[],
): (deadline: number, ranges: Map<string, readonly SyntaxRange[]>) => boolean {
  let generation = grammars;
  let index = 0;
  let done: (readonly SyntaxRange[])[] = [];
  let state = INITIAL;
  let color: LineColorer | undefined;
  return (deadline, ranges) => {
    while (index < pending.length) {
      if (generation !== grammars) {
        generation = grammars;
        done = [];
        state = INITIAL;
        color = undefined;
      }
      const { source, key } = pending[index];
      color ??= lineColorer(highlighter, source.language);
      const line = color(source.lines[done.length], state);
      apply(source, [line.ranges], ranges, done.length);
      done.push(line.ranges);
      state = line.after;
      if (done.length === source.lines.length) {
        store(key, done);
        index += 1;
        done = [];
        state = INITIAL;
        color = undefined;
      }
      if (performance.now() >= deadline) {
        break;
      }
    }
    return index < pending.length;
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
    grammars += 1;
    cache.clear();
    cachedLines = 0;
    cachedChars = 0;
  }
  ready = highlighter;
  return highlighter;
}

export function makeHighlighter(): Promise<HighlighterCore> {
  return loadLanguages([]);
}

const sliceTime = 10;
const publishTime = 50;

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
      publish(packedPart(found, 0, true));
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
        store(key, all);
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
): () => void {
  let current = true;
  let job = 0;
  const pending = uncachedSources(sources, ranges);
  publish();
  const work = (highlighter: HighlighterCore, todo: readonly Pending[]) => {
    const step = tokenizing(highlighter, todo);
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
          work(highlighter, uncachedSources(sources, ranges));
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
      readonly ranges: readonly (readonly [string, readonly SyntaxRange[]])[];
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
      const ranges = new ChangedRanges();
      const publish = () => {
        if (ranges.changed.size > 0) {
          post({ type: 'colors', job, ranges: [...ranges.changed] });
          ranges.changed.clear();
        }
      };
      jobs.set(job, startColoring(message.sources, ranges, publish, later));
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
