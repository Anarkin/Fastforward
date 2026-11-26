import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { Pane } from '../../../../../tools/commander/page/pane';
import type { PaneView } from '../../../../../tools/commander/page/paneView';
import type { Layout } from '../../../../../tools/commander/page/layouts';
import {
  boxOf,
  inSide,
  onBox,
  pastBox,
  rowNamed,
  tileNamed,
} from './paneFixtures';
import { overCheckAttribute } from '../../../../../tools/commander/page/lineCheck';

vi.mock('../../../../../lib/page/virtualRows', async (importOriginal) =>
  (await import('./listMock.js')).withListMock(importOriginal),
);

const inPane = (
  run: Parameters<typeof inSide>[1],
  layout?: Layout,
  shownPane?: PaneView,
) =>
  inSide(
    <Pane
      side="left"
      driveTrigger={null}
      bookmarkTrigger={null}
      resizer={null}
    />,
    run,
    layout,
    shownPane,
  );

suite('Commander clicks on a side', () => {
  test('opens what is double clicked, a double click right after another at the same spot too, as Chromium counts those clicks on from 3 and sends no dblclick', async () => {
    await inPane(async ({ main, click, posted }) => {
      click(rowNamed(main, 'docs'), 1);
      click(rowNamed(main, 'docs'), 2);
      click(rowNamed(main, 'notes'), 3);
      click(rowNamed(main, 'notes'), 3);

      assert.deepStrictEqual(
        posted.flatMap((message) =>
          message.type === 'open' ? [message.name] : [],
        ),
        ['docs', 'notes.txt'],
      );
    });
  });
  test('selects the item pressed on the press itself, in the update that makes its side the active one, so a side clicked never shows for a frame the item it had selected before, and leaves the selection to the click on a press that marks or on the box of the item', async () => {
    await inPane(async ({ main, point, selected }) => {
      point(rowNamed(main, 'docs'), 'pointerdown');
      assert.strictEqual(selected(), 'docs');
      point(rowNamed(main, 'app'), 'pointerdown', { shiftKey: true });
      assert.strictEqual(selected(), 'docs');
      point(rowNamed(main, 'app'), 'pointerdown', onBox);
      assert.strictEqual(selected(), 'docs');
    });
    await inPane(async ({ main, point, selected }) => {
      point(tileNamed(main, 'docs'), 'pointerdown');
      assert.strictEqual(selected(), 'docs');
      point(boxOf(tileNamed(main, 'app')), 'pointerdown');
      assert.strictEqual(selected(), 'docs');
    }, 'thumbnails');
  });

  test('marks a folder or a file on a click on its box and unmarks it on the next, a double click on it only toggling it, leaving the selection where it was and opening nothing, the box no element of the row but the place before its icon, so a row drawn has one box fewer to lay out; a click right after the box, or where the box of the parent folder would be, which has none, selects the row as any click on it', async () => {
    await inPane(async ({ main, click, posted, selected, marked }) => {
      const up = rowNamed(main, '..');
      assert.deepStrictEqual(
        [
          main.querySelector('.commander-row'),
          main.querySelector('.commander-check'),
        ],
        [null, null],
      );

      click(rowNamed(main, 'docs'), 1, onBox);
      click(rowNamed(main, 'app'), 1, onBox);
      assert.deepStrictEqual(marked().toSorted(), ['app', 'docs']);
      assert.strictEqual(selected(), 'notes.txt');

      click(rowNamed(main, 'docs'), 2, onBox);
      assert.deepStrictEqual(marked(), ['app']);
      assert.strictEqual(selected(), 'notes.txt');
      assert.deepStrictEqual(
        posted.filter((message) => message.type === 'open'),
        [],
      );

      click(rowNamed(main, 'docs'), 1, pastBox);
      assert.deepStrictEqual(marked(), ['app']);
      assert.strictEqual(selected(), 'docs');

      click(up, 1, onBox);
      assert.deepStrictEqual(marked(), ['app']);
      assert.strictEqual(selected(), '..');
    });
  });

  test('tells a row once the pointer is over its box and once it is past it or has left the row, so the box draws its edge in the color of the text under the pointer, as it did while it was an element of its own, and tells the parent folder nothing, which has no box', async () => {
    await inPane(async ({ main, point }) => {
      const docs = rowNamed(main, 'docs');
      const told = () =>
        main
          .querySelector('.commander-pointed')
          ?.hasAttribute(overCheckAttribute) === true;
      assert.strictEqual(told(), false);
      point(docs, 'pointermove', onBox);
      assert.strictEqual(told(), true);
      point(docs, 'pointermove', pastBox);
      assert.strictEqual(told(), false);
      point(docs, 'pointermove', onBox);
      point(docs, 'pointerleave');
      assert.strictEqual(told(), false);

      point(rowNamed(main, '..'), 'pointermove', onBox);
      assert.strictEqual(told(), false);
    });
  });

  test('marks a thumbnail on a click on its box and unmarks it on the next, leaving the selection where it was, the parent folder having no box', async () => {
    await inPane(async ({ main, click, selected, marked }) => {
      assert.ok(tileNamed(main, '..'));
      assert.strictEqual(boxOf(tileNamed(main, '..')), null);

      click(boxOf(tileNamed(main, 'docs')), 1);
      assert.deepStrictEqual(marked(), ['docs']);
      assert.strictEqual(selected(), 'notes.txt');

      click(boxOf(tileNamed(main, 'docs')), 1);
      assert.deepStrictEqual(marked(), []);
    }, 'thumbnails');
  });
});
