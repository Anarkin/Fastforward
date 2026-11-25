import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import {
  clickOf,
  hitAt,
  hitKey,
  type BubbleHit,
  type RowHit,
} from '../../../../../tools/git/page/commitHits';

const bubble: BubbleHit = {
  left: 20,
  top: 37,
  width: 60,
  height: 16,
  bubble: {
    look: {
      kind: 'branch',
      text: 'main',
      actions: [{ key: 'push', count: 0 }],
    },
    checkedOut: true,
    running: [],
  },
  cut: false,
  actions: [{ key: 'push', left: 62, top: 37, width: 18, height: 16 }],
};

const rows: readonly RowHit[] = [
  {
    index: 0,
    top: 0,
    height: 18,
    subjectLeft: 26,
    subjectWidth: 120,
    bubbles: [],
    merge: undefined,
  },
  {
    index: 1,
    top: 18,
    height: 54,
    subjectLeft: 26,
    subjectWidth: 90,
    bubbles: [bubble],
    merge: { left: 1, top: 19, width: 16, height: 16 },
  },
];

suite('Commit hits', () => {
  test('finds the row under the pointer, and nothing above or below the rows drawn', () => {
    assert.strictEqual(hitAt(rows, 100, 5)?.row.index, 0);
    assert.strictEqual(hitAt(rows, 100, 30)?.kind, 'row');
    assert.strictEqual(hitAt(rows, 100, 30)?.row.index, 1);
    assert.strictEqual(hitAt(rows, 100, -1), undefined);
    assert.strictEqual(hitAt(rows, 100, 72), undefined);
  });

  test('finds the dot of a merge, a bubble and a button of a bubble before the row they are in', () => {
    assert.strictEqual(hitAt(rows, 8, 26)?.kind, 'merge');
    assert.strictEqual(hitAt(rows, 30, 45)?.kind, 'bubble');
    const action = hitAt(rows, 70, 45);
    assert.strictEqual(action?.kind, 'action');
    assert.strictEqual(action.kind === 'action' && action.action.key, 'push');
  });

  test('names each target of a tooltip apart, and none for a row itself, which has no tooltip', () => {
    assert.strictEqual(hitKey(hitAt(rows, 100, 30)), undefined);
    assert.strictEqual(hitKey(hitAt(rows, 8, 26)), '1:merge');
    assert.strictEqual(hitKey(hitAt(rows, 30, 45)), '1:0');
    assert.strictEqual(hitKey(hitAt(rows, 70, 45)), '1:0:push');
  });

  test('selects the row clicked, the working tree too, and compares with it on a click with Ctrl, or Cmd on macOS', () => {
    assert.deepStrictEqual(
      clickOf(hitAt(rows, 100, 5), workingTreeHash, false),
      {
        kind: 'select',
        hash: workingTreeHash,
      },
    );
    assert.deepStrictEqual(
      clickOf(hitAt(rows, 100, 5), workingTreeHash, true),
      {
        kind: 'compare',
        hash: workingTreeHash,
      },
    );
    assert.deepStrictEqual(clickOf(hitAt(rows, 30, 45), 'a', false), {
      kind: 'select',
      hash: 'a',
    });
  });

  test('expands or collapses a merge clicked on its dot, acts on a button of a bubble rather than selecting its commit, and does nothing on a commit not loaded yet', () => {
    assert.deepStrictEqual(clickOf(hitAt(rows, 8, 26), 'm', false), {
      kind: 'merge',
      hash: 'm',
    });
    assert.strictEqual(
      clickOf(hitAt(rows, 70, 45), 'a', false)?.kind,
      'action',
    );
    assert.strictEqual(
      clickOf(hitAt(rows, 100, 30), undefined, false),
      undefined,
    );
    assert.strictEqual(clickOf(undefined, 'a', false), undefined);
  });
});
