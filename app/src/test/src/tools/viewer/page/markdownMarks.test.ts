import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { markdownMarks } from '../../../../../tools/viewer/page/markdownMarks';

const rounded = (marks: ReturnType<typeof markdownMarks>) =>
  marks.map(({ kind, top, height }) => ({
    kind,
    top: Math.round(top * 1e6) / 1e6,
    height: Math.round(height * 1e6) / 1e6,
  }));

suite('Marks of a Markdown preview', () => {
  test('marks each match on the track where the thumb comes to stand once the match is at the top, as the text views mark theirs, in the order of the document whatever order they were found in', () => {
    assert.deepStrictEqual(
      rounded(
        markdownMarks(
          [
            { top: 300, height: 20 },
            { top: 0, height: 20 },
          ],
          1000,
          500,
        ),
      ),
      [
        { kind: 'match', top: 0, height: 0.02 },
        { kind: 'match', top: 0.3, height: 0.02 },
      ],
    );
  });

  test('draws matches closer than two pixels of the track as one mark, so a paragraph of matches is one mark rather than a smear', () => {
    assert.deepStrictEqual(
      rounded(
        markdownMarks(
          [
            { top: 100, height: 1 },
            { top: 102, height: 1 },
          ],
          1000,
          500,
        ),
      ),
      [{ kind: 'match', top: 0.1, height: 0.006 }],
    );
  });

  test('marks nothing in a preview of no height, as a tab not shown yet has', () => {
    assert.deepStrictEqual(markdownMarks([{ top: 0, height: 20 }], 0, 500), []);
  });

  test('marks the current match in its own color over the others, at least two pixels of the track tall, so the track shows where the search is', () => {
    assert.deepStrictEqual(
      rounded(
        markdownMarks(
          [
            { top: 0, height: 20 },
            { top: 300, height: 20 },
          ],
          1000,
          500,
          { top: 300, height: 1 },
        ),
      ),
      [
        { kind: 'match', top: 0, height: 0.02 },
        { kind: 'match', top: 0.3, height: 0.02 },
        { kind: 'current', top: 0.3, height: 0.004 },
      ],
    );
  });
});
