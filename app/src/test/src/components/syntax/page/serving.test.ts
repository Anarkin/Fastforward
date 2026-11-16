import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { partLines } from '../../../../../components/syntax/page/parts';
import { waitFor } from '../../../../helpers/fixtures';
import { syntaxRanges, sideKeys, warmsUpTheGrammar } from './fixtures';
import { loadLanguages } from '../../../../../components/syntax/page/grammars';
import {
  sendUncaught,
  serveColoring,
  type FromSyntax,
} from '../../../../../components/syntax/page/serving';

const entireOf = (messages: readonly FromSyntax[]) =>
  messages.flatMap((message) =>
    message.type === 'entire'
      ? [[message.job, message.source, partLines(message.part)]]
      : [],
  );

function served() {
  const posted: FromSyntax[] = [];
  const slices: (() => void)[] = [];
  const serve = serveColoring(
    (message) => posted.push(message),
    (slice) => slices.push(slice),
  );
  const run = () => {
    while (slices.length > 0) {
      slices.shift()?.();
    }
  };
  return { posted, serve, run };
}

suite('Coloring away from the page', () => {
  warmsUpTheGrammar();

  test('sends the colors of a job by the keys the page gave its lines, and nothing more once it is stopped', async () => {
    const highlighter = await loadLanguages(['typescript']);
    const sent = {
      language: 'typescript',
      lines: ['let sent = 1;', 'sent;'],
      keys: ['0:0', undefined],
    };
    const { posted, serve, run } = served();
    serve({ type: 'color', job: 1, sources: [sent] });
    serve({
      type: 'color',
      job: 2,
      sources: [
        { language: 'typescript', lines: ['let stopped = 2;'], keys: ['1:0'] },
      ],
    });
    serve({ type: 'stop', job: 2 });
    run();
    assert.deepStrictEqual(
      posted.map((message) =>
        message.type === 'colors' ? [message.job, message.ranges] : message,
      ),
      [[1, [...syntaxRanges(highlighter, [sent])]]],
    );
  });

  test('sends the colors of every line of a text asked for entire once it is colored, those without a key too, and at once for one colored before, so the page keeps them', async () => {
    const highlighter = await loadLanguages(['typescript']);
    const lines = ['/* entire', 'unkeyed */', 'let entire = 1;'];
    const source = {
      language: 'typescript',
      lines,
      keys: [undefined, undefined, '0:2'],
      entire: true as const,
    };
    const alone = syntaxRanges(highlighter, [
      {
        language: 'typescript',
        lines: [...lines, ''],
        keys: [...sideKeys(0, lines), undefined],
      },
    ]);
    const everyLine = sideKeys(0, lines).map((key) => alone.get(key));
    const { posted, serve, run } = served();
    serve({
      type: 'color',
      job: 5,
      sources: [
        { language: 'typescript', lines: ['let partly = 1;'], keys: ['1:0'] },
        source,
      ],
    });
    run();
    assert.deepStrictEqual(entireOf(posted), [[5, 1, everyLine]]);
    posted.length = 0;
    serve({ type: 'color', job: 6, sources: [source] });
    assert.deepStrictEqual(entireOf(posted), [[6, 0, everyLine]]);
  });

  test('colors a job asked for in the background only while no job in the foreground has a slice left, so a diff read ahead never slows the one shown', async () => {
    await loadLanguages(['typescript']);
    const { posted, serve, run } = served();
    serve({
      type: 'color',
      job: 7,
      background: true,
      sources: [
        { language: 'typescript', lines: ['let behind = 1;'], keys: ['0:0'] },
      ],
    });
    serve({
      type: 'color',
      job: 8,
      sources: [
        { language: 'typescript', lines: ['let ahead = 2;'], keys: ['1:0'] },
      ],
    });
    run();
    assert.deepStrictEqual(
      posted.flatMap((message) =>
        message.type === 'colors' ? [message.job] : [],
      ),
      [8, 7],
    );
  });

  test('colors a code block by its language, and nothing in one it does not know', async () => {
    const { posted, serve, run } = served();
    serve({ type: 'code', job: 3, language: 'TS', code: 'const a = 1;' });
    serve({ type: 'code', job: 4, language: 'no-such-language', code: 'a' });
    await waitFor(() => {
      run();
      return posted.length === 2;
    }, 'the code blocks');
    const lines = new Map(
      posted.flatMap((message) =>
        message.type === 'code'
          ? [
              [
                message.job,
                message.part === undefined
                  ? undefined
                  : partLines(message.part),
              ] as const,
            ]
          : [],
      ),
    );
    assert.deepStrictEqual(lines.get(3)?.[0]?.[0], {
      start: 0,
      end: 5,
      kind: 'keyword',
    });
    assert.ok(lines.has(4));
    assert.strictEqual(lines.get(4), undefined);
  });

  test('sends the page an error left uncaught in the worker, with its stack, taking it as handled so the browser does not report it on the page again', () => {
    const posted: FromSyntax[] = [];
    const error = new Error('grammar failed');
    const uncaught = Object.assign(new Event('error', { cancelable: true }), {
      error,
      message: 'Uncaught Error: grammar failed',
    });
    sendUncaught((message) => posted.push(message))(uncaught);
    assert.ok(uncaught.defaultPrevented);
    assert.deepStrictEqual(posted, [{ type: 'failed', message: error.stack }]);
  });
});
