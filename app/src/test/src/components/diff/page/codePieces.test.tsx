import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { countingReads } from '../../../../helpers/fixtures';
import { MarkedCode } from '../../../../../components/diff/page/codeMarks';
import { codePieces } from '../../../../../components/diff/page/codePieces';

suite('Drawing code', () => {
  test('marks the copies of the text selected as occurrences, a match of the find over them, and draws each in the mark of an occurrence', () => {
    const { pieces } = codePieces(
      'ab ab ab',
      [],
      [],
      [{ start: 3, end: 5 }],
      undefined,
      [
        { start: 0, end: 2 },
        { start: 3, end: 5 },
        { start: 6, end: 8 },
      ],
    );
    assert.deepStrictEqual(
      pieces?.map(({ start, end, find }) => [start, end, find]),
      [
        [0, 2, 'occurrence'],
        [2, 3, undefined],
        [3, 5, 'match'],
        [5, 6, undefined],
        [6, 8, 'occurrence'],
      ],
    );
    assert.strictEqual(
      renderToStaticMarkup(
        <MarkedCode
          text="ab c"
          syntax={[]}
          words={[]}
          wordClass="word-added"
          found={[]}
          foundNow={undefined}
          copies={[{ start: 0, end: 2 }]}
          whitespace={false}
          spaceSpans
        />,
      ),
      '<mark class="occurrence-match">ab</mark> c',
    );
  });

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
