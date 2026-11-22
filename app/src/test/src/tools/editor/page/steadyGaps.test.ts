import * as assert from 'node:assert';
import { EditorSelection, EditorState } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  keepLineGapsSteady,
  steadyGaps,
} from '../../../../../tools/editor/page/steadyGaps';

const longLine = 'x'.repeat(6000);
const doc = [longLine, 'short', longLine, 'last'].join('\n');
const second = longLine.length + 'short'.length + 2;

class FakeViewState {
  scrollTarget: { readonly range: { readonly head: number } } | null = null;
  readonly state = EditorState.create({ doc });
  asked: (number | null)[] = [];

  ensureLineGaps(current: readonly unknown[]): unknown {
    this.asked.push(this.scrollTarget?.range.head ?? null);
    return this.scrollTarget === null
      ? [
          { from: 2000, to: 6000, kept: current.length },
          { from: second + 2000, to: second + 6000, kept: current.length },
        ]
      : [
          { from: 0, to: 4000, kept: current.length },
          { from: second, to: second + 4000, kept: current.length },
        ];
  }
}

suite('Stretches of long lines the editor leaves undrawn', () => {
  test('stay where they are in every line but the one the cursor is scrolled to, which alone is drawn around the cursor', () => {
    const seen = [
      { from: 2000, to: 6000 },
      { from: 9000, to: 12_000 },
    ];
    const around = [
      { from: 0, to: 4000 },
      { from: 7000, to: 10_000 },
    ];
    assert.deepStrictEqual(steadyGaps(seen, around, { from: 6500, to: 6600 }), [
      { from: 2000, to: 6000 },
      { from: 9000, to: 12_000 },
    ]);
    assert.deepStrictEqual(
      steadyGaps(seen, around, { from: 6001, to: 12_000 }),
      [
        { from: 2000, to: 6000 },
        { from: 7000, to: 10_000 },
      ],
    );
    assert.deepStrictEqual(steadyGaps(seen, around, { from: 0, to: 6000 }), [
      { from: 0, to: 4000 },
      { from: 9000, to: 12_000 },
    ]);
  });

  test('are asked of CodeMirror as the view shows them for every line the cursor is not in, as it left the start of each long line above the cursor undrawn and drew its end whenever the cursor was scrolled to, at every key, and drew the start again right after, making a thousand elements of one line twice a key', () => {
    const viewState = new FakeViewState();
    const view = { viewState };
    keepLineGapsSteady(view);
    keepLineGapsSteady(view);
    keepLineGapsSteady({ viewState: new FakeViewState() });

    assert.deepStrictEqual(viewState.ensureLineGaps(['one']), [
      { from: 2000, to: 6000, kept: 1 },
      { from: second + 2000, to: second + 6000, kept: 1 },
    ]);
    assert.deepStrictEqual(viewState.asked, [null]);

    const inShort = { range: EditorSelection.cursor(longLine.length + 3) };
    viewState.scrollTarget = inShort;
    viewState.asked = [];
    assert.deepStrictEqual(viewState.ensureLineGaps([]), [
      { from: 2000, to: 6000, kept: 0 },
      { from: second + 2000, to: second + 6000, kept: 0 },
    ]);
    assert.strictEqual(viewState.scrollTarget, inShort);
    assert.deepStrictEqual(viewState.asked, [longLine.length + 3, null]);

    viewState.scrollTarget = { range: EditorSelection.cursor(second + 5000) };
    assert.deepStrictEqual(viewState.ensureLineGaps([]), [
      { from: 2000, to: 6000, kept: 0 },
      { from: second, to: second + 4000, kept: 0 },
    ]);
  });

  test('are left to CodeMirror where it keeps them another way, a view without the stretches asked for as this one asks', () => {
    const other = { viewState: { lineGaps: [] } };
    keepLineGapsSteady(other);
    keepLineGapsSteady({});
    assert.deepStrictEqual(other, { viewState: { lineGaps: [] } });
  });
});
