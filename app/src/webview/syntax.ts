import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  createHighlighterCore,
  type GrammarState,
  type HighlighterCore,
  type ThemedToken,
  type ThemeRegistrationRaw,
} from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import { bundledLanguagesInfo } from 'shiki/langs';
import type { TextRequest } from '../shared/protocol';
import { textKey, type DiffFile } from './diff';
import type { WholeFile } from './diffView';
import { lineKey, wholeLines, type FindRange } from './find';

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
  { kind: 'string', scopes: ['string'] },
  { kind: 'number', scopes: ['constant.numeric'] },
  { kind: 'comment', scopes: ['comment', 'punctuation.definition.comment'] },
] as const;

export interface SyntaxRange extends FindRange {
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

const theme: ThemeRegistrationRaw = {
  name: 'fastforward',
  settings: [
    { settings: { foreground: plainColor, background: '#ffffff' } },
    ...kinds.map(({ scopes }, index) => ({
      scope: [...scopes],
      settings: { foreground: colorOf(index) },
    })),
    { scope: plainScopes, settings: { foreground: plainColor } },
  ],
};

const extensionLanguages: Record<string, string> = {
  cjs: 'javascript',
  mjs: 'javascript',
  cts: 'typescript',
  mts: 'typescript',
  h: 'c',
  hpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  htm: 'html',
  csproj: 'xml',
  props: 'xml',
  targets: 'xml',
  svg: 'xml',
};

const languageIds = new Map(
  bundledLanguagesInfo.flatMap((info) =>
    [info.id, ...(info.aliases ?? [])].map((name) => [name, info.id] as const),
  ),
);

export function languageOf(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const extension = name.slice(name.lastIndexOf('.') + 1);
  return (
    languageIds.get(extensionLanguages[extension] ?? extension) ??
    languageIds.get(name)
  );
}

interface SyntaxSource {
  readonly language: string;
  readonly lines: readonly string[];
  readonly keys: readonly (string | undefined)[];
}

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
  texts: ReadonlyMap<string, string> = new Map(),
  open?: ReadonlySet<number>,
): SyntaxSource[] {
  if (whole) {
    const language = languageOf(whole.path);
    const lines = wholeLines(whole).slice(0, maxSourceLines);
    return language
      ? [{ language, lines, keys: lines.map((_, index) => lineKey(0, index)) }]
      : [];
  }
  return sidePlans(files, open).map((plan) =>
    sideSource(plan, texts.get(textKey(plan.file.path, plan.side))),
  );
}

export function textsToLoad(
  files: readonly DiffFile[],
  diff: number,
  requested: Set<string>,
  open?: ReadonlySet<number>,
): TextRequest[] {
  return sidePlans(files, open).flatMap(({ file, side, wholeText }) => {
    const blob = file.blobs?.[side];
    const key = `${diff}:${textKey(file.path, side)}`;
    if (!wholeText || !blob || requested.has(key)) {
      return [];
    }
    requested.add(key);
    return [{ path: file.path, side, blob }];
  });
}

const maxLineLength = 2000;

type LineRanges = readonly (readonly SyntaxRange[])[];

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

