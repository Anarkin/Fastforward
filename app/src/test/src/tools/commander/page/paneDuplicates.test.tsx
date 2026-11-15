import * as assert from 'node:assert';
import { act } from 'react';
import { afterEach, suite, test, vi } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import { rowsOf } from '../../../../../tools/commander/page/listing';
import { Pane } from '../../../../../tools/commander/page/pane';
import type { PaneView } from '../../../../../tools/commander/page/paneView';
import type { Layout } from '../../../../../tools/commander/page/layouts';
import { inSide, sort, workPane } from './paneFixtures';

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

function duplicatesPane(
  duplicates: PaneView['duplicates'] = {
    look: 1,
    groups: [['notes.txt', 'copy.txt']],
    reading: false,
  },
): PaneView {
  const entries = ['copy.txt', 'notes.txt', 'other.txt'].map((name) => ({
    name,
    folder: false,
    link: false,
    hidden: false,
    size: 1,
    modified: 0,
  }));
  return {
    ...workPane(),
    entries,
    rows: rowsOf(entries, true, true, sort),
    duplicates,
  };
}

const statusOf = (duplicates: PaneView['duplicates'], after = 0) => {
  let status: string | null | undefined;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  return inPane(
    async ({ main }) => {
      await act(async () => {
        vi.advanceTimersByTime(after);
      });
      status = main.querySelector('.column-status')?.textContent;
    },
    'details',
    duplicatesPane(duplicates),
  ).then(() => status);
};

suite('Commander side showing duplicates', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('says under the side that it reads once it has looked for duplicates for half a second, and nothing before, then the full path of the file selected among those found, and nothing once it found none', async () => {
    const looking = { look: 1, groups: [], reading: true };
    assert.deepStrictEqual(
      [
        await statusOf(looking, 499),
        await statusOf(looking, 500),
        await statusOf(
          { look: 1, groups: [['notes.txt', 'copy.txt']], reading: false },
          500,
        ),
        await statusOf({ look: 1, groups: [], reading: false }, 500),
      ],
      [undefined, strings.common.reading, '/work\\notes.txt', undefined],
    );
  });

  test('shows only the files that have a copy, a line above the first file of each group, and says so after its path', async () => {
    await inPane(
      async ({ main }) => {
        const rows = [...main.querySelectorAll('.commander-row')].map((row) => [
          row.querySelector('.commander-name')?.textContent,
          row.classList.contains('group-start'),
        ]);

        assert.deepStrictEqual(rows, [
          ['..', false],
          ['copy', true],
          ['notes', false],
        ]);
        assert.strictEqual(
          main.querySelector('.commander-path .path-duplicates')?.textContent,
          strings.commander.duplicatesTag,
        );
      },
      'details',
      duplicatesPane(),
    );
  });
});
