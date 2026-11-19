import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { Pane } from '../../../../../tools/commander/page/pane';
import { rowsOf } from '../../../../../tools/commander/page/listing';
import type { PaneView } from '../../../../../tools/commander/page/paneView';
import { inSide, onBox, rowNamed, sort, workPane } from './paneFixtures';

const drawn: number[] = [];

vi.mock('../../../../../lib/page/dates', async (importOriginal) => {
  const dates =
    await importOriginal<typeof import('../../../../../lib/page/dates')>();
  return {
    ...dates,
    formatDate: (time: number, pattern: string) => {
      drawn.push(time);
      return dates.formatDate(time, pattern);
    },
  };
});

vi.mock('../../../../../lib/page/virtualRows', async (importOriginal) => {
  const { createElement, memo } = await import('react');
  const { columnFocusAttribute } =
    await import('../../../../../lib/page/columnFocus.js');
  const RowContent = memo(function RowContent({
    index,
    renderRow,
  }: {
    index: number;
    renderRow: (index: number) => React.ReactNode;
  }) {
    return renderRow(index);
  });
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
          createElement(RowContent, { key: index, index, renderRow }),
        ),
      ),
  };
});

const names = ['app', 'docs', 'notes.txt', 'plan.md', 'todo.txt'];

function filesPane(): PaneView {
  const entries = names.map((name, index) => ({
    name,
    folder: index < 2,
    link: false,
    hidden: false,
    size: 1,
    modified: index + 1,
  }));
  return {
    ...workPane(),
    entries,
    repositories: new Set(),
    rows: rowsOf(entries, true, true, sort, new Set()),
    selected: 'notes.txt',
  };
}

const drawnNames = () =>
  drawn
    .splice(0)
    .map((modified) => names[modified - 1])
    .toSorted();

suite('Commander rows drawn again', () => {
  test('draws again only the row the selection left and the one it came to, and only the row marked or unmarked, not every row of the side, as each arrow key and each page down drew the whole list again', async () => {
    await inSide(
      <Pane
        side="left"
        driveTrigger={null}
        bookmarkTrigger={null}
        resizer={null}
      />,
      async ({ main, click, selected, marked }) => {
        drawn.length = 0;
        click(rowNamed(main, 'plan'), 1);
        assert.strictEqual(selected(), 'plan.md');
        assert.deepStrictEqual(drawnNames(), ['notes.txt', 'plan.md']);

        click(rowNamed(main, 'docs'), 1, onBox);
        assert.deepStrictEqual(marked(), ['docs']);
        assert.deepStrictEqual(drawnNames(), ['docs']);

        click(rowNamed(main, 'docs'), 1, onBox);
        assert.deepStrictEqual(marked(), []);
        assert.deepStrictEqual(drawnNames(), ['docs']);
      },
      'details',
      filesPane(),
    );
  });
});
