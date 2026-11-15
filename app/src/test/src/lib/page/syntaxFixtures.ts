import * as assert from 'node:assert';
import { beforeAll } from 'vitest';
import { languageOf } from '../../../../lib/page/languages';
import {
  loadLanguages,
  type SyntaxRange,
} from '../../../../lib/page/syntaxEngine';
import {
  tokenizing,
  uncachedSources,
} from '../../../../lib/page/syntaxSources';

export type Highlighter = Awaited<ReturnType<typeof loadLanguages>>;

export function syntaxRanges(
  highlighter: Highlighter,
  sources: Parameters<typeof uncachedSources>[0],
) {
  const ranges = new Map<string, readonly SyntaxRange[]>();
  tokenizing(highlighter, uncachedSources(sources, ranges))(Infinity, ranges);
  return ranges;
}

export function countingLines(highlighter: Highlighter) {
  const lines: string[] = [];
  const counting: Highlighter = {
    ...highlighter,
    getLanguage: (...args) => {
      const grammar = highlighter.getLanguage(...args);
      const tokenizeLine2: typeof grammar.tokenizeLine2 = (...line) => {
        lines.push(line[0]);
        return grammar.tokenizeLine2(...line);
      };
      return new Proxy(grammar, {
        get: (target, name) =>
          name === 'tokenizeLine2' ? tokenizeLine2 : Reflect.get(target, name),
      });
    },
  };
  return { counting, tokenized: () => lines.length, lines };
}

export const sideKeys = (side: number, lines: readonly string[]) =>
  lines.map((_, index) => `${side}:${index}`);

export function onTickingClock(from: number, run: () => void) {
  const now = performance.now.bind(performance);
  let clock = from;
  performance.now = () => (clock += 1);
  try {
    run();
  } finally {
    performance.now = now;
  }
}

export async function assertNotLoaded(language: string) {
  assert.ok(
    !(await loadLanguages([])).getLoadedLanguages().includes(language),
    `${language} was loaded before this test, so it cannot see it load`,
  );
}

export async function coloredSources(
  sources: Parameters<typeof uncachedSources>[0],
): Promise<Record<string, string[]>> {
  const highlighter = await loadLanguages(sources.map((s) => s.language));
  const texts = new Map(
    sources.flatMap((source) =>
      source.keys.map((key, index) => [key, source.lines[index]] as const),
    ),
  );
  return Object.fromEntries(
    [...syntaxRanges(highlighter, sources)].map(([key, ranges]) => [
      key,
      ranges.map(
        (range) =>
          `${range.kind} ${texts.get(key)?.slice(range.start, range.end)}`,
      ),
    ]),
  );
}

export function coloredText(
  path: string,
  content: string,
): Promise<Record<string, string[]>> {
  const language = languageOf(path);
  assert.ok(language, path);
  const lines = content.replace(/\n$/, '').split('\n');
  return coloredSources([{ language, lines, keys: sideKeys(0, lines) }]);
}

export const codeLines = (count: number) =>
  Array.from({ length: count }, () => 'let a = 1;\n').join('');

export function warmsUpTheGrammar(): void {
  beforeAll(async function warmUpTheGrammarAsShikiGivesUpOnALinePast500Ms() {
    const highlighter = await loadLanguages(['typescript']);
    highlighter.codeToTokensBase(
      "/** a */ let s = 'x' + `y${1}` + /z/g; // c\nclass C<T> { m(): T[] { return []; } }",
      { lang: 'typescript', theme: highlighter.getLoadedThemes()[0] },
    );
  }, 30_000);
}
