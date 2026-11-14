import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { listedFilesRows } from '../../../../tools/git/page/changesRows';
import { Column } from '../../../../tools/git/page/column';
import { Crash } from '../../../../shell/page/errorBoundary';
import { VirtualRows } from '../../../../lib/page/virtualRows';
import {
  allWithClass,
  cascaded,
  rendered,
  withClass,
} from '../../../helpers/cascade';
import {
  defaultSettings,
  fileChange,
  renderedBy,
  stylesheet,
} from '../../../helpers/fixtures';
import {
  CommitRowShown,
  ContextMenuShown,
  DiffFindShown,
  DiffViewShown,
  FileHeaderRow,
  FileRowShown,
  FolderRowShown,
  LocationsPopupShown,
  NavButtonsShown,
  NoticesShown,
  SearchButtonShown,
  TabBarShown,
} from '../../../helpers/styleFixtures';
import { diffView } from '../../../helpers/styleMarkup';
import {
  css,
  noop,
  looks,
  body,
  bodyVariable,
  hovered,
} from './stylesheetFixtures';
import { SkeletonRows } from '../../../../tools/git/page/skeleton';
import { defaultScrolling } from '../../../../lib/page/rowScroll';

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
      rendered(<div className="commit placeholder" />),
      withClass(
        rendered(<LocationsPopupShown query="abcd" />),
        'hash-suggestion',
        'empty',
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

  test('lets only the diff, errors and notices be selected, not the controls around them', () => {
    looks(body, { 'user-select': 'none' });
    const view = diffView(<DiffViewShown />, <FileHeaderRow />);
    for (const selectable of [
      view,
      withClass(rendered(<NoticesShown />), 'notice-message'),
      withClass(
        rendered(
          <Crash
            title="Fastforward"
            error={new Error('boom')}
            onReload={noop}
            listen={() => noop}
            onQuit={noop}
          />,
        ),
        'error-message',
      ),
    ]) {
      looks(selectable, { 'user-select': 'text' });
    }
    looks(withClass(view, 'file-header'), { 'user-select': 'none' });
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
        color: undefined,
      },
    );
  });

  test('starts a changed file with its icon, spaced from its name, in the theme color of its kind', () => {
    for (const [status, kind] of [
      ['A', 'added'],
      ['M', 'modified'],
      ['D', 'deleted'],
      ['R', 'renamed'],
    ] as const) {
      const icon = withClass(
        rendered(<FileRowShown change={fileChange('src/a.ts', { status })} />),
        'change-icon',
        kind,
      );
      looks(icon, { color: `var(--color-change-${kind})`, 'flex-shrink': '0' });
      assert.ok(parseFloat(cascaded(icon, 'margin-right') ?? '') > 0);
    }
  });

  test('sizes all text by the font size settings, or a multiple of them for the headings of Markdown, buttons and inputs included', () => {
    const sizes = [...css.matchAll(/font-size: ([^;]+);/g)].map(
      (match) => match[1],
    );
    assert.deepStrictEqual(
      [...new Set(sizes.filter((size) => !size.startsWith('calc(')))],
      ['var(--font-size)', 'var(--monospace-font-size)'],
    );
    for (const scaled of sizes.filter((size) => size.startsWith('calc('))) {
      assert.match(scaled, /^calc\(var\(--font-size\) \* [\d.]+\)$/);
    }
    const controls = [
      rendered(<TabBarShown />),
      rendered(<ContextMenuShown />),
      rendered(<LocationsPopupShown query="" />),
      rendered(<DiffFindShown />),
      rendered(<NoticesShown />),
      rendered(<SearchButtonShown />),
      rendered(<NavButtonsShown />),
    ].flatMap((root) =>
      allWithClass(root).filter((element) =>
        ['button', 'input'].includes(element.tag),
      ),
    );
    assert.ok(controls.length > 10);
    for (const control of controls) {
      looks(control, { font: 'inherit' });
    }
  });

  test('keeps the arrow cursor of a desktop app but for resizing, the fields showing the text cursor of their own', () => {
    assert.deepStrictEqual(
      [
        ...new Set(
          [...css.matchAll(/cursor: ([^;]+);/g)].map((match) => match[1]),
        ),
      ],
      ['col-resize'],
    );
  });

  test('mutes text by the one muted opacity, from the text color', () => {
    assert.strictEqual(
      bodyVariable('muted-opacity'),
      'var(--color-foreground-muted)',
    );
    assert.strictEqual(
      bodyVariable('muted-foreground'),
      'color-mix( in srgb, var(--color-foreground) var(--color-foreground-muted), transparent )',
    );
    looks(withClass(rendered(<CommitRowShown />), 'commit-line', 'secondary'), {
      color: 'var(--muted-foreground)',
    });
  });

  test('dims close buttons, disabled controls and a gone bubble like muted text, keeping its own fade only for the loading placeholder', () => {
    for (const dimmed of [
      withClass(rendered(<NoticesShown />), 'notice-close'),
      withClass(rendered(<LocationsPopupShown query="" />), 'badge', 'missing'),
      allWithClass(rendered(<ContextMenuShown />), 'menu-item').find((item) =>
        item.attributes.has('disabled'),
      ),
      allWithClass(rendered(<NavButtonsShown />), 'nav-button').find((button) =>
        button.attributes.has('disabled'),
      ),
    ]) {
      looks(dimmed, { opacity: 'var(--muted-opacity)' });
    }
    const fades = [...css.matchAll(/opacity: (0\.\d+);/g)].map(
      (match) => match[1],
    );
    assert.strictEqual(fades.length, 1);
    looks(
      withClass(
        withClass(rendered(<SkeletonRows count={1} />), 'skeleton-row'),
        'bar',
      ),
      { opacity: fades[0] },
    );
  });
});
