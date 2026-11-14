import {
  createHighlighterCore,
  type HighlighterCore,
  type LanguageRegistration,
  type ThemeRegistrationRaw,
} from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import { bundledLanguagesInfo } from 'shiki/langs';
import { EncodedTokenMetadata, type StateStack } from 'shiki/textmate';
import { onceMade } from './onceMade';
import { forgetCached } from './syntaxCache';

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
  'entity.name.tag.yaml',
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

const maxLineLength = 20_000;

export type LineRanges = readonly (readonly SyntaxRange[])[];

const registered = new Map<string, LanguageRegistration>();
const generations = new Map<string, number>();

export const generationOf = (language: string) =>
  generations.get(language) ?? 0;

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

const tokenizeTimeLimit = 500;

export interface ColoredLine {
  readonly ranges: readonly SyntaxRange[];
  readonly after: StateStack;
}

export type LineColorer = (line: string, before: StateStack) => ColoredLine;

const statesAfterEmptyLines = new WeakMap<
  object,
  WeakMap<StateStack, StateStack>
>();

export function lineColorer(
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

const highlighterMade = onceMade(() =>
  createHighlighterCore({
    themes: [theme],
    engine: createOnigurumaEngine(import('shiki/wasm')),
  }),
);
export let ready: HighlighterCore | undefined;
export let grammars = 0;

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

export const sliceTime = 10;
export const publishTime = 16;
