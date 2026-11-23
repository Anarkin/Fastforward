import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { columnsClass } from '../../../../tools/git/page/columnsShown';
import { ImageDiff } from '../../../../components/diff/page/imagePreview';
import { Crash } from '../../../../shell/page/errorBoundary';
import { cascaded, matchingRules } from '../../../helpers/cascade';
import { Columns } from '../../../helpers/styleFixtures';
import { diffView, shownRow, shownRows } from '../../../helpers/styleMarkup';
import {
  css,
  noop,
  compact,
  looks,
  paddingOf,
  after,
  currentMatchOutline,
} from './stylesheetFixtures';
import { sideSnaps } from '../../../../components/diff/page/codeSnap';
import {
  codePadding,
  layoutVariables,
  numberWidth,
} from '../../../../components/diff/page/textLayout';
import { diffRowClass } from '../../../../components/diff/page/rowClasses';
import {
  FileNote,
  FileHeader,
  HunkDivider,
} from '../../../../components/diff/page/rowParts';
import {
  allWithClass,
  rendered,
  withClass,
  type MarkupElement,
} from '../../../helpers/markup';
import {
  DiffRow,
  DiffViewShown,
  FileHeaderRow,
  InlineLine,
  ScrollbarMarksShown,
  SplitLine,
} from '../../../helpers/styleDiffFixtures';

const fontOf = (element: MarkupElement) => [
  cascaded(element, 'font-family'),
  cascaded(element, 'font-size'),
];

const below = (shown: React.ReactElement) =>
  withClass(rendered(shown), 'scroll-proxy-frame');

