import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { countingReads } from '../../../helpers/fixtures';
import { MarkedCode } from '../../../../lib/page/codeMarks';
import { codePieces } from '../../../../lib/page/codePieces';

suite('Drawing code', () => {
  test('marks a line dense with colors, changed words and matches piece by piece in one pass', () => {
    const pairs = 2000;
    const text = 'ab'.repeat(pairs);
    const every = (offset: number) =>
      Array.from({ length: pairs }, (_, pair) => ({
        start: 2 * pair + offset,
        end: 2 * pair + offset + 1,
      }));
    const colors = every(0).map((range) => ({
      ...range,
      kind: 'keyword' as const,
    }));
    const syntax = countingReads(colors);
    const words = countingReads(every(1));
    const matches = countingReads(every(1));
    const { pieces } = codePieces(
      text,
      syntax.counted,
      words.counted,
      matches.counted,
      undefined,
    );
    for (const { reads } of [syntax, words, matches]) {
      assert.ok(reads <= 10 * pairs, `${reads} reads of ${pairs} ranges`);
    }
    assert.strictEqual(pieces?.length, 2 * pairs);
    assert.ok(
      renderToStaticMarkup(
        <MarkedCode
          text={text}
          syntax={colors}
          words={every(1)}
          wordClass={'word-added'}
          found={every(1)}
          foundNow={undefined}
        />,
      ).endsWith(
        '<span class="syntax-keyword">a</span><span class="word-added"><mark class="find-match ">b</mark></span>',
      ),
    );
  });
});
