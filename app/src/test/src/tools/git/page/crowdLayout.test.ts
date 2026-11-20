import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { CrowdLayout } from '../../../../../tools/git/page/crowdLayout';
import { indentOf } from '../../../../../tools/git/page/bubbleLines';

const crowd = (position: number, advances: number[], lanes = 1) => ({
  position,
  indent: indentOf(lanes),
  advances,
});

const room = (of: number) => of + indentOf(1);

suite('Crowd layout', () => {
  test('lays out the bubbles of each commit once it knows the room of a line, in the room its row leaves after its lanes, and none while the room is unknown', () => {
    const layout = new CrowdLayout();
    assert.deepStrictEqual(
      layout.take([crowd(4, [50, 50]), crowd(9, [50, 50], 4)]),
      [4, 9],
    );
    assert.strictEqual(layout.has(4), false);
    assert.strictEqual(layout.fit(room(100)), true);
    assert.deepStrictEqual(layout.show()?.toSorted(), [4, 9]);
    assert.deepStrictEqual(layout.get(4), [2]);
    assert.deepStrictEqual(layout.get(9), [1, 1]);
    assert.strictEqual(layout.fit(0), true);
    assert.deepStrictEqual(layout.show()?.toSorted(), [4, 9]);
    assert.strictEqual(layout.has(9), false);
  });

  test('tells only the commits whose lines a new room changes, none for the room it has, and keeps every other the very lines it had', () => {
    const layout = new CrowdLayout();
    layout.fit(room(100));
    layout.take([crowd(1, [30, 30, 30]), crowd(2, [20, 20, 20])]);
    assert.deepStrictEqual(layout.get(1), [3]);
    const kept = layout.get(2);
    assert.strictEqual(layout.fit(room(100)), false);
    assert.strictEqual(layout.fit(room(80)), true);
    assert.deepStrictEqual(layout.show(), [1]);
    assert.deepStrictEqual(layout.get(1), [2, 1]);
    assert.strictEqual(layout.get(2), kept);
    assert.strictEqual(layout.fit(room(60)), false);
    assert.strictEqual(layout.show(), undefined);
    assert.strictEqual(layout.fit(room(59.5)), true);
    assert.deepStrictEqual(layout.show()?.toSorted(), [1, 2]);
    assert.deepStrictEqual(layout.get(2), [2, 1]);
    assert.strictEqual(layout.fit(room(90)), true);
    assert.deepStrictEqual(layout.show()?.toSorted(), [1, 2]);
    assert.deepStrictEqual(layout.get(1), [3]);
  });

  test('lays out a commit at every room as it does from scratch, though it lays it out anew only once the room leaves the span its lines hold in', () => {
    const advances = [37.5, 12.25, 61, 8, 23.75, 44, 5.5];
    const layout = new CrowdLayout();
    layout.take([crowd(3, advances)]);
    for (const width of [
      200, 150, 120, 99, 80, 71, 70, 69.75, 61, 60, 30, 5, 300,
    ]) {
      layout.fit(room(width));
      layout.show();
      const fresh = new CrowdLayout();
      fresh.fit(room(width));
      fresh.take([crowd(3, advances)]);
      assert.deepStrictEqual(layout.get(3), fresh.get(3), String(width));
    }
  });

  test('shows the new lines of only the commits asked for, the others keeping the lines shown until asked for too, and none waiting once a room gives them the lines shown again', () => {
    const layout = new CrowdLayout();
    layout.fit(room(100));
    layout.take([1, 2, 3].map((position) => crowd(position, [30, 30, 30])));
    assert.strictEqual(layout.fit(room(80)), true);
    assert.deepStrictEqual(
      layout.show((position) => position === 2),
      [2],
    );
    assert.deepStrictEqual(
      [1, 2, 3].map((position) => layout.get(position)),
      [[3], [2, 1], [3]],
    );
    assert.strictEqual(layout.fit(room(70)), true);
    assert.deepStrictEqual(
      layout.show((position) => position === 1),
      [1],
    );
    assert.strictEqual(layout.fit(room(100)), true);
    assert.deepStrictEqual(layout.show()?.toSorted(), [1, 2]);
    assert.deepStrictEqual(
      [1, 2, 3].map((position) => layout.get(position)),
      [[3], [3], [3]],
    );
    assert.strictEqual(layout.fit(room(95)), false);
  });

  test('tells every commit it lays out and every one it laid out before once it takes other commits, so their rows are measured anew', () => {
    const layout = new CrowdLayout();
    layout.fit(500);
    const crowds = [crowd(1, [10, 10]), crowd(5, [10, 10])];
    layout.take(crowds);
    assert.strictEqual(layout.take(crowds), undefined);
    assert.deepStrictEqual(
      layout.take([crowd(5, [10, 10]), crowd(7, [10, 10])])?.toSorted(),
      [1, 5, 7],
    );
    assert.strictEqual(layout.has(1), false);
    assert.deepStrictEqual(layout.get(7), [2]);
  });
});
