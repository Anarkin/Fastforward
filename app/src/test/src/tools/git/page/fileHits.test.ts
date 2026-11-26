import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  fileHitAt,
  type FileHit,
} from '../../../../../tools/git/page/fileHits';

const row = (index: number, top: number, pinned = false): FileHit => ({
  index,
  top,
  height: 18,
  width: 200,
  pinned,
  nameLeft: 40,
  mark: { left: 8, width: 14 },
  parts: [
    { text: 'src', left: 40, width: 21, whole: '/repo/src', file: false },
    { text: 'a.ts', left: 68, width: 28, whole: '/repo/src/a.ts', file: true },
  ],
});

suite('Hits of the files', () => {
  test('finds the mark, a part of the path or the row under the pointer, and nothing beside the rows', () => {
    const hits = [row(0, 0), row(1, 18)];
    assert.strictEqual(fileHitAt(hits, 10, 20)?.kind, 'mark');
    const part = fileHitAt(hits, 70, 20);
    assert.ok(part?.kind === 'part');
    assert.strictEqual(part.part.whole, '/repo/src/a.ts');
    assert.strictEqual(fileHitAt(hits, 150, 20)?.kind, 'row');
    assert.strictEqual(fileHitAt(hits, 250, 20), undefined);
    assert.strictEqual(fileHitAt(hits, 10, 40), undefined);
  });

  test('gives the pointer to a folder pinned at the top over the row scrolled under it', () => {
    const hits = [row(5, -4), row(6, 14), row(2, 0, true)];
    assert.strictEqual(fileHitAt(hits, 150, 10)?.row.index, 2);
    assert.strictEqual(fileHitAt(hits, 150, 20)?.row.index, 6);
  });
});
