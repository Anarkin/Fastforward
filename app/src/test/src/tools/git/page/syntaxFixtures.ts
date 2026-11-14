import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, type ReactElement } from 'react';
import { beforeAll } from 'vitest';
import {
  parsePatch,
  type LoadedText,
} from '../../../../../tools/git/page/diff';
import { syntaxSources } from '../../../../../tools/git/page/syntax';
import {
  loadLanguages,
  tokenizing,
  uncachedSources,
  type FromSyntax,
  type SyntaxRange,
  type ToSyntax,
} from '../../../../../lib/page/syntaxEngine';
import { noop } from '../../../../helpers/fixtures';

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

export const workerSeen: {
  readonly posted: ToSyntax[];
  answer: (message: FromSyntax) => void;
} = { posted: [], answer: noop };

class FakeWorker {
  postMessage(message: ToSyntax) {
    workerSeen.posted.push(message);
  }

  addEventListener(
    type: string,
    listener: (event: { data: FromSyntax }) => void,
  ) {
    if (type === 'message') {
      workerSeen.answer = (data) => listener({ data });
    }
  }
}

export async function inPage(
  run: (render: (element: ReactElement) => Promise<void>) => Promise<void>,
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>');
  const globals = {
    window: dom.window,
    document: dom.window.document,
    location: new URL('file:///page/index.html'),
    IS_REACT_ACT_ENVIRONMENT: true,
    Worker: FakeWorker,
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
  );
  Object.assign(globalThis, globals);
  try {
    const { createRoot } = await import('react-dom/client');
    const main = dom.window.document.querySelector('main');
    assert.ok(main);
    const root = createRoot(main);
    await run(async (element) => {
      await act(async () => {
        root.render(element);
      });
    });
    await act(async () => {
      root.unmount();
    });
  } finally {
    Object.assign(globalThis, saved);
  }
}

export const answered = (message: FromSyntax) =>
  act(async () => {
    workerSeen.answer(message);
  });

export const comment = (end: number) => [
  { start: 0, end, kind: 'comment' as const },
];

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

export async function colored(
  ...args: Parameters<typeof syntaxSources>
): Promise<Record<string, string[]>> {
  const sources = syntaxSources(...args);
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

export const blobs = { old: '1'.repeat(40), new: '2'.repeat(40) };

export function loadedTexts(
  texts: readonly (readonly [string, string])[],
): Map<string, LoadedText> {
  return new Map(
    texts.map(([key, text]) => [
      key,
      { blob: key.startsWith('old:') ? blobs.old : blobs.new, text },
    ]),
  );
}

export const range = (kind: SyntaxRange['kind']) => [
  { start: 0, end: 1, kind },
];

export const linesColored = (far: number) => {
  const text = Array.from({ length: far + 1 }, (_, index) =>
    index === far - 1 ? 'new = 2;' : 'x;',
  ).join('\n');
  const farPatch = [
    'diff --git a/a.ts b/a.ts',
    'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
    '--- a/a.ts',
    '+++ b/a.ts',
    `@@ -${far},1 +${far},1 @@`,
    '-old = 1;',
    '+new = 2;',
    '',
  ].join('\n');
  return syntaxSources(
    parsePatch(farPatch),
    undefined,
    loadedTexts([['new:a.ts', text]]),
  ).map((source) => source.lines);
};

export function warmsUpTheGrammar(): void {
  beforeAll(async function warmUpTheGrammarAsShikiGivesUpOnALinePast500Ms() {
    const highlighter = await loadLanguages(['typescript']);
    highlighter.codeToTokensBase(
      "/** a */ let s = 'x' + `y${1}` + /z/g; // c\nclass C<T> { m(): T[] { return []; } }",
      { lang: 'typescript', theme: highlighter.getLoadedThemes()[0] },
    );
  }, 30_000);
}

export const gappedPatch = [
  'diff --git a/a.ts b/a.ts',
  'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
  '--- a/a.ts',
  '+++ b/a.ts',
  '@@ -3,2 +3,2 @@',
  '-old = 1;',
  '+new = 2;',
  ' end */',
  '',
].join('\n');
