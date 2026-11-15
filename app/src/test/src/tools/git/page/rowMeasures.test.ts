import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { DiffRow } from '../../../../../tools/git/page/diffRows';
import {
  rowHeight,
  rowMeasures,
  rowOverscan,
  sameRowInput,
} from '../../../../../tools/git/page/rowMeasures';

suite('Drawing code', () => {
  test('draws only one row beyond those in view while the diff is dragged by its scrollbar, enough for it to snap to whole lines, as a drag jumps past more, and drawing them made every step of it slow, but the wheel and keys scroll into them', () => {
    assert.strictEqual(rowOverscan(true), 1);
    assert.ok(rowOverscan(false) > 0);
  });

  test('draws a row anew only once the row or what it is drawn from changed, not on every scroll of the diff, as drawing every row shown on every step of a drag made dragging the scrollbar of a large diff slow', () => {
    const row: DiffRow = { kind: 'hunk', file: 0 };
    const words = new Map();
    const drawn = (inputs: readonly unknown[], index = 3, shown = row) => ({
      row: shown,
      index,
      inputs,
      render: () => null,
    });

    assert.ok(sameRowInput(drawn([words, 17]), drawn([words, 17])));
    assert.ok(!sameRowInput(drawn([words, 17]), drawn([new Map(), 17])));
    assert.ok(!sameRowInput(drawn([words, 17]), drawn([words, 18])));
    assert.ok(!sameRowInput(drawn([words, 17]), drawn([words, 17], 4)));
    assert.ok(
      !sameRowInput(drawn([words, 17]), drawn([words, 17], 3, { ...row })),
    );
  });
});

suite('Renamed files', () => {
  test('makes every row a whole number of code lines tall, so the diff scrolls by whole lines, an empty one none', () => {
    const line = 16.8;
    assert.strictEqual(rowHeight({ kind: 'hunk', file: 0 }, false, line), line);
    assert.strictEqual(
      rowHeight({ kind: 'binary', file: 0 }, false, line),
      line,
    );
    assert.strictEqual(
      rowHeight({ kind: 'image', file: 0 }, false, line),
      19 * line,
    );
    const measured = rowMeasures([{ kind: 'error' }], undefined, line, 1.25);
    const preview = measured.measureElement(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      {} as Element,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      { borderBoxSize: [{ blockSize: 400 }] } as unknown as ResizeObserverEntry,
    );
    assert.ok(Math.abs(preview - 24 * line) < 1e-6, String(preview));
    const nothing = measured.measureElement(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      {} as Element,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      { borderBoxSize: [{ blockSize: 0 }] } as unknown as ResizeObserverEntry,
    );
    assert.strictEqual(Math.abs(nothing), 0);
  });
});
