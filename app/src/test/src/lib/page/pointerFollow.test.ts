import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import { followPointer } from '../../../../lib/page/pointerFollow';

suite('Following the pointer over a list', () => {
  test('tells where the pointer is as it moves, again from where it last was once the list scrolls under it, so the row it is over is found anew, and nothing once it leaves, until it moves again', () => {
    const { window } = new JSDOM('<!doctype html><main></main>');
    const list = window.document.createElement('div');
    window.document.body.append(list);
    const told: unknown[] = [];
    const stop = followPointer(list, (at) => told.push(at));
    const move = (x: number, y: number) =>
      list.dispatchEvent(
        Object.assign(new window.Event('pointermove'), {
          clientX: x,
          clientY: y,
        }),
      );
    move(10, 20);
    list.dispatchEvent(new window.Event('scroll'));
    list.dispatchEvent(new window.Event('pointerleave'));
    list.dispatchEvent(new window.Event('scroll'));
    move(5, 6);
    stop();
    move(7, 8);
    list.dispatchEvent(new window.Event('scroll'));
    assert.deepStrictEqual(told, [
      { x: 10, y: 20 },
      { x: 10, y: 20 },
      undefined,
      undefined,
      { x: 5, y: 6 },
    ]);
  });
});
