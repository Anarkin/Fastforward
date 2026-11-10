import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { Bounds } from '../../main/files';
import {
  TabDrag,
  type DragHost,
  type DragStart,
  type DragWindow,
  type Strip,
  type Visit,
} from '../../main/tabDrag';

const strip: Strip = {
  left: 8,
  right: 700,
  top: 0,
  bottom: 32,
  firstTabLeft: 8,
  tabTop: 4,
};

class FakeWindow implements DragWindow {
  hidden = false;
  readonly moves: (readonly [number, number])[] = [];

  told: Strip | undefined = strip;

  constructor(
    readonly id: string,
    private place: Bounds,
    private visible = true,
  ) {}

  bounds(): Bounds {
    return this.place;
  }

  contentBounds(): Bounds {
    return this.place;
  }

  strip(): Strip | undefined {
    return this.told;
  }

  shown(): boolean {
    return this.visible && !this.hidden;
  }

  moveTo(x: number, y: number): void {
    this.moves.push([x, y]);
    this.place = { ...this.place, x, y };
  }

  hide(hidden: boolean): void {
    this.hidden = hidden;
    this.visible = true;
  }
}

function hostOf(
  windows: FakeWindow[],
  torn = new FakeWindow('9', { x: 0, y: 0, width: 900, height: 600 }, false),
) {
  const visits: (readonly [string, Visit | undefined])[] = [];
  const moved: (readonly [string, string, number])[] = [];
  const closed: string[] = [];
  const focused: string[] = [];
  const calls: string[] = [];
  const host: DragHost = {
    windows: () => windows,
    tearOff: () => {
      windows.unshift(torn);
      return torn;
    },
    visit: (window, visit) => {
      visits.push([window, visit]);
      calls.push(`visit ${window} ${visit === undefined ? 'ends' : visit.x}`);
    },
    move: (tab, into, index) => {
      moved.push([tab, into, index]);
      calls.push(`move ${tab} ${into} ${index}`);
    },
    close: (window) => closed.push(window),
    focus: (window) => focused.push(window),
  };
  return { host, visits, moved, closed, focused, calls, torn };
}

const start = (at: { x: number; y: number }, alone = false): DragStart => ({
  tab: '3',
  index: alone ? 0 : 1,
  grab: { x: 20, y: 10 },
  at,
  alone,
});

