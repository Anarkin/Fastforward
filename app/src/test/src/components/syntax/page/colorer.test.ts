import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  colorerOf,
  workerPort,
  type SyntaxPort,
} from '../../../../../components/syntax/page/colorer';
import {
  packedPart,
  type CodePart,
} from '../../../../../components/syntax/page/parts';
import { waitFor } from '../../../../helpers/fixtures';
import { settledNow } from '../../../../helpers/settled';
import { codeLines, warmsUpTheGrammar } from './fixtures';
import { loadLanguages } from '../../../../../components/syntax/page/grammars';
import {
  serveColoring,
  type FromSyntax,
  type ToSyntax,
} from '../../../../../components/syntax/page/serving';

suite('Coloring away from the page', () => {
  warmsUpTheGrammar();

  test('hands each job of the page the colors of its own lines, and a code block its own, dropping a job stopped', async () => {
    await loadLanguages(['typescript']);
    const slices: (() => void)[] = [];
    let received: ((message: FromSyntax) => void) | undefined;
    const port: SyntaxPort = {
      post: (message: ToSyntax) => serve(message),
      listen: (listener) => {
        received = listener;
      },
    };
    const serve = serveColoring(
      (message) => received?.(message),
      (slice) => slices.push(slice),
    );
    const colorer = colorerOf(port);
    const kept: string[] = [];
    const dropped: string[] = [];
    colorer.color(
      [{ language: 'typescript', lines: ['let kept = 3;'], keys: ['0:0'] }],
      (ranges) => kept.push(...ranges.map(([key]) => key)),
    );
    const stop = colorer.color(
      [{ language: 'typescript', lines: ['let dropped = 4;'], keys: ['1:0'] }],
      (ranges) => dropped.push(...ranges.map(([key]) => key)),
    );
    stop();
    while (slices.length > 0) {
      slices.shift()?.();
    }
    assert.deepStrictEqual([kept, dropped], [['0:0'], []]);
    const code = colorer.code('ts', 'let a;');
    await waitFor(() => slices.length > 0, 'the code to be sliced');
    while (slices.length > 0) {
      slices.shift()?.();
    }
    assert.deepStrictEqual((await code)?.[0]?.[0], {
      start: 0,
      end: 3,
      kind: 'keyword',
    });
  });

  test('keeps the page from being taken for settled until the first colors of a job came or it was stopped, so a tab switched to shows with its colors, but for a job in the background, which colors nothing shown', async () => {
    let received: ((message: FromSyntax) => void) | undefined;
    const posted: ToSyntax[] = [];
    const colorer = colorerOf({
      post: (message: ToSyntax) => posted.push(message),
      listen: (listener) => {
        received = listener;
      },
    });
    const source = { language: 'typescript', lines: ['let a;'], keys: ['0:0'] };
    colorer.color([source], () => undefined, undefined, true);
    assert.strictEqual(await settledNow(), true);
    colorer.color([source], () => undefined);
    const stop = colorer.color([source], () => undefined);
    assert.strictEqual(await settledNow(), false);
    received?.({
      type: 'entire',
      job: 2,
      generation: 0,
      source: 0,
      part: packedPart([], 0, true),
    });
    assert.strictEqual(await settledNow(), false);
    received?.({ type: 'colors', job: 2, generations: {}, ranges: [] });
    assert.strictEqual(await settledNow(), false);
    stop();
    assert.strictEqual(await settledNow(), true);
    const parts = colorer.colorParts('ts', 'let a;', () => undefined);
    const edited = colorer.colorEdited('ts', ['let a;'], () => undefined);
    assert.strictEqual(await settledNow(), false);
    received?.({ type: 'code', job: 4, part: undefined });
    assert.strictEqual(await settledNow(), false);
    edited.stop();
    assert.strictEqual(await settledNow(), true);
    parts();
  });

  test('hands the page the colors of code in parts as they are done, and none once it asked to stop', async () => {
    await loadLanguages(['typescript']);
    let received: ((message: FromSyntax) => void) | undefined;
    const colorer = colorerOf({
      post: (message: ToSyntax) => serve(message),
      listen: (listener) => {
        received = listener;
      },
    });
    const serve = serveColoring((message) => received?.(message));
    const parts: CodePart[] = [];
    colorer.colorParts('ts', codeLines(3000), (part) => {
      if (part !== undefined) {
        parts.push(part);
      }
    });
    const stopped: (CodePart | undefined)[] = [];
    const stop = colorer.colorParts('ts', 'let a = 1;', (part) =>
      stopped.push(part),
    );
    stop();
    await waitFor(() => parts.at(-1)?.done === true, 'the last part');
    assert.strictEqual(
      parts.reduce((count, part) => count + part.ends.length, 0),
      3001,
    );
    assert.deepStrictEqual(stopped, []);
  });

  test('drops a code block stopped before it is colored, telling the page nothing of it, as a preview left would keep the worker from the diffs', async () => {
    const posted: FromSyntax[] = [];
    let received: ((message: FromSyntax) => void) | undefined;
    const serve = serveColoring((message) => {
      posted.push(message);
      received?.(message);
    });
    const colorer = colorerOf({
      post: (message: ToSyntax) => serve(message),
      listen: (listener) => {
        received = listener;
      },
    });
    const stopping = new AbortController();
    const dropped = colorer.code('ts', 'let dropped = 5;', stopping.signal);
    stopping.abort();
    assert.strictEqual(await dropped, undefined);
    assert.ok(await colorer.code('ts', 'let kept = 6;'));
    assert.deepStrictEqual(
      posted.map((message) => message.type === 'code' && message.job),
      [2],
    );
  });

  test('reports on the page what failed away from it', () => {
    let received: ((message: FromSyntax) => void) | undefined;
    colorerOf({
      post: () => undefined,
      listen: (listener) => {
        received = listener;
      },
    });
    const reported: unknown[] = [];
    const had: unknown = Reflect.get(globalThis, 'reportError');
    Reflect.set(globalThis, 'reportError', (error: unknown) =>
      reported.push(error),
    );
    try {
      received?.({ type: 'failed', message: 'grammar failed to load' });
    } finally {
      Reflect.set(globalThis, 'reportError', had);
    }
    assert.deepStrictEqual(
      reported.map((error) => (error instanceof Error ? error.message : error)),
      ['grammar failed to load'],
    );
  });

  test('reports a failure the worker could not send, such as one as it loads, once, taking it as handled so the browser does not report it again', () => {
    const worker = Object.assign(new EventTarget(), {
      postMessage: () => undefined,
    });
    const failures: unknown[] = [];
    workerPort(worker).listen(
      () => undefined,
      (error) => failures.push(error),
    );
    const uncaught = Object.assign(new Event('error', { cancelable: true }), {
      error: null,
      message: 'Uncaught Error: grammar failed',
    });
    assert.strictEqual(worker.dispatchEvent(uncaught), false);
    assert.deepStrictEqual(
      failures.map((error) => (error instanceof Error ? error.message : error)),
      ['Uncaught Error: grammar failed'],
    );
  });
});
