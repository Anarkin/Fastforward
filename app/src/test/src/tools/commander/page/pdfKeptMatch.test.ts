import * as assert from 'node:assert';
import { afterAll, beforeAll, suite, test } from 'vitest';
import type * as PdfViewer from 'pdfjs-dist/web/pdf_viewer.mjs';
import {
  reportFinds,
  type PdfFound,
} from '../../../../../tools/commander/page/pdfFinds';
import { KeptMatch } from '../../../../../tools/commander/page/pdfKeptMatch';
import { waitFor } from '../../../../helpers/fixtures';

const shims: Readonly<Record<string, unknown>> = {
  window: {
    requestAnimationFrame: (frame: () => void) => setTimeout(frame, 0),
  },
  DOMMatrix: function DOMMatrix() {},
  Path2D: function Path2D() {},
  ImageData: function ImageData() {},
  document: {
    documentElement: { style: {} },
    createElement: () => ({ style: {}, getContext: () => null }),
  },
};

let viewer: typeof PdfViewer;
const replaced = new Map<string, PropertyDescriptor | undefined>();

const placed = (name: string, value: unknown) => {
  replaced.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
};

function getOrInsertComputed(
  this: Map<unknown, unknown>,
  key: unknown,
  make: (key: unknown) => unknown,
): unknown {
  if (!this.has(key)) {
    this.set(key, make(key));
  }
  return this.get(key);
}

beforeAll(async () => {
  for (const [name, value] of Object.entries(shims)) {
    if (Reflect.get(globalThis, name) === undefined) {
      placed(name, value);
    }
  }
  if (!('getOrInsertComputed' in Map.prototype)) {
    Reflect.defineProperty(Map.prototype, 'getOrInsertComputed', {
      configurable: true,
      writable: true,
      value: getOrInsertComputed,
    });
  }
  placed('pdfjsLib', await import('pdfjs-dist'));
  viewer = await import('pdfjs-dist/web/pdf_viewer.mjs');
});

afterAll(() => {
  for (const [name, descriptor] of replaced) {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, name);
    } else {
      Object.defineProperty(globalThis, name, descriptor);
    }
  }
});

function searching(pages: readonly string[], wanted: number) {
  const eventBus = new viewer.EventBus();
  const controller = Reflect.construct(viewer.PDFFindController, [
    {
      eventBus,
      linkService: { pagesCount: pages.length, page: 1 },
      updateMatchesCountOnProgress: true,
    },
  ]);
  Reflect.apply(Reflect.get(controller, 'setDocument'), controller, [
    {
      numPages: pages.length,
      getPage: (number: number) =>
        Promise.resolve({
          getTextContent: () =>
            Promise.resolve({
              items: [{ str: pages[number - 1] ?? '', hasEOL: false }],
            }),
        }),
    },
  ]);
  const found: PdfFound[] = [];
  let steps = 0;
  const find = (step: 0 | 1 | -1) =>
    eventBus.dispatch('find', {
      source: null,
      type: step === 0 ? '' : 'again',
      query: 'adam',
      highlightAll: true,
      findPrevious: step === -1,
      matchDiacritics: false,
    });
  const kept = new KeptMatch(wanted);
  reportFinds(
    eventBus,
    controller,
    () => pages.length,
    viewer.FindState.PENDING,
    (each) => {
      found.push(each);
      kept.found(each, (by) => {
        steps += 1;
        find(by);
      });
    },
  );
  find(0);
  return { found, kept, steps: () => steps };
}

const pages = ['adam adam', 'eve', 'adam adam adam', 'eve adam'];

suite('Coming back to the match of a PDF it was left on', () => {
  test('steps from the first match PDF.js lands on to the one kept the shorter way round, once PDF.js has searched every page, a step at a time', async () => {
    const { found, kept, steps } = searching(pages, 5);

    await waitFor(() => kept.kept === undefined, 'the match kept reached');

    assert.deepStrictEqual(found.at(-1), {
      current: 5,
      total: 6,
      done: true,
      settled: true,
    });
    assert.strictEqual(steps(), 2);
  });

  test('steps forward to a match a little ahead', async () => {
    const { found, kept, steps } = searching(pages, 3);

    await waitFor(() => kept.kept === undefined, 'the match kept reached');

    assert.strictEqual(found.at(-1)?.current, 3);
    assert.strictEqual(steps(), 2);
  });

  test('gives up the match kept once the PDF has fewer, stepping nowhere', async () => {
    const { found, kept, steps } = searching(pages, 9);

    await waitFor(() => kept.kept === undefined, 'the match kept given up');

    assert.strictEqual(found.at(-1)?.current, 1);
    assert.strictEqual(steps(), 0);
  });
});