suite('Dragging a tab between windows', () => {
  test('tears a tab off into a window of its own, placing it so the tab stays under the pointer where it was grabbed, and follows the pointer', () => {
    const source = new FakeWindow('1', { x: 0, y: 0, width: 900, height: 600 });
    const { host, torn } = hostOf([source]);
    const drag = TabDrag.start(host, source, start({ x: 300, y: 120 }));
    assert.ok(drag);
    assert.deepStrictEqual(torn.moves, [[272, 106]]);
    assert.strictEqual(torn.shown(), true);
    drag.move({ x: 1000, y: 700 });
    assert.deepStrictEqual(torn.moves.at(-1), [972, 686]);
  });

  test('moves the tab into the window whose strip is under the pointer, showing it there under the pointer while the window it was torn into hides, and back into that window once the pointer leaves the strip, before the strip stops showing it, so it never shows there at another place', () => {
    const source = new FakeWindow('1', { x: 0, y: 0, width: 900, height: 600 });
    const other = new FakeWindow('2', {
      x: 1000,
      y: 0,
      width: 900,
      height: 600,
    });
    const { host, visits, moved, calls, torn } = hostOf([source, other]);
    const drag = TabDrag.start(host, source, start({ x: 300, y: 120 }));
    assert.ok(drag);
    drag.move({ x: 1300, y: 16 });
    drag.move({ x: 1310, y: 16 });
    assert.strictEqual(torn.hidden, true);
    assert.deepStrictEqual(moved, [['3', '2', Number.MAX_SAFE_INTEGER]]);
    assert.deepStrictEqual(visits, [
      ['2', { tab: '3', x: 300, grabX: 20 }],
      ['2', { tab: '3', x: 310, grabX: 20 }],
    ]);
    drag.move({ x: 1300, y: 300 });
    assert.strictEqual(torn.hidden, false);
    assert.deepStrictEqual(calls.slice(-2), ['move 3 9 0', 'visit 2 ends']);
  });

  test('takes the strip of the window in front where windows overlap, and none where another window covers it, a pointer a little above or below a strip counting as over it', () => {
    const source = new FakeWindow('1', {
      x: 0,
      y: 400,
      width: 900,
      height: 600,
    });
    const front = new FakeWindow('2', {
      x: 500,
      y: 0,
      width: 900,
      height: 600,
    });
    const behind = new FakeWindow('3', {
      x: 0,
      y: 20,
      width: 900,
      height: 600,
    });
    const { host, visits, moved, calls } = hostOf([front, behind, source]);
    const drag = TabDrag.start(host, source, start({ x: 300, y: 420 }));
    assert.ok(drag);
    drag.move({ x: 600, y: 30 });
    assert.deepStrictEqual(visits.at(-1)?.[0], '2');
    drag.move({ x: 300, y: 30 });
    assert.deepStrictEqual(visits.at(-1)?.[0], '3');
    assert.deepStrictEqual(calls.slice(-3), [
      `move 3 3 ${Number.MAX_SAFE_INTEGER}`,
      'visit 2 ends',
      'visit 3 300',
    ]);
    drag.move({ x: 300, y: 80 });
    assert.deepStrictEqual(visits.at(-1), ['3', undefined]);
    drag.move({ x: 600, y: 100 });
    assert.strictEqual(
      visits.filter(([window, visit]) => window === '2' && visit).length,
      1,
    );
    assert.deepStrictEqual(moved, [
      ['3', '2', Number.MAX_SAFE_INTEGER],
      ['3', '3', Number.MAX_SAFE_INTEGER],
      ['3', '9', 0],
    ]);
  });

  test('moves the tab within the strip under the pointer to the place the strip tells, so it is where the strip shows it, and drops it there, closing the window it was torn into and bringing the one it is dropped on to the front', () => {
    const source = new FakeWindow('1', { x: 0, y: 0, width: 900, height: 600 });
    const other = new FakeWindow('2', {
      x: 1000,
      y: 0,
      width: 900,
      height: 600,
    });
    const { host, visits, moved, closed, focused } = hostOf([source, other]);
    const drag = TabDrag.start(host, source, start({ x: 300, y: 120 }));
    assert.ok(drag);
    drag.move({ x: 1300, y: 16 });
    drag.index('2', 2);
    drag.index('2', 2);
    drag.index('1', 0);
    assert.deepStrictEqual(moved, [
      ['3', '2', Number.MAX_SAFE_INTEGER],
      ['3', '2', 2],
    ]);
    drag.drop();
    assert.strictEqual(moved.length, 2);
    assert.deepStrictEqual(visits.at(-1), ['2', undefined]);
    assert.deepStrictEqual(closed, ['9']);
    assert.deepStrictEqual(focused, ['2']);
  });

  test('leaves the tab in the window it was torn into when dropped over no strip, bringing that window to the front', () => {
    const source = new FakeWindow('1', { x: 0, y: 0, width: 900, height: 600 });
    const { host, moved, closed, focused, torn } = hostOf([source]);
    const drag = TabDrag.start(host, source, start({ x: 300, y: 120 }));
    assert.ok(drag);
    drag.drop();
    assert.deepStrictEqual(moved, []);
    assert.deepStrictEqual(closed, []);
    assert.deepStrictEqual(focused, ['9']);
    assert.strictEqual(torn.shown(), true);
  });

  test('puts the tab back where it was once the drag is cancelled, from the window torn into or the strip it shows in, bringing the window it came from to the front', () => {
    const source = new FakeWindow('1', { x: 0, y: 0, width: 900, height: 600 });
    const other = new FakeWindow('2', {
      x: 1000,
      y: 0,
      width: 900,
      height: 600,
    });
    const { host, visits, moved, closed, focused } = hostOf([source, other]);
    const drag = TabDrag.start(host, source, start({ x: 300, y: 120 }));
    assert.ok(drag);
    drag.move({ x: 1300, y: 16 });
    drag.cancel();
    assert.deepStrictEqual(visits.at(-1), ['2', undefined]);
    assert.deepStrictEqual(moved, [
      ['3', '2', Number.MAX_SAFE_INTEGER],
      ['3', '1', 1],
    ]);
    assert.deepStrictEqual(closed, ['9']);
    assert.deepStrictEqual(focused, ['1']);
  });

  test('moves the window itself when its only tab is dragged, moving the tab into a strip and back, closing the window once the tab is dropped into another, or putting it back where it was with its tab once cancelled', () => {
    const source = new FakeWindow('1', {
      x: 100,
      y: 100,
      width: 900,
      height: 600,
    });
    const other = new FakeWindow('2', {
      x: 1200,
      y: 0,
      width: 900,
      height: 600,
    });
    const { host, moved, closed, focused } = hostOf([source, other]);
    const drag = TabDrag.start(host, source, start({ x: 400, y: 116 }, true));
    assert.ok(drag);
    assert.strictEqual(drag.window, '1');
    drag.move({ x: 500, y: 216 });
    assert.deepStrictEqual(source.moves.at(-1), [472, 202]);
    drag.cancel();
    assert.deepStrictEqual(source.moves.at(-1), [100, 100]);
    assert.deepStrictEqual(moved, []);
    assert.deepStrictEqual(focused, ['1']);

    const back = TabDrag.start(host, source, start({ x: 400, y: 116 }, true));
    assert.ok(back);
    back.move({ x: 1500, y: 16 });
    back.move({ x: 1500, y: 300 });
    assert.strictEqual(source.hidden, false);
    back.move({ x: 1500, y: 16 });
    back.cancel();
    assert.deepStrictEqual(moved, [
      ['3', '2', Number.MAX_SAFE_INTEGER],
      ['3', '1', 0],
      ['3', '2', Number.MAX_SAFE_INTEGER],
      ['3', '1', 0],
    ]);
    assert.deepStrictEqual(source.moves.at(-1), [100, 100]);
    assert.strictEqual(source.hidden, false);
    assert.deepStrictEqual(closed, []);
    moved.length = 0;

    const again = TabDrag.start(host, source, start({ x: 400, y: 116 }, true));
    assert.ok(again);
    again.move({ x: 1500, y: 16 });
    assert.strictEqual(source.hidden, true);
    again.index('2', 0);
    again.drop();
    assert.deepStrictEqual(moved, [
      ['3', '2', Number.MAX_SAFE_INTEGER],
      ['3', '2', 0],
    ]);
    assert.deepStrictEqual(closed, ['1']);
  });

  test('starts no drag while the window dragged from has not told where its strip is', () => {
    const source = new FakeWindow('1', { x: 0, y: 0, width: 900, height: 600 });
    source.told = undefined;
    const { host } = hostOf([source]);
    assert.strictEqual(
      TabDrag.start(host, source, start({ x: 300, y: 120 })),
      undefined,
    );
  });
});
