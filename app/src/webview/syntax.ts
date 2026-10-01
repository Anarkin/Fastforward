import { useLayoutEffect, useMemo, useState } from 'react';
import {
  createHighlighterCore,
  type HighlighterCore,
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

const colorOf = (index: number) => `#00000${index + 1}`;

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

function hasGap(file: DiffFile, side: Side): boolean {
  let next = 1;
  for (const hunk of file.hunks) {
    const numbers = hunk.lines.flatMap((line) => {
      const number = side === 'old' ? line.oldNumber : line.newNumber;
      return number === undefined ? [] : [number];
    });
    if (numbers.length === 0) {
      continue;
    }
    if (numbers[0] !== next) {
      return true;
    }
    next = numbers[numbers.length - 1] + 1;
  }
  return false;
}

const maxSourceLines = 5000;

const maxTextLines = 20_000;

function tooFar(shown: ReturnType<typeof sideLines>): boolean {
  return (shown.at(-1)?.number ?? 0) > maxSourceLines;
}

function sideSource(
  file: DiffFile,
  fileIndex: number,
  language: string,
  side: Side,
  text: string | undefined,
): SyntaxSource | undefined {
  const shown = sideLines(file, side);
  if (!shown.some(({ owned }) => owned)) {
    return undefined;
  }
  const keyOf = ({ owned, index }: (typeof shown)[number]) =>
    owned ? lineKey(fileIndex, index) : undefined;
  const lines = tooFar(shown) ? undefined : text?.split(/\r?\n/);
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
  let used = 0;
  return files.flatMap((file, index) => {
    const language = languageOf(file.path);
    if (
      !language ||
      file.binary ||
      file.placeholder ||
      (open && !open.has(index))
    ) {
      return [];
    }
    return sides.flatMap((side) => {
      const source = sideSource(
        file,
        index,
        language,
        side,
        used < maxTextLines ? texts.get(textKey(file.path, side)) : undefined,
      );
      used += source?.lines.length ?? 0;
      return source ?? [];
    });
  });
}

export function textsToLoad(
  files: readonly DiffFile[],
  diff: number,
  requested: Set<string>,
): TextRequest[] {
  return files.flatMap((file) =>
    languageOf(file.path) && !file.binary && !file.placeholder
      ? sides.flatMap((side) => {
          const blob = file.blobs?.[side];
          const key = `${diff}:${textKey(file.path, side)}`;
          const shown = sideLines(file, side);
          if (
            !blob ||
            requested.has(key) ||
            !hasGap(file, side) ||
            !shown.some(({ owned }) => owned) ||
            tooFar(shown)
          ) {
            return [];
          }
          requested.add(key);
          return [{ path: file.path, side, blob }];
        })
      : [],
  );
}

const maxLineLength = 2000;

type LineRanges = readonly (readonly SyntaxRange[])[];

const maxCachedLines = 100_000;
const cache = new Map<string, LineRanges>();
let cachedLines = 0;

function cached(key: string): LineRanges | undefined {
  const ranges = cache.get(key);
  if (ranges) {
    cache.delete(key);
    cache.set(key, ranges);
  }
  return ranges;
}

function tokenize(
  highlighter: HighlighterCore,
  language: string,
  text: string,
): LineRanges {
  const ranges = highlighter
    .codeToTokensBase(text, {
      lang: language,
      theme: theme.name,
      tokenizeMaxLineLength: maxLineLength,
    })
    .map((line) => {
      const found: SyntaxRange[] = [];
      let start = 0;
      for (const token of line) {
        const end = start + token.content.length;
        const kind = kindsByColor.get(token.color?.toLowerCase() ?? '');
        const last = found.at(-1);
        if (kind && last?.kind === kind && last.end === start) {
          found[found.length - 1] = { ...last, end };
        } else if (kind) {
          found.push({ start, end, kind });
        }
        start = end;
      }
      return found;
    });
  cache.set(`${language}\n${text}`, ranges);
  cachedLines += ranges.length;
  for (const [oldest, { length }] of cache) {
    if (cachedLines <= maxCachedLines) {
      break;
    }
    cache.delete(oldest);
    cachedLines -= length;
  }
  return ranges;
}

export function syntaxRanges(
  highlighter: HighlighterCore,
  sources: readonly SyntaxSource[],
  deadline = Infinity,
): {
  ranges: Map<string, readonly SyntaxRange[]>;
  rest: SyntaxSource[];
} {
  const ranges = new Map<string, readonly SyntaxRange[]>();
  const rest: SyntaxSource[] = [];
  let tokenized = false;
  for (const source of sources) {
    if (source.lines.length === 0) {
      continue;
    }
    const text = source.lines.join('\n');
    let found = cached(`${source.language}\n${text}`);
    if (!found && (!tokenized || performance.now() < deadline)) {
      found = tokenize(highlighter, source.language, text);
      tokenized = true;
    }
    if (!found) {
      rest.push(source);
      continue;
    }
    found.forEach((line, index) => {
      const key = source.keys[index];
      if (key !== undefined) {
        ranges.set(key, line);
      }
    });
  }
  return { ranges, rest };
}

let created: Promise<HighlighterCore> | undefined;
let ready: HighlighterCore | undefined;

export async function loadLanguages(
  languages: readonly string[],
): Promise<HighlighterCore> {
  created ??= createHighlighterCore({
    themes: [theme],
    engine: createOnigurumaEngine(import('shiki/wasm')),
  });
  const highlighter = await created;
  const loaded = highlighter.getLoadedLanguages();
  await highlighter.loadLanguage(
    ...(await Promise.all(
      bundledLanguagesInfo
        .filter(
          (info) => languages.includes(info.id) && !loaded.includes(info.id),
        )
        .map((info) => info.import()),
    )),
  );
  ready = highlighter;
  return highlighter;
}

const sliceTime = 10;

const noRanges: ReadonlyMap<string, readonly SyntaxRange[]> = new Map();

interface Colored {
  readonly files: readonly DiffFile[];
  readonly whole: WholeFile | undefined;
  readonly ranges: ReadonlyMap<string, readonly SyntaxRange[]>;
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
  useLayoutEffect(() => {
    let current = true;
    const color = (
      highlighter: HighlighterCore,
      pending: readonly SyntaxSource[],
    ) => {
      if (!current) {
        return;
      }
      const { ranges, rest } = syntaxRanges(
        highlighter,
        pending,
        performance.now() + sliceTime,
      );
      setColored((last) => ({
        files,
        whole,
        ranges:
          last?.files === files && last.whole === whole
            ? new Map([...last.ranges, ...ranges])
            : ranges,
      }));
      if (rest.length > 0) {
        setTimeout(() => color(highlighter, rest));
      }
    };
    const languages = sources.map((source) => source.language);
    const highlighter = ready;
    if (
      highlighter &&
      languages.every((language) =>
        highlighter.getLoadedLanguages().includes(language),
      )
    ) {
      color(highlighter, sources);
    } else {
      void loadLanguages(languages).then((loaded) => color(loaded, sources));
    }
    return () => {
      current = false;
    };
  }, [sources, files, whole]);
  return colored?.files === files && colored.whole === whole
    ? colored.ranges
    : noRanges;
}
