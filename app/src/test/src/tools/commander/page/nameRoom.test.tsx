import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, useRef } from 'react';
import { suite, test } from 'vitest';
import { useNameRoom } from '../../../../../tools/commander/page/nameRoom';
import type { Side } from '../../../../../tools/commander/shared/sides';

function Sided({
  side,
  list,
  onRoom,
}: {
  side: Side;
  list: string | undefined;
  onRoom: (room: number | undefined) => void;
}) {
  const section = useRef<HTMLElement>(null);
  onRoom(useNameRoom(section, side, list));
  return (
    <section ref={section}>
      <div className="commander-ruler">
        <span className="commander-name" />
      </div>
      <div className="column-body">
        {list !== undefined && <div className="virtual-spacer" />}
      </div>
    </section>
  );
}

suite('Commander name room', () => {
  test('counts the characters a name has room for from the width of the rows of the side less what a ruler laid out as a row gives its other columns, tells the styles that width for the tab of a row to stop after, counts anew as the rows or the columns are resized, and keeps the count of a side whose rows have no width, as while its tab is hidden, and for the next time the side is shown, so its rows are not drawn with cells first', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    const widths = { rows: 600, cell: 3704 };
    const resized: (() => void)[] = [];
    dom.window.HTMLElement.prototype.getBoundingClientRect = function (
      this: HTMLElement,
    ) {
      const width = this.classList.contains('commander-ruler')
        ? 4000
        : this.classList.contains('commander-name')
          ? widths.cell
          : this.classList.contains('virtual-spacer')
            ? widths.rows
            : 0;
      return new dom.window.DOMRect(0, 0, width, 0);
    };
    const globals = {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      getComputedStyle: () => ({ columnGap: '14px' }),
      ResizeObserver: class {
        constructor(callback: () => void) {
          resized.push(callback);
        }
        observe(): void {}
        disconnect(): void {}
      },
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const { createRoot } = await import('react-dom/client');
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const rooms: (number | undefined)[] = [];
      const width = () =>
        main
          .querySelector('section')
          ?.style.getPropertyValue('--commander-name-width');
      const shown = async (side: Side, list: string | undefined) => {
        const root = createRoot(main);
        rooms.length = 0;
        await act(async () => {
          root.render(
            <Sided
              side={side}
              list={list}
              onRoom={(room) => rooms.push(room)}
            />,
          );
        });
        return root;
      };
      const resize = () =>
        act(async () => {
          resized.at(-1)?.();
        });

      const first = await shown('left', 'details 1');
      assert.deepStrictEqual([rooms, width()], [[undefined, 43], '304px']);

      widths.rows = 500;
      await resize();
      assert.deepStrictEqual([rooms.at(-1), width()], [29, '204px']);

      widths.cell = 3760;
      await resize();
      assert.deepStrictEqual([rooms.at(-1), width()], [37, '260px']);

      widths.rows = 0;
      const drawn = rooms.length;
      await resize();
      assert.deepStrictEqual(
        [rooms.length, rooms.at(-1), width()],
        [drawn, 37, '260px'],
      );
      await act(async () => first.unmount());

      const again = await shown('left', 'details 1');
      assert.deepStrictEqual(rooms, [37]);
      await act(async () => again.unmount());

      const tiled = await shown('left', undefined);
      assert.deepStrictEqual(rooms, [undefined]);
      await act(async () => tiled.unmount());

      widths.rows = 600;
      const other = await shown('right', 'details 1');
      assert.deepStrictEqual(rooms, [undefined, 51]);
      await act(async () => other.unmount());
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
