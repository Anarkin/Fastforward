import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { followDrag } from '../../../../lib/page/followDrag';

type DragListener = (event: { buttons: number }) => void;

function dragTarget() {
  const listeners = new Map<string, Set<DragListener>>();
  return {
    addEventListener: (type: string, listener: DragListener) => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    },
    removeEventListener: (type: string, listener: DragListener) => {
      listeners.get(type)?.delete(listener);
    },
    dispatch: (type: string, buttons: number) => {
      for (const listener of listeners.get(type) ?? []) {
        listener({ buttons });
      }
    },
  };
}

suite('Columns', () => {
  test('stops following a drag the browser cancels or takes the pointer from, or whose button went up unseen', () => {
    for (const [type, buttons] of [
      ['pointercancel', 1],
      ['lostpointercapture', 1],
      ['pointerup', 0],
      ['pointermove', 0],
    ] as const) {
      const target = dragTarget();
      let moves = 0;
      let ends = 0;
      followDrag(
        target,
        () => moves++,
        () => ends++,
      );
      target.dispatch('pointermove', 1);
      target.dispatch(type, buttons);
      target.dispatch('pointermove', 1);
      target.dispatch('pointerup', 0);
      assert.deepStrictEqual([moves, ends], [1, 1], type);
    }
  });
});
