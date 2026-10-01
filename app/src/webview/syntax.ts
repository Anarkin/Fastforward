import { useEffect, useMemo, useState } from 'react';
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

const maxWholeTextLines = 5000;

function tooFar(shown: ReturnType<typeof sideLines>): boolean {
  return (shown.at(-1)?.number ?? 0) > maxWholeTextLines;
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
    return {
      language,
      lines: shown.map(({ line }) => line.text),
      keys: shown.map(keyOf),
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
): SyntaxSource[] {
  if (whole) {
    const language = languageOf(whole.path);
    const lines = wholeLines(whole);
    return language
      ? [{ language, lines, keys: lines.map((_, index) => lineKey(0, index)) }]
      : [];
  }
  return files.flatMap((file, index) => {
    const language = languageOf(file.path);
    return language && !file.binary && !file.placeholder
      ? sides.flatMap(
          (side) =>
            sideSource(
              file,
              index,
              language,
              side,
              texts.get(textKey(file.path, side)),
            ) ?? [],
        )
      : [];
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

export function syntaxRanges(
  highlighter: HighlighterCore,
  sources: readonly SyntaxSource[],
): Map<string, SyntaxRange[]> {
  const ranges = new Map<string, SyntaxRange[]>();
  for (const { language, lines, keys } of sources) {
    if (lines.length === 0) {
      continue;
    }
    const tokens = highlighter.codeToTokensBase(lines.join('\n'), {
      lang: language,
      theme: theme.name,
      tokenizeMaxLineLength: maxLineLength,
    });
    tokens.forEach((line, index) => {
      const key = keys[index];
      if (key === undefined) {
        return;
      }
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
      ranges.set(key, found);
    });
  }
  return ranges;
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

interface Loaded {
  readonly highlighter: HighlighterCore;
  readonly languages: readonly string[];
}

const snapshot = (highlighter: HighlighterCore): Loaded => ({
  highlighter,
  languages: highlighter.getLoadedLanguages(),
});

export function useSyntax(
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
  texts: ReadonlyMap<string, string>,
): ReadonlyMap<string, readonly SyntaxRange[]> {
  const sources = useMemo(
    () => syntaxSources(files, whole, texts),
    [files, whole, texts],
  );
  const [loaded, setLoaded] = useState(() => ready && snapshot(ready));
  useEffect(() => {
    let current = true;
    void loadLanguages(sources.map((source) => source.language)).then(
      (highlighter) => {
        if (current) {
          setLoaded((last) =>
            last?.languages.length === highlighter.getLoadedLanguages().length
              ? last
              : snapshot(highlighter),
          );
        }
      },
    );
    return () => {
      current = false;
    };
  }, [sources]);
  return useMemo(
    () =>
      loaded
        ? syntaxRanges(
            loaded.highlighter,
            sources.filter((source) =>
              loaded.languages.includes(source.language),
            ),
          )
        : new Map(),
    [loaded, sources],
  );
}
