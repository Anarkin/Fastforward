import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { waitFor } from '../../../../helpers/fixtures';
import { warmsUpTheGrammar } from './fixtures';
import {
  serveColoring,
  type FromSyntax,
} from '../../../../../components/syntax/page/serving';

const failing = 'throws here';

vi.mock(
  '../../../../../components/syntax/page/engine',
  async (importOriginal) => {
    const engine =
      await importOriginal<
        typeof import('../../../../../components/syntax/page/engine')
      >();
    return {
      ...engine,
      lineColorer: (...args: Parameters<typeof engine.lineColorer>) => {
        const color = engine.lineColorer(...args);
        return (...line: Parameters<typeof color>) => {
          if (line[0] === failing) {
            throw new Error('the grammar failed on a line');
          }
          return color(...line);
        };
      },
    };
  },
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

const endsOf = (posted: readonly FromSyntax[]) =>
  posted.flatMap((message) =>
    message.type === 'code' && (message.part === undefined || message.part.done)
      ? [[message.job, message.part === undefined ? 'plain' : 'colored']]
      : [],
  );

suite('Coloring away from the page, a grammar failing', () => {
  warmsUpTheGrammar();

  test('ends a job its grammar throws on with no colors, telling the page why, so a code block waiting for its colors shows its text plain rather than waiting for ever, the jobs after it colored still', async () => {
    const { posted, serve, run } = served();
    serve({
      type: 'code',
      job: 3,
      language: 'ts',
      code: `const a = 1;\n${failing}`,
    });
    serve({ type: 'code', job: 4, language: 'ts', code: 'const b = 2;' });
    await waitFor(() => {
      run();
      return endsOf(posted).length === 2;
    }, 'both jobs ended');

    assert.deepStrictEqual(
      endsOf(posted).toSorted(([one], [other]) => Number(one) - Number(other)),
      [
        [3, 'plain'],
        [4, 'colored'],
      ],
    );
    const failed = posted.flatMap((message) =>
      message.type === 'failed' ? [message.message] : [],
    );
    assert.strictEqual(failed.length, 1);
    assert.match(failed[0] ?? '', /the grammar failed on a line/);
  });

  test('ends an edited text its grammar throws on with no colors, so the editor draws it plain, and colors nothing more of it as it is edited', async () => {
    const { posted, serve, run } = served();
    serve({
      type: 'openLines',
      job: 5,
      language: 'ts',
      lines: ['const a = 1;', failing],
    });
    await waitFor(() => {
      run();
      return endsOf(posted).length === 1;
    }, 'the edited text ended');
    serve({
      type: 'editLines',
      job: 5,
      from: 0,
      removed: 1,
      lines: ['const c = 3;'],
    });
    run();

    assert.deepStrictEqual(endsOf(posted), [[5, 'plain']]);
    assert.strictEqual(
      posted.filter((message) => message.type === 'failed').length,
      1,
    );
  });
});
