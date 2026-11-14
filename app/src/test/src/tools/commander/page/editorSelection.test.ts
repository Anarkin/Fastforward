import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  clampedToEdge,
  nearestRowEdge,
} from '../../../../../tools/commander/page/editorSelection';

suite('Selection of the editor', () => {
  test('puts a mark without a width past the edge of a wrapped row at that edge, and leaves one before it where it is', () => {
    assert.deepStrictEqual(clampedToEdge({ left: 777, width: null }, 400), {
      left: 400,
      width: null,
    });
    assert.deepStrictEqual(clampedToEdge({ left: 65, width: null }, 400), {
      left: 65,
      width: null,
    });
  });

  test('ends a piece of a selection reaching past the edge of a wrapped row at the edge, a piece wholly past it as a sliver at the edge, and leaves one before it as it is', () => {
    assert.deepStrictEqual(clampedToEdge({ left: 65, width: 500 }, 400), {
      left: 65,
      width: 335,
    });
    assert.deepStrictEqual(clampedToEdge({ left: 431, width: 100 }, 400), {
      left: 400,
      width: 0,
    });
    assert.deepStrictEqual(clampedToEdge({ left: 65, width: 100 }, 400), {
      left: 65,
      width: 100,
    });
  });

  test('leaves the cursors and selections of unwrapped lines where they are, as their rows scroll sideways', () => {
    assert.deepStrictEqual(
      clampedToEdge({ left: 777, width: 100 }, undefined),
      { left: 777, width: 100 },
    );
  });

  test('takes a piece of a selection to the edge of the row nearest its own, the top or the bottom of the text a row past the leading around it, an edge between rows staying where it is', () => {
    assert.strictEqual(nearestRowEdge(101, 109, 18), 100);
    assert.strictEqual(nearestRowEdge(117, 109, 18), 118);
    assert.strictEqual(nearestRowEdge(118, 127, 18), 118);
    assert.strictEqual(nearestRowEdge(118, 109, 18), 118);
  });
});