suite('Style', () => {
  test('sizes the line numbers and the padding of the code by the widths the diff counts its columns with', () => {
    const row = shownRow(
      diffView(<DiffViewShown />, <InlineLine kind="added" />),
    );
    looks(withClass(row, 'number'), { width: 'var(--diff-number-width)' });
    looks(withClass(row, 'code'), { padding: '0 var(--diff-code-padding)' });
    assert.deepStrictEqual(
      [
        layoutVariables['--diff-number-width'],
        layoutVariables['--diff-code-padding'],
      ],
      [`${numberWidth}px`, `${codePadding}px`],
    );
  });

  test('makes every row of an inline diff as wide as the diff, as those of one side by side are, so short lines stay tinted and the strips between files and hunks reach across, the code alone moving sideways within its row', () => {
    const rows = shownRows(
      diffView(
        <DiffViewShown />,
        <FileHeaderRow />,
        <DiffRow>
          <HunkDivider />
        </DiffRow>,
        <InlineLine kind="added" />,
      ),
    );
    assert.strictEqual(rows.length, 3);
    for (const row of rows) {
      looks(row, { width: '100%' });
    }
  });

  test('tints a binary file added or deleted like such a line, and hatches the side it lacks like one, both halves as tall as the row', () => {
    for (const change of ['added', 'removed'] as const) {
      assert.strictEqual(
        cascaded(
          withClass(
            rendered(
              <FileNote text="Binary file" change={change} split={false} />,
            ),
            'file-note',
          ),
          'background',
        ),
        cascaded(
          withClass(
            diffView(<DiffViewShown />, <InlineLine kind={change} />),
            'diff-line',
            change,
          ),
          'background',
        ),
      );
    }
    const split = rendered(
      <FileNote text="Binary file" change="added" split />,
    );
    assert.strictEqual(
      cascaded(withClass(split, 'filler'), 'background'),
      cascaded(
        withClass(
          diffView(
            <DiffViewShown sideBySide />,
            <SplitLine left="filler" right="added" />,
          ),
          'filler',
        ),
        'background',
      ),
    );
    for (const side of allWithClass(split, 'file-note')) {
      looks(side, { height: '100%' });
    }
    looks(withClass(split, 'split-line'), { height: '100%' });
  });

  test('starts the note of a side where the code of its lines starts, past both columns of line numbers inline and the one of its side side by side, and that of a file shown whole past its one column, as notes started at the edge of the numbers like no line of the diff', () => {
    looks(
      withClass(
        rendered(<FileNote text="Empty file" change="added" split={false} />),
        'file-note',
      ),
      {
        'padding-left':
          'calc(2 * var(--diff-number-width) + var(--diff-code-padding))',
      },
    );
    const split = rendered(<FileNote text="Empty file" change="added" split />);
    looks(withClass(split, 'file-note', 'added'), {
      'padding-left':
        'calc(var(--diff-number-width) + var(--diff-code-padding))',
    });
    looks(
      withClass(
        rendered(<div className="file-note whole-note" />),
        'file-note',
      ),
      {
        'padding-left':
          'calc(var(--diff-number-width) + var(--diff-code-padding))',
      },
    );
  });

  test('lays an error over the diff out as wide as the view, so a long one wraps rather than running past what can be scrolled to', () => {
    for (const sideBySide of [false, true]) {
      const view = diffView(
        <DiffViewShown sideBySide={sideBySide} />,
        <div className={diffRowClass('error')}>
          <div className="error-message">fatal: x</div>
        </div>,
      );
      looks(withClass(view, 'virtual-row', 'error-row'), {
        'min-width': '0',
        width: '100%',
      });
    }
  });

  test('keeps the line breaks of an error git wrote over several lines, wrapping a long one anywhere', () => {
    looks(
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
      { 'white-space': 'pre-wrap', 'overflow-wrap': 'anywhere' },
    );
  });

  test('keeps an image row as wide as the diff, its images in the part scrolled to, side by side, hatching a side it lacks down to where an image could reach', () => {
    const view = diffView(
      <DiffViewShown />,
      <div className={diffRowClass('image')}>
        <ImageDiff
          panes={[
            { side: 'old', url: undefined },
            { side: 'new', url: 'a.png' },
          ]}
          top={0}
        />
      </div>,
    );
    looks(withClass(view, 'virtual-row', 'preview-row'), {
      'min-width': '0',
      width: '100%',
    });
    looks(withClass(view, 'image-diff'), {
      display: 'flex',
      height: '100%',
      width: '100%',
    });
    const panes = allWithClass(view, 'image-pane');
    for (const pane of panes) {
      looks(pane, {
        flex: '0 0 50%',
        'box-sizing': 'border-box',
        'min-width': '0',
      });
    }
    assert.strictEqual(diffRowClass('line').includes('preview-row'), false);
    const filler = withClass(view, 'image-pane', 'filler');
    const frame = withClass(filler, 'image-frame');
    looks(frame, {
      flex: '1',
      'align-self': 'stretch',
      'margin-right': undefined,
      'padding-right': undefined,
    });
    assert.strictEqual(
      cascaded(frame, 'background'),
      cascaded(
        withClass(
          diffView(
            <DiffViewShown sideBySide />,
            <SplitLine left="filler" right="added" />,
          ),
          'filler',
        ),
        'background',
      ),
    );
  });

  test('makes a line of the diff as tall as the font size of code times the line height, rounded to whole device pixels, so every line is drawn alike and the app places the rows a whole number of lines apart', () => {
    assert.strictEqual(
      compact(cascaded(diffView(<DiffViewShown />), '--diff-line-height')),
      'round(var(--monospace-font-size) * var(--monospace-line-height), var(--device-pixel, 1px))',
    );
  });

  test('spaces the characters of code a whole number of device pixels apart, the nearest to their width, so each is drawn alike', () => {
    assert.strictEqual(
      compact(cascaded(diffView(<DiffViewShown />), '--diff-advance')),
      'round(1ch, var(--device-pixel, 1px))',
    );
    for (const view of [
      diffView(<DiffViewShown />, <InlineLine kind="added" />),
      diffView(
        <DiffViewShown sideBySide />,
        <SplitLine left="removed" right="added" />,
      ),
    ]) {
      for (const line of allWithClass(view, 'diff-line')) {
        looks(line, { 'letter-spacing': 'calc(var(--diff-advance) - 1ch)' });
      }
    }
  });

  test('paints the scroller of the diff in the color of its panel, so Chromium keeps the subpixel antialiasing of its text when it composites the scrolling', () => {
    looks(withClass(diffView(<DiffViewShown />), 'virtual-rows'), {
      background: 'var(--repository-background)',
    });
  });

  test('moves each line of code onto whole device pixels by less than one, each side of a side-by-side diff on its own, by layout rather than a transform, which would cost the text its subpixel antialiasing, the margin of a side written on the side itself rather than as a variable for a rule to read, which every element of the side inherited', () => {
    const inline = shownRow(
      diffView(<DiffViewShown />, <InlineLine kind="added" />),
    );
    looks(withClass(inline, 'diff-line'), {
      'margin-left': 'var(--diff-snap-inline, 0px)',
    });
    looks(withClass(inline, 'code'), { translate: undefined });
    const [left, right] = allWithClass(
      shownRow(
        diffView(
          <DiffViewShown sideBySide />,
          <SplitLine left="removed" right="added" />,
        ),
      ),
      'split-side',
    );
    for (const side of [left, right]) {
      looks(side, { 'margin-left': undefined });
    }
    assert.deepStrictEqual(sideSnaps, [
      { marginLeft: 'var(--diff-snap-left, 0px)' },
      { marginLeft: 'var(--diff-snap-right, 0px)' },
    ]);
    assert.doesNotMatch(css, /--diff-side-snap/);
  });

  test('keeps the marks of a diff over the track of its scrollbar, between its buttons, inside the line their column draws, as their thumbs reach the edges of their boxes', () => {
    looks(
      rendered(
        <Columns className={columnsClass(true, 'a')} active="commits" />,
      ),
      {
        '--column-line': undefined,
      },
    );
    looks(
      withClass(
        rendered(
          <Columns className={columnsClass(true, 'a')} active="commits" />,
        ),
        'column',
      ),
      {
        '--column-line': 'round(2px, var(--device-pixel, 1px))',
      },
    );
    looks(
      withClass(
        rendered(
          <Columns className={columnsClass(true, 'a')} active="commits" />,
        ),
        'column',
      ),
      {
        '--frame-line': 'var(--column-line)',
      },
      after,
    );
    looks(withClass(rendered(<ScrollbarMarksShown />), 'scrollbar-marks'), {
      position: 'absolute',
      top: 'var(--scrollbar-size)',
      right: 'var(--line-right, 0px)',
      bottom: 'calc(var(--diff-bar-below) + var(--scrollbar-size))',
      width: 'var(--scrollbar-size)',
      'pointer-events': 'none',
    });
  });

  test('starts the scrollbar below a diff where its text starts, after the two columns of line numbers of an inline diff, after the one of each side of one side by side, and after the one of a file shown whole, as the scrollbar below such a file started a column of numbers too far in', () => {
    looks(below(<DiffViewShown />), {
      left: 'calc(2 * var(--diff-number-width))',
    });
    looks(below(<DiffViewShown sideBySide />), {
      left: 'var(--diff-number-width)',
    });
    looks(below(<DiffViewShown whole />), {
      left: 'var(--diff-number-width)',
    });
  });

  test('draws the marks of a diff over the middle of the track of its scrollbar, leaving the thumb to be seen at either side of them, and what a find matched over its right half', () => {
    const shown = rendered(<ScrollbarMarksShown />);
    looks(withClass(shown, 'scrollbar-mark', 'added'), {
      left: '25%',
      right: '25%',
    });
    looks(withClass(shown, 'scrollbar-mark', 'match'), {
      left: '50%',
      right: '10%',
    });
  });

  test('draws the marks of changes as see-through as the theme says', () => {
    for (const [kind, color] of [
      ['added', 'added'],
      ['removed', 'deleted'],
    ]) {
      looks(
        withClass(rendered(<ScrollbarMarksShown />), 'scrollbar-mark', kind),
        {
          opacity: undefined,
          background: `color-mix( in srgb, var(--color-change-${color}) var(--color-change-${color}-mark), transparent )`,
        },
      );
    }
  });

  test('tints the line numbers of a changed line with its row, and its changed characters as strongly as the theme says, the full height of the line', () => {
    for (const [kind, color, word] of [
      ['added', 'added', 'word-added'],
      ['removed', 'deleted', 'word-removed'],
    ] as const) {
      const inline = shownRow(
        diffView(<DiffViewShown />, <InlineLine kind={kind} word />),
      );
      looks(withClass(inline, word), {
        background: `color-mix( in srgb, var(--color-change-${color}) var(--color-change-${color}-line), transparent )`,
      });
      const split = shownRow(
        diffView(
          <DiffViewShown sideBySide />,
          <SplitLine
            left={kind === 'removed' ? kind : ''}
            right={kind === 'added' ? kind : ''}
          />,
        ),
      );
      for (const number of [
        ...allWithClass(inline, 'number'),
        ...allWithClass(split, 'number'),
      ]) {
        looks(number, { background: undefined, 'background-color': undefined });
      }
    }
  });

  test('tints the whole row of every added and removed line more lightly, as the theme says, in the colors their marks on the scrollbar are drawn in', () => {
    for (const [kind, color] of [
      ['added', 'added'],
      ['removed', 'deleted'],
    ] as const) {
      const tint = {
        background: `color-mix( in srgb, var(--color-change-${color}) var(--color-change-${color}-row), transparent )`,
      };
      looks(
        withClass(
          diffView(<DiffViewShown />, <InlineLine kind={kind} />),
          'text-line',
        ),
        tint,
      );
      looks(
        withClass(
          diffView(
            <DiffViewShown sideBySide />,
            <SplitLine
              left={kind === 'removed' ? kind : ''}
              right={kind === 'added' ? kind : ''}
            />,
          ),
          'split-side',
          kind,
        ),
        tint,
      );
    }
  });

  test('draws the button that shows a large diff as a button of a bar, in its gray, as it stood out in the solid focus color among the quiet notes of the diff', () => {
    looks(
      withClass(
        rendered(
          <div className="large-diff">
            <button className="show" />
          </div>,
        ),
        'show',
      ),
      {
        color: 'var(--color-foreground)',
        background: 'var(--button-background)',
      },
    );
  });

  test('puts the dots of a hunk divider under the line numbers, in both of them inline and in the one of a side by side', () => {
    looks(
      withClass(
        diffView(
          <DiffViewShown sideBySide={false} />,
          <DiffRow>
            <HunkDivider />
          </DiffRow>,
        ),
        'hunk-dots',
      ),
      { width: 'calc(2 * var(--diff-number-width))' },
    );
    looks(
      withClass(
        diffView(
          <DiffViewShown sideBySide />,
          <DiffRow>
            <HunkDivider />
          </DiffRow>,
        ),
        'hunk-dots',
      ),
      { width: 'var(--diff-number-width)' },
    );
  });

  test('sets the paths of git in monospace, as every path of the app, the header of a file of the diff and the names of the files tree, and not the headings of the changes', () => {
    const monospace = [
      'var(--monospace-font-family)',
      'var(--monospace-font-size)',
    ];
    const header = withClass(
      diffView(
        <DiffViewShown />,
        <DiffRow>
          <FileHeader
            path="src/a.ts"
            open
            notes={[]}
            collapsible
            onClick={noop}
          />
        </DiffRow>,
      ),
      'file-header',
    );
    assert.deepStrictEqual(fontOf(withClass(header, 'path')), monospace);
    const files = rendered(
      <div>
        <div className="row group">
          <span className="path">All Changes</span>
        </div>
        <div className="row tree-row folder">
          <span className="path">src</span>
        </div>
        <div className="row tree-row file">
          <span className="path">a.ts</span>
        </div>
      </div>,
    );
    assert.deepStrictEqual(allWithClass(files, 'path').map(fontOf), [
      [undefined, undefined],
      monospace,
      monospace,
    ]);
  });

  test('keeps the button of a file header within the header, as far from its end as its name is from its start, and in view however wide the lines make the header', () => {
    const header = withClass(
      diffView(
        <DiffViewShown />,
        <DiffRow>
          <FileHeader
            path="v.svg"
            open
            notes={[]}
            collapsible
            onClick={noop}
            onView={noop}
          />
        </DiffRow>,
      ),
      'file-header',
    );
    const padding = paddingOf(header);
    assert.strictEqual(padding.right, padding.left);
    looks(header, { height: 'var(--diff-file-height)' });
    assert.strictEqual(
      cascaded(withClass(header, 'file-header-button'), 'height'),
      'calc(var(--diff-file-height) - 2px)',
    );
    const end = withClass(header, 'file-header-end');
    assert.ok(
      end.children.some((child) =>
        child.classes.includes('file-header-button'),
      ),
    );
    looks(end, { position: 'sticky', right: padding.right });
  });

  test('highlights what a find in the diff matched in the search match colors, edging the current match, and ticks the scrollbar in them', () => {
    const [match, current] = allWithClass(
      diffView(<DiffViewShown />, <InlineLine kind="context" finds />),
      'find-match',
    );
    const colors = {
      color: 'var(--color-search-match-foreground)',
      background: 'var(--color-search-match)',
    };
    looks(match, { ...colors, 'box-shadow': undefined });
    looks(current, {
      ...colors,
      'box-shadow': currentMatchOutline,
    });
    assert.ok(current.classes.includes('current'));
    looks(
      withClass(rendered(<ScrollbarMarksShown />), 'scrollbar-mark', 'match'),
      {
        background: 'var(--color-search-match)',
      },
    );
  });

  test('divides the two sides with one hairline from top to bottom, across headers and hunk gaps, letting the pointer through', () => {
    const view = diffView(
      <DiffViewShown sideBySide />,
      <SplitLine left="" right="" />,
    );
    looks(
      view,
      {
        content: "''",
        position: 'absolute',
        top: '0',
        bottom: '0',
        left: '50%',
        width: 'var(--hairline)',
        background: 'var(--color-border)',
        'pointer-events': 'none',
      },
      after,
    );
    const [left, right] = allWithClass(shownRow(view), 'split-side').map(
      (side) => matchingRules(side).map((rule) => rule.selector),
    );
    assert.deepStrictEqual(right, left);
  });

  test('stripes the empty side of a change in the border color, in square tiles half a line tall, so the stripes run on from tile to tile and a line scrolled moves them by whole stripes, shifting the stripes of each row up by how far down it is, so they make one pattern across rows however tall the lines', () => {
    const filler =
      cascaded(
        withClass(
          diffView(
            <DiffViewShown sideBySide />,
            <SplitLine left="filler" right="added" />,
          ),
          'split-side',
          'filler',
        ),
        'background',
      ) ?? '';
    const tile = 'calc(var(--diff-line-height) / 2)';
    assert.match(filler, /linear-gradient\( -45deg, var\(--color-border\)/);
    assert.ok(
      filler.endsWith(
        `) 0 calc(-1 * var(--diff-row-top, 0px)) / ${tile} ${tile}`,
      ),
      filler,
    );
  });
});
