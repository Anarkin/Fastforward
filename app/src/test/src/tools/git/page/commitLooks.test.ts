import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  keptLooksOf,
  lookIn,
  type RowLook,
} from '../../../../../tools/git/page/commitLooks';

const commit = (subject: string, selected = false): RowLook => ({
  kind: 'commit',
  subject,
  author: 'Ann',
  date: '2026-01-01 10:00',
  checkedOut: false,
  selected,
  compareFrom: false,
  bubbles: [],
  lines: undefined,
});

suite('Commit looks', () => {
  test('keeps the look of a row while what it depends on is as it was, so the canvas draws it again only once it changes', () => {
    let built = 0;
    const fresh = (index: number) => {
      built++;
      return commit(`c${index}`);
    };
    const kept = keptLooksOf(undefined, ['history', 'a']);
    const first = lookIn(kept, 1, fresh);
    assert.strictEqual(lookIn(kept, 1, fresh), first);
    assert.strictEqual(keptLooksOf(kept, ['history', 'a']), kept);
    assert.strictEqual(built, 1);
  });

  test('keeps the look of every row a change leaves as it was, so selecting a commit draws again only the rows selected and unselected', () => {
    const kept = keptLooksOf(undefined, ['history', 'c1']);
    const before = [0, 1, 2].map((index) =>
      lookIn(kept, index, (at) => commit(`c${at}`, at === 1)),
    );
    const renewed = keptLooksOf(kept, ['history', 'c2']);
    assert.notStrictEqual(renewed, kept);
    const after = [0, 1, 2].map((index) =>
      lookIn(renewed, index, (at) => commit(`c${at}`, at === 2)),
    );
    assert.strictEqual(after[0], before[0]);
    assert.notStrictEqual(after[1], before[1]);
    assert.notStrictEqual(after[2], before[2]);
    assert.strictEqual(after[2]?.kind === 'commit' && after[2].selected, true);
  });

  test('builds no look for a row the list cannot tell yet', () => {
    const kept = keptLooksOf(undefined, []);
    assert.strictEqual(
      lookIn(kept, 3, () => undefined),
      undefined,
    );
    assert.strictEqual(kept.looks.size, 0);
  });
});
