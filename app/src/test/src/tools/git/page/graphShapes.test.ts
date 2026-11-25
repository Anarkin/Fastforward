import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { GraphRow } from '../../../../../tools/git/shared/protocol';
import {
  dashesOf,
  graphShapes,
  laneMiddle,
  lineDevicePixels,
  type GraphRowPlace,
} from '../../../../../tools/git/page/graphShapes';

const passing: GraphRow = {
  lane: 0,
  color: 0,
  lines: [
    { from: 0, to: 0, color: 0, bottom: false },
    { from: 0, to: 0, color: 0, bottom: true },
    { from: 1, to: 1, color: 1, bottom: false },
    { from: 1, to: 1, color: 1, bottom: true },
  ],
};

const stacked = (rows: readonly GraphRow[], height = 20): GraphRowPlace[] =>
  rows.map((row, at) => ({ row, top: at * height, height }));

const isWhole = (value: number) => Number.isInteger(value);

const merged = (row: Partial<GraphRow>) =>
  graphShapes(stacked([{ lane: 0, color: 3, lines: [], ...row }]), 0, 20, 1);

suite('Graph shapes', () => {
  test('draws a lane straight down as rects on whole device pixels, a line wide as two pixels rounded to whole device pixels, at 100%, 125% and 150% alike, a lane passing a dot of another lane unbroken from the top of the row to its foot', () => {
    for (const [scale, width] of [
      [1, 2],
      [1.25, 2],
      [1.5, 3],
    ] as const) {
      const { rects } = graphShapes(stacked([passing]), 0, 20, scale);
      const lane = rects.filter((rect) => rect.color === 1);
      assert.ok(lane.length > 0, String(scale));
      for (const rect of lane) {
        assert.ok(
          [rect.x, rect.y, rect.width, rect.height].every(isWhole),
          `${scale}: ${JSON.stringify(rect)}`,
        );
        assert.strictEqual(rect.width, width, String(scale));
        assert.strictEqual(lineDevicePixels(scale), width);
      }
      const covered = lane
        .map(({ y, height }) => [y, y + height])
        .toSorted(([a = 0], [b = 0]) => a - b);
      assert.deepStrictEqual(
        [covered[0]?.[0], covered.at(-1)?.[1]],
        [0, Math.round(20 * scale)],
        String(scale),
      );
      for (let at = 1; at < covered.length; at++) {
        assert.strictEqual(
          covered[at]?.[0],
          covered[at - 1]?.[1],
          String(scale),
        );
      }
    }
  });

  test('stops the lines of the lane of a dot short of the dot, by the edge of the ground the dot was drawn with, and draws the dot as a disc in its middle, as wide as the dot showed inside that edge', () => {
    const { rects, discs } = graphShapes(stacked([passing]), 0, 20, 1);
    assert.deepStrictEqual(discs, [{ x: 9, y: 10, radius: 3.25, color: 0 }]);
    assert.deepStrictEqual(
      rects
        .filter((rect) => rect.color === 0)
        .map(({ y, height }) => [y, y + height]),
      [
        [0, 5],
        [15, 20],
      ],
    );
  });

  test('cuts a dashed line into dashes and gaps of whole device pixels, in step down the whole list whichever row, half or window draws them, as the dots from the uncommitted changes to HEAD stood unevenly', () => {
    const dashed: GraphRow = {
      lane: 1,
      color: 1,
      lines: [
        { from: 0, to: 0, color: 0, bottom: false, dashed: true },
        { from: 0, to: 0, color: 0, bottom: true, dashed: true },
      ],
    };
    for (const scale of [1, 1.25, 1.5]) {
      const { dash, gap } = dashesOf(scale);
      const period = dash + gap;
      for (const origin of [0, 22, 47]) {
        const rows = stacked([dashed, dashed, dashed], 22).map((place) => ({
          ...place,
          top: place.top + 88,
        }));
        const { rects } = graphShapes(rows, origin + 88, 22, scale);
        const start = Math.round((origin + 88) * scale);
        const lane = rects.filter((rect) => rect.color === 0);
        assert.ok(lane.length > 3, `${scale} ${origin}`);
        for (const rect of lane) {
          assert.ok(
            isWhole(rect.y) && isWhole(rect.height),
            JSON.stringify(rect),
          );
          const phase = (((rect.y + start) % period) + period) % period;
          assert.ok(
            phase + rect.height <= dash,
            `${scale} ${origin}: ${JSON.stringify(rect)} at ${phase} of ${period}`,
          );
        }
        const runs = lane
          .map(({ y, height }) => [y, y + height] as const)
          .toSorted(([a], [b]) => a - b)
          .reduce<(readonly [number, number])[]>((joined, [from, to]) => {
            const last = joined.at(-1);
            if (last !== undefined && last[1] === from) {
              joined[joined.length - 1] = [last[0], to];
            } else {
              joined.push([from, to]);
            }
            return joined;
          }, []);
        for (const [from, to] of runs.slice(1, -1)) {
          assert.strictEqual(to - from, dash, `${scale} ${origin}`);
        }
      }
    }
  });

  test('turns a line from one lane to another as a curve from the top of the row to the dot, or from the dot to the next line, then straight down, cutting the dot out of a curve that leaves or reaches it', () => {
    const { curves, rects } = graphShapes(
      stacked(
        [
          {
            lane: 0,
            color: 0,
            lines: [
              { from: 1, to: 0, color: 1, bottom: false },
              { from: 0, to: 1, color: 2, bottom: true, dashed: true },
            ],
          },
        ],
        40,
      ),
      0,
      20,
      1,
    );
    assert.deepStrictEqual(curves, [
      {
        fromX: laneMiddle(1, 1),
        fromY: 0,
        toX: 9,
        toY: 10,
        width: 2,
        color: 1,
        dashed: false,
        hole: { x: 9, y: 10, radius: 4.75 },
      },
      {
        fromX: 9,
        fromY: 10,
        toX: laneMiddle(1, 1),
        toY: 30,
        width: 2,
        color: 2,
        dashed: true,
        hole: { x: 9, y: 10, radius: 4.75 },
      },
    ]);
    assert.ok(rects.some((rect) => rect.color === 2 && rect.y >= 30));
  });

  test('draws a merge as a ring, larger the more commits it folds, with a dot in it once expanded, and the uncommitted changes and a stash as a square, the lines of its lane stopping at its edge', () => {
    assert.deepStrictEqual(merged({ merge: 'collapsed', hidden: 12 }).rings, [
      { x: 9, y: 10, radius: 5.5, width: 2, color: 3 },
    ]);
    assert.deepStrictEqual(merged({ merge: 'expanded' }).discs, [
      { x: 9, y: 10, radius: 1.5, color: 3 },
    ]);
    assert.deepStrictEqual(merged({ workingTree: true }).rects, [
      { x: 6, y: 7, width: 7, height: 7, color: 3 },
    ]);
  });
  test('sizes the ring of a collapsed merge by how many commits it folds, a square for a stash as for the uncommitted changes, and folds lanes past the widest graph onto its last lane', () => {
    const ring = (hidden: number | undefined) =>
      graphShapes(
        stacked([{ lane: 0, color: 0, lines: [], merge: 'collapsed', hidden }]),
        0,
        20,
        1,
      ).rings[0]?.radius;
    assert.deepStrictEqual(
      [undefined, 0, 1, 2, 7, 12, 60].map(ring),
      [3.5, 3.5, 3.5, 4.5, 5, 5.5, 6],
    );
    assert.strictEqual(
      graphShapes(
        stacked([{ lane: 0, color: 0, lines: [], stash: true }]),
        0,
        20,
        1,
      ).rects.length,
      1,
    );
    const folded = graphShapes(
      stacked([
        {
          lane: 15,
          color: 8,
          lines: [{ from: 15, to: 20, color: 9, bottom: true }],
        },
      ]),
      0,
      20,
      1,
    );
    assert.deepStrictEqual(
      [
        folded.discs[0]?.x,
        folded.discs[0]?.color,
        folded.curves[0]?.fromX,
        folded.curves[0]?.toX,
      ],
      [141, 8, 141, 141],
    );
  });
});
