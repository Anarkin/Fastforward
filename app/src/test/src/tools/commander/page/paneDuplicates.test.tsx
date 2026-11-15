import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
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

const statusOf = (duplicates: PaneView['duplicates']) => {
  let status: string | null | undefined;
  return inPane(
    async ({ main }) => {
      status = main.querySelector('.column-status')?.textContent;
    },
    'details',
    duplicatesPane(duplicates),
  ).then(() => status);
};

suite('Commander side showing duplicates', () => {
  test('says under the side that it looks for duplicates while it reads, that Esc stops it, and that it found none once done without any, and nothing once it found some', async () => {
    assert.deepStrictEqual(
      [
        await statusOf({ look: 1, groups: [], reading: true }),
        await statusOf({ look: 1, groups: [], reading: false }),
        await statusOf(undefined),
        await statusOf({
          look: 1,
          groups: [['notes.txt', 'copy.txt']],
          reading: false,
        }),
      ],
      [
        `${strings.commander.findingDuplicates} · ${strings.commander.escapeStops}`,
        strings.commander.noDuplicates,
        undefined,
        undefined,
      ],
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
