import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { AnnotationEditorType, AnnotationMode } from 'pdfjs-dist';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import {
  pdfFailure,
  showPdf,
} from '../../../../../tools/commander/page/pdfDocument';

interface Ranges {
  requestDataRange(begin: number, end: number): void;
}

interface Task {
  readonly ranges: Ranges;
  readonly options: Readonly<Record<string, unknown>>;
  readonly opened: PromiseWithResolvers<unknown>;
  destroyed: number;
}

const pdfjs = vi.hoisted(
  (): {
    tasks: Task[];
    viewers: Readonly<Record<string, unknown>>[];
    received: (readonly [number, number])[];
  } => ({ tasks: [], viewers: [], received: [] }),
);

vi.mock('pdfjs-dist', () => ({
  AnnotationEditorType: { DISABLE: -1, NONE: 0 },
  AnnotationMode: { DISABLE: 0, ENABLE: 1, ENABLE_FORMS: 2 },
  GlobalWorkerOptions: { workerSrc: '' },
  InvalidPDFException: class extends Error {},
  PasswordException: class extends Error {},
  PDFDataRangeTransport: class {
    onDataRange(begin: number, chunk: Uint8Array) {
      pdfjs.received.push([begin, chunk.length]);
    }
  },
  getDocument: (options: { readonly range: Ranges }) => {
    const opened = Promise.withResolvers<unknown>();
    const task: Task = {
      ranges: options.range,
      options,
      opened,
      destroyed: 0,
    };
    pdfjs.tasks.push(task);
    return {
      promise: opened.promise,
      destroy: () => {
        task.destroyed++;
        return Promise.resolve();
      },
    };
  },
}));

vi.mock('pdfjs-dist/web/pdf_viewer.mjs', () => ({
  EventBus: class {
    on() {}
    dispatch() {}
  },
  FindState: { PENDING: 3 },
  PDFFindController: class {
    reset() {}
  },
  PDFLinkService: class {
    setViewer() {}
    setDocument() {}
  },
  PDFViewer: class {
    constructor(options: Readonly<Record<string, unknown>>) {
      pdfjs.viewers.push(options);
    }
    cleanup() {}
    setDocument() {}
  },
}));

const container = () =>
  new JSDOM('<!doctype html>').window.document.createElement('div');

function opening(signal = new AbortController().signal) {
  const failures: unknown[] = [];
  const shown = showPdf(
    container(),
    'viewed?file=book.pdf',
    10,
    {
      placeOf: () => Promise.resolve(undefined),
      onPlace: () => undefined,
      onFound: () => undefined,
      onFailure: (error) => failures.push(error),
    },
    signal,
  );
  return { shown, failures };
}

function answering(answer: () => Promise<Response>) {
  vi.stubGlobal('fetch', answer);
}

const lastTask = () => {
  const task = pdfjs.tasks.at(-1);
  assert.ok(task);
  return task;
};

suite('PDF documents', () => {
  beforeEach(() => {
    pdfjs.tasks.length = 0;
    pdfjs.viewers.length = 0;
    pdfjs.received.length = 0;
    vi.stubGlobal('document', { baseURI: 'app://fastforward/' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('starts nothing for a PDF given up on before PDF.js had loaded, as its worker and the observers of its viewer were left running for good', async () => {
    const { shown } = opening(AbortSignal.abort());

    assert.strictEqual(await shown, undefined);
    assert.strictEqual(pdfjs.tasks.length, 0);
    assert.strictEqual(pdfjs.viewers.length, 0);
  });

  test('runs no scripts, forms, XFA or editors of a PDF, drawing only its annotations, as a PDF comes from outside the app', async () => {
    void opening().shown;

    await vi.waitFor(() => assert.strictEqual(pdfjs.viewers.length, 1));
    const [viewer] = pdfjs.viewers;
    assert.deepStrictEqual(
      {
        annotationMode: viewer?.annotationMode,
        annotationEditorMode: viewer?.annotationEditorMode,
        scriptingManager: viewer?.scriptingManager,
        enableXfa: lastTask().options.enableXfa,
      },
      {
        annotationMode: AnnotationMode.ENABLE,
        annotationEditorMode: AnnotationEditorType.DISABLE,
        scriptingManager: undefined,
        enableXfa: false,
      },
    );
  });

  test('hands PDF.js a range of the file read whole', async () => {
    answering(() =>
      Promise.resolve(new Response(new Uint8Array(4), { status: 206 })),
    );
    const { failures } = opening();

    lastTask().ranges.requestDataRange(2, 6);

    await vi.waitFor(() => assert.deepStrictEqual(pdfjs.received, [[2, 4]]));
    assert.deepStrictEqual(failures, []);
    assert.strictEqual(lastTask().destroyed, 0);
  });

  for (const [what, answer] of [
    ['missing', () => Promise.resolve(new Response(null, { status: 404 }))],
    [
      'past its end',
      () => Promise.resolve(new Response(null, { status: 416 })),
    ],
    [
      'shorter than asked',
      () => Promise.resolve(new Response(new Uint8Array(2), { status: 206 })),
    ],
    ['not served', () => Promise.reject(new TypeError('Failed to fetch'))],
  ] as const) {
    test(`says the PDF could not be shown once a range of it read is ${what}, closing it, as PDF.js went on waiting for the range without a word`, async () => {
      answering(answer);
      const { shown, failures } = opening();

      lastTask().ranges.requestDataRange(0, 4);

      assert.strictEqual(await shown, undefined);
      assert.strictEqual(failures.length, 1);
      assert.strictEqual(lastTask().destroyed, 1);
      assert.deepStrictEqual(pdfjs.received, []);
      if (what !== 'not served') {
        assert.strictEqual(
          pdfFailure(failures[0]),
          strings.pdf.couldNotOpen(strings.pdf.partUnread),
        );
      }
    });
  }

  test('says the PDF could not be shown once a range of a PDF shown fails, telling it once however many fail', async () => {
    answering(() => Promise.resolve(new Response(null, { status: 404 })));
    const { shown, failures } = opening();
    lastTask().opened.resolve({ fingerprints: ['book'] });
    assert.strictEqual((await shown)?.fingerprint, 'book');

    lastTask().ranges.requestDataRange(0, 4);
    lastTask().ranges.requestDataRange(4, 8);

    await vi.waitFor(() => assert.strictEqual(failures.length, 1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.strictEqual(failures.length, 1);
    assert.strictEqual(lastTask().destroyed, 1);
  });

  test('tells nothing of the ranges called off once the PDF is given up on', async () => {
    const leaving = new AbortController();
    answering(() =>
      Promise.reject(new DOMException('The operation was aborted.')),
    );
    const { shown, failures } = opening(leaving.signal);

    leaving.abort();
    lastTask().ranges.requestDataRange(0, 4);

    assert.strictEqual(await shown, undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepStrictEqual(failures, []);
    assert.strictEqual(lastTask().destroyed, 1);
  });
});
