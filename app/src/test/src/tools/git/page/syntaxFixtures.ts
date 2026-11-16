import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, type ReactElement } from 'react';
import { parsePatch } from '../../../../../components/diff/page/diff';
import type { LoadedText } from '../../../../../components/diff/page/sideTexts';
import { syntaxSources } from '../../../../../components/diff/page/diffSyntaxSources';
import { noop } from '../../../../helpers/fixtures';
import type { SyntaxRange } from '../../../../../components/syntax/page/engine';
import type {
  FromSyntax,
  ToSyntax,
} from '../../../../../components/syntax/page/serving';
import { coloredSources } from '../../../components/syntax/page/fixtures';

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

export const colored = (...args: Parameters<typeof syntaxSources>) =>
  coloredSources(syntaxSources(...args));

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

export const keptPatch = (oldBlob: string, newBlob: string) =>
  parsePatch(
    gappedPatch.replace(
      `${blobs.old}..${blobs.new}`,
      `${oldBlob.repeat(40)}..${newBlob.repeat(40)}`,
    ),
  );

export const addedPatch = [
  'diff --git a/a.ts b/a.ts',
  'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
  '--- a/a.ts',
  '+++ b/a.ts',
  '@@ -3,1 +3,2 @@',
  ' end */',
  '+new = 2;',
  '',
].join('\n');

export const paths = ['a.ts', 'b.ts', 'c.ts'];

export const farFiles = parsePatch(
  paths
    .flatMap((path) => [
      `diff --git a/${path} b/${path}`,
      'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
      '@@ -5000,1 +5000,1 @@',
      '-old;',
      '+new;',
    ])
    .concat('')
    .join('\n'),
);
