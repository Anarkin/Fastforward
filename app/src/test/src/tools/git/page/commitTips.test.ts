import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import type {
  BubbleHit,
  Hit,
  RowHit,
} from '../../../../../tools/git/page/commitHits';
import { boxOf, menuOf, tipOf } from '../../../../../tools/git/page/commitTips';

const dot = { left: 1, top: 55, width: 16, height: 16 };

const row: RowHit = {
  index: 3,
  top: 54,
  height: 54,
  subjectLeft: 26,
  subjectWidth: 90,
  bubbles: [],
  merge: dot,
};

const bubbleOf = (
  kind: string,
  text: string,
  { checkedOut = false, cut = false } = {},
): BubbleHit => ({
  left: 20,
  top: 91,
  width: 60,
  height: 16,
  bubble: {
    look: {
      kind,
      text,
      actions: kind === 'branch' ? [{ key: 'pull', count: 2 }] : [],
    },
    checkedOut,
    running: [],
  },
  cut,
  actions: [{ key: 'pull', left: 62, top: 91, width: 18, height: 16 }],
});

const onBubble = (bubble: BubbleHit): Hit => ({ kind: 'bubble', row, bubble });

const words = (said: object) => Reflect.get(said, 'data-tip');

suite('Commit tips', () => {
  test('names a merge by what a click on its dot does, and how many commits it folds away', () => {
    const merge: Hit = { kind: 'merge', row, box: dot };
    assert.strictEqual(
      words(
        tipOf(
          merge,
          'm',
          { lane: 0, color: 0, lines: [], merge: 'expanded' },
          undefined,
        ),
      ),
      'Collapse merge',
    );
    assert.match(
      words(
        tipOf(
          merge,
          'm',
          { lane: 0, color: 0, lines: [], merge: 'collapsed', hidden: 3 },
          undefined,
        ),
      ),
      /3/,
    );
    assert.deepStrictEqual(
      tipOf({ kind: 'row', row }, 'm', undefined, undefined),
      {},
    );
  });

  test('names a bubble only where its name is cut short or it is checked out, a detached HEAD and a bookmarked hash by the commit, and a button by what it does', () => {
    assert.deepStrictEqual(
      tipOf(onBubble(bubbleOf('branch', 'main')), 'a', undefined, undefined),
      {},
    );
    assert.strictEqual(
      words(
        tipOf(
          onBubble(bubbleOf('branch', 'a-long-name', { cut: true })),
          'a',
          undefined,
          undefined,
        ),
      ),
      'a-long-name',
    );
    assert.strictEqual(
      words(
        tipOf(
          onBubble(bubbleOf('branch', 'main', { checkedOut: true })),
          'a',
          undefined,
          undefined,
        ),
      ),
      'main, checked out',
    );
    assert.strictEqual(
      words(
        tipOf(onBubble(bubbleOf('head', 'HEAD')), 'abc', undefined, undefined),
      ),
      'HEAD is detached at abc',
    );
    assert.deepStrictEqual(
      tipOf(onBubble(bubbleOf('stash', 'stash')), 'a', undefined, undefined),
      {},
    );
    const bubble = bubbleOf('branch', 'main');
    const action = bubble.actions[0];
    assert.ok(action);
    const pressed = tipOf(
      { kind: 'action', row, bubble, action },
      'a',
      undefined,
      undefined,
    );
    assert.ok(Reflect.get(pressed, 'aria-label'));
    assert.deepStrictEqual(
      boxOf({ kind: 'action', row, bubble, action }),
      action,
    );
  });

  test('opens the menu of a ref on its bubble, of the commit on a bookmarked hash or detached HEAD, of the commit on the rest of its row, and none on a stash, the working tree or a commit not loaded', () => {
    assert.deepStrictEqual(
      menuOf(onBubble(bubbleOf('branch', 'main')), 'a', new Set()),
      {
        kind: 'ref',
        ref: { kind: 'branch', name: 'main' },
      },
    );
    assert.deepStrictEqual(
      menuOf(onBubble(bubbleOf('hash', 'abc')), 'abc', new Set()),
      {
        kind: 'ref',
        ref: { kind: 'commit', name: 'abc' },
      },
    );
    assert.deepStrictEqual(menuOf({ kind: 'row', row }, 'a', new Set()), {
      kind: 'commit',
      hash: 'a',
    });
    assert.strictEqual(
      menuOf({ kind: 'row', row }, 's', new Set(['s'])),
      undefined,
    );
    assert.strictEqual(
      menuOf(onBubble(bubbleOf('stash', 'stash')), 's', new Set()),
      undefined,
    );
    assert.strictEqual(
      menuOf({ kind: 'row', row }, workingTreeHash, new Set()),
      undefined,
    );
    assert.strictEqual(
      menuOf({ kind: 'row', row }, undefined, new Set()),
      undefined,
    );
  });
});
