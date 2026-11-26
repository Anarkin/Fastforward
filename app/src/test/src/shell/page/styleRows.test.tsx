import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { listedFilesRows } from '../../../../tools/git/page/filesRows';
import { Column } from '../../../../lib/page/column';
import { VirtualRows } from '../../../../lib/page/virtualRows';
import { cascaded } from '../../../helpers/cascade';
import { defaultSettings } from '../../../helpers/fixtures';
import { noop, looks, hovered } from './stylesheetFixtures';
import { SkeletonRows } from '../../../../lib/page/skeleton';
import { defaultScrolling } from '../../../../lib/page/scrollSettings';
import { fileChange } from '../../../helpers/gitValues';
import { renderedBy } from '../../../helpers/componentFixtures';
import { stylesheet } from '../../../helpers/pageSources';
import { rendered, withClass } from '../../../helpers/markup';
import {
  FileRowShown,
  FolderRowShown,
} from '../../../helpers/styleHistoryFixtures';

suite('Style', () => {
  test('draws the rows of the lists as tall as one line of the line height of the settings, the size of the font rounded to the device pixel, with nothing above or below the text', () => {
    looks(rendered(<div className="row" />), {
      height: 'var(--row-line-height)',
      'line-height': 'var(--row-line-height)',
      padding: '0 8px',
    });
    assert.match(
      stylesheet(),
      /--row-line-height: round\(\s*var\(--font-size\) \* var\(--line-height\),\s*var\(--device-pixel, 1px\)\s*\);/,
    );
  });

  test('gives a row of the files column one line of the line height of the settings, its icons in the middle of it, as tall as a line of the diff at the default sizes, so the columns line up', () => {
    for (const row of [
      rendered(<FileRowShown change={fileChange('src/a.ts')} />),
      rendered(<FolderRowShown />),
    ]) {
      looks(row, {
        'box-sizing': 'border-box',
        height: 'var(--row-line-height)',
        display: 'flex',
        'align-items': 'center',
      });
    }
    const { fonts } = defaultSettings();
    assert.deepStrictEqual(
      [fonts.size, fonts.lineHeight],
      [fonts.monospaceSize, fonts.monospaceLineHeight],
    );
  });

  test('cuts off every long name in a row with an ellipsis', () => {
    for (const row of [
      rendered(<FileRowShown change={fileChange('src/a.ts')} />),
      rendered(
        <FileRowShown change={fileChange('src/a.ts', { status: 'D' })} />,
      ),
      rendered(<FileRowShown />),
      rendered(<FolderRowShown />),
    ]) {
      looks(withClass(row, 'path'), {
        overflow: 'hidden',
        'text-overflow': 'ellipsis',
        'min-width': '0',
      });
    }
  });

  test("lines a folder's name up with the names of the files beside it, leaving no gap after its twisty", () => {
    looks(rendered(<FolderRowShown />), { gap: undefined });
  });

  test('highlights no loading placeholder on hover', () => {
    for (const placeholder of [
      withClass(rendered(<SkeletonRows count={1} />), 'skeleton-row'),
      withClass(
        rendered(<SkeletonRows count={1} className="diff-line" />),
        'skeleton-row',
      ),
    ]) {
      looks(placeholder, { background: 'none' }, hovered);
    }
  });

  test('shows that nothing changed as a dimmed row above the empty list, which still fills the column to take the keys', () => {
    const column = rendered(
      renderedBy(Column, {
        children: [
          <VirtualRows
            key="rows"
            rows={listedFilesRows([])}
            renderRow={noop}
            selectedKey={undefined}
            scrolling={defaultScrolling}
          />,
          <div key="empty" className="row empty" />,
        ],
      }),
    );
    looks(withClass(column, 'column-body'), {
      display: 'flex',
      'flex-direction': 'column',
    });
    const row = rendered(<FileRowShown change={fileChange('src/a.ts')} />);
    looks(withClass(column, 'empty'), {
      order: '-1',
      'flex-shrink': '0',
      height: cascaded(row, 'height'),
      padding: cascaded(row, 'padding'),
      color: 'var(--muted-foreground)',
    });
    looks(withClass(column, 'virtual-rows'), {
      flex: '1',
      'min-height': '0',
    });
  });

  test('strikes a deleted file through, in the text color like the other changes', () => {
    looks(
      withClass(
        rendered(
          <FileRowShown change={fileChange('src/a.ts', { status: 'D' })} />,
        ),
        'path',
      ),
      {
        'text-decoration': 'line-through',
        color: 'var(--color-foreground)',
      },
    );
  });

  test('starts a file with its mark in monospace, its blanks kept, spaced from its name by a column, in the theme color of its kind of change, a conflict in a color of its own', () => {
    for (const [extra, kind] of [
      [{ status: 'A' }, 'added'],
      [{ status: 'M' }, 'modified'],
      [{ status: 'D' }, 'deleted'],
      [{ status: 'R' }, 'renamed'],
      [{ status: 'M', conflict: true }, 'conflict'],
    ] as const) {
      const mark = withClass(
        rendered(<FileRowShown change={fileChange('src/a.ts', extra)} />),
        'change-mark',
        kind,
      );
      looks(mark, {
        color: `var(--color-change-${kind})`,
        'flex-shrink': '0',
        'margin-right': '1ch',
        'font-family': 'var(--monospace-font-family)',
        'white-space': 'pre',
      });
    }
  });
});
