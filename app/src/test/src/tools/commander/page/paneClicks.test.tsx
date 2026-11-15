import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { Pane } from '../../../../../tools/commander/page/pane';
import type { PaneView } from '../../../../../tools/commander/page/view';
import type { Layout } from '../../../../../tools/commander/shared/settings';
import { boxOf, inSide, rowNamed, tileNamed } from './paneFixtures';

vi.mock('../../../../../lib/page/virtualRows', async (importOriginal) => {
  const { createElement, Fragment } = await import('react');
  const { columnFocusAttribute } =
    await import('../../../../../lib/page/columnFocus.js');
  return {
    ...(await importOriginal<
      typeof import('../../../../../lib/page/virtualRows')
    >()),
    VirtualRows: ({
      rows,
      renderRow,
    }: {
      rows: { readonly count: number };
      renderRow: (index: number) => React.ReactNode;
    }) =>
      createElement(
        'div',
        { [columnFocusAttribute]: '', tabIndex: 0 },
        Array.from({ length: rows.count }, (_, index) =>
          createElement(Fragment, { key: index }, renderRow(index)),
        ),
      ),
  };
});

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
  test('marks a folder or a file on a click on its box and unmarks it on the next, a double click on it only toggling it, leaving the selection where it was and opening nothing, the parent folder having no box', async () => {
    await inPane(async ({ main, click, posted, selected, marked }) => {
      assert.ok(rowNamed(main, '..'));
      assert.strictEqual(boxOf(rowNamed(main, '..')), null);

      click(boxOf(rowNamed(main, 'docs')), 1);
      click(boxOf(rowNamed(main, 'app')), 1);
      assert.deepStrictEqual(marked().toSorted(), ['app', 'docs']);
      assert.strictEqual(selected(), 'notes.txt');

      click(boxOf(rowNamed(main, 'docs')), 2);
      assert.deepStrictEqual(marked(), ['app']);
      assert.strictEqual(selected(), 'notes.txt');
      assert.deepStrictEqual(
        posted.filter((message) => message.type === 'open'),
        [],
      );
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