function rangesOf(line: readonly ThemedToken[]): SyntaxRange[] {
  const found: SyntaxRange[] = [];
  let start = 0;
  for (const token of line) {
    const end = start + token.content.length;
    const kind = kindsByColor.get(token.color ?? '');
    const last = found.at(-1);
    if (kind && last?.kind === kind && last.end === start) {
      found[found.length - 1] = { ...last, end };
    } else if (kind) {
      found.push({ start, end, kind });
    }
    start = end;
  }
  return found;
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

const chunkChars = 4000;

function chunkEnd(lines: readonly string[], start: number): number {
  let end = start;
  for (let chars = 0; end < lines.length && chars < chunkChars; end += 1) {
    chars += Math.min(lines[end].length, maxLineLength) + 1;
  }
  return end;
}

export function tokenizing(
  highlighter: HighlighterCore,
  pending: readonly Pending[],
): (deadline: number, ranges: Map<string, readonly SyntaxRange[]>) => boolean {
  let generation = grammars;
  let index = 0;
  let done: (readonly SyntaxRange[])[] = [];
  let state: GrammarState | undefined;
  return (deadline, ranges) => {
    while (index < pending.length) {
      if (generation !== grammars) {
        generation = grammars;
        done = [];
        state = undefined;
      }
      const { source, key } = pending[index];
      const start = done.length;
      const chunk = source.lines.slice(start, chunkEnd(source.lines, start));
      const text = chunk.map((line) => line.replace(/\r$/, '')).join('\n');
      const tokens = highlighter.codeToTokensBase(text, {
        lang: source.language,
        theme: theme.name,
        tokenizeMaxLineLength: maxLineLength + 1,
        grammarState: state,
      });
      state = highlighter.getLastGrammarState(tokens);
      const lines = chunk.map((_, line) => rangesOf(tokens[line] ?? []));
      apply(source, lines, ranges, start);
      done.push(...lines);
      if (done.length === source.lines.length) {
        store(key, done);
        index += 1;
        done = [];
        state = undefined;
      }
      if (performance.now() >= deadline) {
        break;
      }
    }
    return index < pending.length;
  };
}

let created: Promise<HighlighterCore> | undefined;
let ready: HighlighterCore | undefined;
let grammars = 0;

export async function loadLanguages(
  languages: readonly string[],
): Promise<HighlighterCore> {
  created ??= createHighlighterCore({
    themes: [theme],
    engine: createOnigurumaEngine(import('shiki/wasm')),
  });
  const highlighter = await created;
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

const maxCodeLines = 5000;

export async function colorCode(
  language: string,
  code: string,
): Promise<LineRanges | undefined> {
  const id = languageIds.get(language.toLowerCase());
  const lines = code.split('\n');
  if (id === undefined || lines.length > maxCodeLines) {
    return undefined;
  }
  const highlighter = await loadLanguages([id]);
  return highlighter
    .codeToTokensBase(code, {
      lang: id,
      theme: theme.name,
      tokenizeMaxLineLength: maxLineLength + 1,
    })
    .map(rangesOf);
}

export interface CodeSegment {
  readonly text: string;
  readonly kind?: SyntaxRange['kind'];
}

export function codeSegments(code: string, lines: LineRanges): CodeSegment[] {
  return code.split('\n').flatMap((line, index) => {
    const segments: CodeSegment[] = index === 0 ? [] : [{ text: '\n' }];
    let at = 0;
    for (const { start, end, kind } of lines[index] ?? []) {
      if (start > at) {
        segments.push({ text: line.slice(at, start) });
      }
      segments.push({ text: line.slice(start, end), kind });
      at = end;
    }
    if (at < line.length) {
      segments.push({ text: line.slice(at) });
    }
    return segments;
  });
}

const sliceTime = 10;
const publishTime = 50;

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
    let published = performance.now();
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

const noRanges: ReadonlyMap<string, readonly SyntaxRange[]> = new Map();

interface Colored {
  readonly files: readonly DiffFile[];
  readonly whole: WholeFile | undefined;
  readonly ranges: Map<string, readonly SyntaxRange[]>;
}

export function useSyntax(
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
  texts: ReadonlyMap<string, string>,
  open: ReadonlySet<number>,
): ReadonlyMap<string, readonly SyntaxRange[]> {
  const sources = useMemo(
    () => syntaxSources(files, whole, texts, open),
    [files, whole, texts, open],
  );
  const [colored, setColored] = useState<Colored>();
  const shown = useRef<Colored>(undefined);
  useLayoutEffect(() => {
    const last = shown.current;
    const ranges =
      last?.files === files && last.whole === whole
        ? last.ranges
        : new Map<string, readonly SyntaxRange[]>();
    return startColoring(sources, ranges, () => {
      shown.current = { files, whole, ranges };
      setColored(shown.current);
    });
  }, [sources, files, whole]);
  return colored?.files === files && colored.whole === whole
    ? colored.ranges
    : noRanges;
}
