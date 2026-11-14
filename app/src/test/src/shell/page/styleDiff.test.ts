import * as assert from 'node:assert';
import { createElement } from 'react';
import { suite, test } from 'vitest';
import { columnsClass } from '../../../../tools/git/page/columns';
import { ImageDiff } from '../../../../tools/git/page/imagePreview';
import { Crash } from '../../../../shell/page/errorBoundary';
import {
  codePadding,
  markerWidth,
  numberWidth,
} from '../../../../tools/git/page/overflow';
import { tabSize } from '../../../../lib/page/wordWrap';
import { TerminalTool } from '../../../../tools/terminal/page/tool';
import {
  allWithClass,
  cascaded,
  matchingRules,
  rendered,
  withClass,
} from '../../../helpers/cascade';
import {
  columns,
  diffRow,
  diffView,
  inlineLine,
  minimap,
  shownRow,
  splitLine,
} from '../../../helpers/styleFixtures';
import {
  noop,
  indented,
  cell,
  spaceDots,
  squareDots,
  spaceDotSize,
  spaceDotStart,
  hanging,
  compact,
  looks,
  paddingOf,
  after,
  hunkDots,
  fileHeader,
} from './stylesheetFixtures';
import { layoutVariables } from '../../../../tools/git/page/textLayout';
import { diffRowClass } from '../../../../tools/git/page/diffRowClasses';
import {
  FileNote,
  FileHeader,
  HunkDivider,
} from '../../../../tools/git/page/diffRowParts';

suite('Style', () => {
  test('places the hidden-change markers by the line numbers, padding and marker width the diff draws', () => {
    const row = shownRow(diffView({}, inlineLine('added', { marker: true })));
    looks(withClass(row, 'number'), { width: 'var(--diff-number-width)' });
    looks(withClass(row, 'code'), { padding: '0 var(--diff-code-padding)' });
    looks(withClass(row, 'hidden-change'), {
      width: 'var(--diff-marker-width)',
    });
    assert.deepStrictEqual(
      [
        layoutVariables['--diff-number-width'],
        layoutVariables['--diff-code-padding'],
        layoutVariables['--diff-marker-width'],
      ],
      [`${numberWidth}px`, `${codePadding}px`, `${markerWidth}px`],
    );
  });

  test('widens every row of an inline diff to its widest line and past it by the minimap, so short lines stay tinted, the strips between files and hunks reach across when scrolled sideways, and the widest line ends before the minimap', () => {
    const rows = allWithClass(
      diffView(
        {},
        fileHeader,
        diffRow(createElement(HunkDivider)),
        inlineLine('added'),
      ),
      'virtual-row',
      'diff-row',
    );
    assert.strictEqual(rows.length, 3);
    for (const row of rows) {
      looks(row, {
        'min-width':
          'max(100%, var(--diff-content-width, 0px) + var(--minimap-width))',
        width: 'max-content',
      });
    }
  });

  test('tints a binary file added or deleted like such a line, and hatches the side it lacks like one, both halves as tall as the row', () => {
    for (const change of ['added', 'removed'] as const) {
      assert.strictEqual(
        cascaded(
          withClass(
            rendered(
              createElement(FileNote, {
                text: 'Binary file',
                change,
                split: false,
              }),
            ),
            'file-note',
          ),
          'background',
        ),
        cascaded(
          withClass(diffView({}, inlineLine(change)), 'diff-line', change),
          'background',
        ),
      );
    }
    const split = rendered(
      createElement(FileNote, {
        text: 'Binary file',
        change: 'added',
        split: true,
      }),
    );
    assert.strictEqual(
      cascaded(withClass(split, 'filler'), 'background'),
      cascaded(
        withClass(
          diffView({ sideBySide: true }, splitLine('filler', 'added')),
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

  test('lays an error over the diff out as wide as the view, so a long one wraps rather than running past what can be scrolled to', () => {
    for (const sideBySide of [false, true]) {
      const view = diffView(
        { sideBySide },
        createElement(
          'div',
          { className: diffRowClass('error') },
          createElement('div', { className: 'error-message' }, 'fatal: x'),
        ),
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
          createElement(Crash, {
            title: 'Fastforward',
            error: new Error('boom'),
            onReload: noop,
            listen: () => noop,
            onQuit: noop,
          }),
        ),
        'error-message',
      ),
      { 'white-space': 'pre-wrap', 'overflow-wrap': 'anywhere' },
    );
  });

  test('keeps an image row as wide as the diff, its images in the part scrolled to, side by side and short of the minimap, hatching a side it lacks down to where an image could reach', () => {
    const view = diffView(
      {},
      createElement(
        'div',
        { className: diffRowClass('image') },
        createElement(ImageDiff, {
          panes: [
            { side: 'old', url: undefined },
            { side: 'new', url: 'a.png' },
          ],
        }),
      ),
    );
    looks(withClass(view, 'virtual-row', 'preview-row'), {
      'min-width': '0',
      width: '100%',
    });
    looks(withClass(view, 'image-diff'), {
      display: 'flex',
      height: '100%',
      width: '100%',
      'margin-left': 'var(--visible-left, 0px)',
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
          diffView({ sideBySide: true }, splitLine('filler', 'added')),
          'filler',
        ),
        'background',
      ),
    );
  });

  test('makes a cell of the terminal as tall and as wide as a character of the diff, so code looks the same in both', () => {
    const panel = rendered(
      createElement(TerminalTool, {
        active: true,
        post: noop,
        listen: () => noop,
      }),
    );
    assert.strictEqual(
      compact(cascaded(panel, '--terminal-row-height')),
      compact(cascaded(diffView(), '--diff-line-height')),
    );
    assert.strictEqual(
      compact(cascaded(panel, '--terminal-advance')),
      compact(cascaded(diffView(), '--diff-advance')),
    );
  });

  test('makes a line of the diff as tall as the font size of code times the line height, rounded to whole device pixels, so every line is drawn alike and the app places the rows a whole number of lines apart', () => {
    assert.strictEqual(
      compact(cascaded(diffView(), '--diff-line-height')),
      'round(var(--monospace-font-size) * var(--monospace-line-height), var(--device-pixel, 1px))',
    );
  });

  test('spaces the characters of code a whole number of device pixels apart, the nearest to their width, so each is drawn alike', () => {
    assert.strictEqual(
      compact(cascaded(diffView(), '--diff-advance')),
      'round(1ch, var(--device-pixel, 1px))',
    );
    for (const view of [
      diffView({}, inlineLine('added')),
      diffView({ sideBySide: true }, splitLine('removed', 'added')),
    ]) {
      for (const line of allWithClass(view, 'diff-line')) {
        looks(line, { 'letter-spacing': 'calc(var(--diff-advance) - 1ch)' });
      }
    }
  });

  test('paints the scroller of the diff in the color of its panel, so Chromium keeps the subpixel antialiasing of its text when it composites the scrolling', () => {
    looks(withClass(diffView(), 'virtual-rows'), {
      background: 'var(--repository-background)',
    });
  });

  test('moves each line of code onto whole device pixels by less than one, each side of a side-by-side diff on its own, by layout rather than a transform, which would cost the text its subpixel antialiasing', () => {
    const inline = shownRow(diffView({}, inlineLine('added')));
    looks(withClass(inline, 'diff-line'), {
      'margin-left': 'var(--diff-snap-inline, 0px)',
    });
    looks(withClass(inline, 'code'), { translate: undefined });
    const [left, right] = allWithClass(
      shownRow(diffView({ sideBySide: true }, splitLine('removed', 'added'))),
      'split-side',
    );
    for (const side of [left, right]) {
      looks(side, { 'margin-left': 'var(--diff-side-snap, 0px)' });
    }
  });

  test('wraps long lines of code at spaces, breaking a word only where it would not fit, in rows as tall as their lines', () => {
    const inline = shownRow(diffView({ wordWrap: true }, inlineLine('added')));
    looks(inline, { width: '100%' });
    looks(withClass(inline, 'text-line'), {
      height: 'auto',
      'min-height': 'var(--diff-line-height)',
    });
    looks(withClass(inline, 'code'), {
      'white-space': 'pre-wrap',
      'overflow-wrap': 'anywhere',
      'min-width': '0',
    });
    const split = shownRow(
      diffView(
        { sideBySide: true, wordWrap: true },
        splitLine('removed', 'added'),
      ),
    );
    for (const side of allWithClass(split, 'split-code')) {
      looks(withClass(side, 'code'), {
        display: 'block',
        transform: 'none',
        'white-space': 'pre-wrap',
      });
    }
  });

  test('indents the rows a long line wraps onto by its indentation, keeping the indentation on the row with the code it indents', () => {
    looks(withClass(indented(true), 'code'), {
      'padding-left':
        'calc(var(--diff-code-padding) + var(--wrap-indent, 0px))',
      'text-indent': 'calc(-1 * var(--wrap-indent, 0px))',
    });
    looks(withClass(indented(true), 'lead'), { 'white-space': 'pre' });
    looks(withClass(indented(false), 'code'), {
      'padding-left': undefined,
      'text-indent': undefined,
    });
  });

  test('shows the sign of each tab and other blank of an indented wrapped line on that blank, as the indentation hanging its rows moved the signs aside, squeezing them together', () => {
    const tab = rendered(
      createElement('span', { className: 'blank', 'data-glyph': '→' }, '\t'),
      withClass(indented(true), 'lead'),
    );
    looks(tab, { 'text-indent': '0' }, { pseudoElement: '::before' });
  });

  test('counts a column of a code block in a Markdown preview as one character of its font on whole device pixels, spacing its characters to match, as the viewer does, so its boxes keep the code on its grid, as a column of a fraction of a pixel let a row of boxes drift from it', () => {
    looks(
      withClass(
        rendered(
          createElement(
            'div',
            { className: 'markdown' },
            createElement(
              'pre',
              null,
              createElement('code', { className: 'shown' }, 'a'),
            ),
          ),
        ),
        'shown',
      ),
      {
        '--text-advance': 'round(1ch, var(--device-pixel, 1px))',
        'letter-spacing': 'calc(var(--text-advance) - 1ch)',
      },
    );
  });

  test('lays the code of a code block in a Markdown preview out as a block of its own, so its tabs stop every four columns of its font, as in the viewer and the diff, rather than every eight spaces of the default monospace font of the browser that the pre around it has', () => {
    looks(
      withClass(
        rendered(
          createElement(
            'div',
            { className: 'markdown' },
            createElement(
              'pre',
              null,
              createElement('code', { className: 'shown' }, 'a\tb'),
            ),
          ),
        ),
        'shown',
      ),
      { display: 'block', 'tab-size': String(tabSize) },
    );
  });

  test('draws a character in a box exactly as many columns of the text wide as it takes and a line tall, its glyph centered, as our terminal draws it on its grid, in the diff and the viewer alike, never making its line taller, as a shrunk emoji made a wrapped line of the diff two rows tall', () => {
    looks(cell('cell'), {
      display: 'inline-flex',
      'justify-content': 'center',
      'align-items': 'center',
      width: 'var(--text-advance)',
      height: '1lh',
      'vertical-align': 'top',
    });
    looks(cell('cell wide'), { width: 'calc(2 * var(--text-advance))' });
    looks(cell('cell zero'), { width: '0' });
    looks(withClass(diffView(), 'diff-view'), {
      '--text-advance': 'var(--diff-advance)',
    });
  });

  test('draws a run of spaces shown as square dots in its own background, each as wide as it is tall in whole device pixels and starting on a whole device pixel in the middle of each advance of the text, with no box over each space, as a box over every space of a padded table slowed scrolling down and let the browser break a run onto rows of its own', () => {
    const run = withClass(indented(true), 'spaces');
    looks(run, {
      position: undefined,
      ...squareDots,
    });
    assert.strictEqual(compact(cascaded(run, 'background-image')), spaceDots);
    assert.strictEqual(compact(cascaded(run, '--space-dot')), spaceDotSize);
    assert.strictEqual(
      compact(cascaded(run, '--space-dot-start')),
      spaceDotStart,
    );
    looks(run, { content: undefined }, { pseudoElement: '::before' });
  });

  test('marks the spaces hanging at the end of a wrapped row of the diff and the viewer with the same dots, on that row, leaving them to the spaces drawn in the diff while whitespace is shown', () => {
    const viewer = withClass(
      rendered(
        createElement(
          'div',
          { className: 'viewer-row' },
          createElement('span', { className: 'viewer-wrap-spaces' }),
        ),
      ),
      'viewer-wrap-spaces',
    );
    const dotted = squareDots;
    looks(hanging(false), {
      position: 'absolute',
      height: 'var(--diff-line-height)',
      display: undefined,
      ...dotted,
    });
    looks(hanging(true), { display: 'none' });
    looks(viewer, {
      position: 'absolute',
      top: '0',
      height: '100%',
      'pointer-events': 'none',
      ...dotted,
    });
    for (const marks of [hanging(false), viewer]) {
      assert.strictEqual(
        compact(cascaded(marks, 'background-image')),
        spaceDots,
      );
    }
  });

  test('ends the lines scrolled sideways before the minimap, keeping their rows tinted under it, but wraps lines under it, as text goes under the scrollbars everywhere else, with room for the sign of a break, so both sides wrap alike', () => {
    for (const wordWrap of [false, true]) {
      const clear = wordWrap
        ? 'calc(2 * var(--diff-code-padding) + 2ch)'
        : 'calc(var(--diff-code-padding) + var(--minimap-width))';
      looks(
        withClass(
          shownRow(diffView({ wordWrap }, inlineLine('added'))),
          'code',
        ),
        { 'padding-right': clear },
      );
      const [left, right] = allWithClass(
        shownRow(diffView({ sideBySide: true, wordWrap }, splitLine('', ''))),
        'split-side',
      ).map((side) => withClass(side, 'code'));
      looks(right, { 'padding-right': clear });
      looks(left, {
        'padding-right': wordWrap
          ? cascaded(right, 'padding-right')
          : undefined,
      });
    }
  });

  test('draws a tab in the code as wide as the wrapping and the hidden changes count it', () => {
    for (const wordWrap of [false, true]) {
      looks(
        withClass(
          shownRow(diffView({ wordWrap }, inlineLine('context'))),
          'code',
        ),
        { 'tab-size': 'var(--diff-tab-size)' },
      );
    }
    assert.strictEqual(layoutVariables['--diff-tab-size'], String(tabSize));
  });

  test('keeps the minimap of a diff and the scrollbar of a file viewed inside the line their column draws, all the way down, clipped to its rounded corner, as their thumbs reach the edges of their boxes', () => {
    looks(columns(columnsClass(true, 'a'), 'commits'), {
      '--column-line': undefined,
    });
    looks(withClass(columns(columnsClass(true, 'a'), 'commits'), 'column'), {
      '--column-line': 'round(2px, var(--device-pixel, 1px))',
    });
    looks(
      withClass(columns(columnsClass(true, 'a'), 'commits'), 'column'),
      {
        '--frame-line': 'var(--column-line)',
      },
      after,
    );
    for (const track of [
      minimap(),
      rendered(createElement('div', { className: 'viewer-scrollbar' })),
    ]) {
      looks(track, {
        right: 'var(--column-line, 0px)',
        bottom: 'var(--column-line, 0px)',
        'border-bottom-right-radius':
          'calc( var(--card-radius) - var(--column-line, 0px) )',
        overflow: 'hidden',
      });
    }
  });

  test('keeps the minimap of a diff as wide as its setting and its scrollbar as wide as the scrollbars, against its right edge, the marks across the whole minimap', () => {
    const shown = minimap();
    looks(shown, { width: 'var(--minimap-width)' });
    looks(withClass(shown, 'minimap-viewport'), {
      left: undefined,
      right: '0',
      width: 'var(--scrollbar-size)',
    });
    looks(withClass(shown, 'minimap-mark', 'added'), {
      left: '2px',
      right: '2px',
    });
  });

  test('draws the minimap marks as see-through as the theme says', () => {
    for (const [kind, color] of [
      ['added', 'added'],
      ['removed', 'deleted'],
    ]) {
      looks(withClass(minimap(), 'minimap-mark', kind), {
        opacity: undefined,
        background: `color-mix( in srgb, var(--color-change-${color}) var(--color-change-${color}-minimap), transparent )`,
      });
    }
  });

  test('draws the bar where words were inserted on the other line across the whole line, as wide as the app makes it, centered on its place and in the color of changed words', () => {
    for (const [kind, color] of [
      ['added', 'added'],
      ['removed', 'deleted'],
    ] as const) {
      looks(
        withClass(
          diffView({}, inlineLine(kind, { words: [{ start: 1, end: 1 }] })),
          'word-gap',
        ),
        {
          position: 'absolute',
          width: 'var(--diff-gap-width)',
          height: 'var(--diff-line-height)',
          'margin-left': 'calc(var(--diff-gap-width) / -2)',
          'padding-top': '0',
          'padding-bottom': '0',
          background: `color-mix( in srgb, var(--color-change-${color}) var(--color-change-${color}-line), transparent )`,
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
        diffView({}, inlineLine(kind, { words: [{ start: 0, end: 1 }] })),
      );
      looks(withClass(inline, word), {
        background: `color-mix( in srgb, var(--color-change-${color}) var(--color-change-${color}-line), transparent )`,
        'padding-top': 'var(--diff-word-padding-top)',
        'padding-bottom': 'var(--diff-word-padding-bottom)',
      });
      const split = shownRow(
        diffView(
          { sideBySide: true },
          splitLine(
            kind === 'removed' ? kind : '',
            kind === 'added' ? kind : '',
          ),
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

  test('tints the whole row of every added and removed line more lightly, as the theme says, in the colors their minimap marks are drawn in', () => {
    for (const [kind, color] of [
      ['added', 'added'],
      ['removed', 'deleted'],
    ] as const) {
      const tint = {
        background: `color-mix( in srgb, var(--color-change-${color}) var(--color-change-${color}-row), transparent )`,
      };
      looks(withClass(diffView({}, inlineLine(kind)), 'text-line'), tint);
      looks(
        withClass(
          diffView(
            { sideBySide: true },
            splitLine(
              kind === 'removed' ? kind : '',
              kind === 'added' ? kind : '',
            ),
          ),
          'split-side',
          kind,
        ),
        tint,
      );
    }
  });

  test('tints the whole row of a line changed through like changed words on a changed row, their tint over the row tint', () => {
    for (const [kind, color] of [
      ['added', 'added'],
      ['removed', 'deleted'],
    ] as const) {
      const word = `color-mix(in srgb, var(--color-change-${color}) var(--color-change-${color}-line), transparent)`;
      const tint = `linear-gradient(${word}, ${word}), color-mix(in srgb, var(--color-change-${color}) var(--color-change-${color}-row), transparent)`;
      for (const row of [
        withClass(diffView({}, inlineLine(kind, { whole: true })), 'text-line'),
        withClass(
          diffView(
            { sideBySide: true },
            splitLine(
              kind === 'removed' ? `${kind} whole-change` : 'filler',
              kind === 'added' ? `${kind} whole-change` : 'filler',
            ),
          ),
          'split-side',
          kind,
        ),
      ]) {
        assert.strictEqual(compact(cascaded(row, 'background')), tint);
      }
    }
  });

  test('draws the button that shows a large diff in the solid focus color', () => {
    looks(
      withClass(
        rendered(
          createElement(
            'div',
            { className: 'large-diff' },
            createElement('button', { className: 'show' }),
          ),
        ),
        'show',
      ),
      {
        color: 'var(--color-focus-foreground)',
        background:
          'linear-gradient(var(--color-focus), var(--color-focus)), var(--color-panel-background)',
      },
    );
  });

  test('puts the dots of a hunk divider under the line numbers, in both of them inline and in the one of a side by side', () => {
    looks(hunkDots(false), { width: 'calc(2 * var(--diff-number-width))' });
    looks(hunkDots(true), { width: 'var(--diff-number-width)' });
  });

  test('keeps the button of a file header clear of the minimap, within the header, and in view however wide the lines make the header', () => {
    const header = withClass(
      diffView(
        {},
        diffRow(
          createElement(FileHeader, {
            path: 'v.svg',
            open: true,
            whole: false,
            collapsible: true,
            onClick: noop,
            onView: noop,
          }),
        ),
      ),
      'file-header',
    );
    const padding = paddingOf(header);
    assert.strictEqual(
      padding.right,
      `calc(${padding.left} + var(--minimap-width))`,
    );
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

  test('lets a selection started on one side of the side-by-side diff take the code of that side only, as copying it took both sides of each row', () => {
    for (const [selecting, kept, left] of [
      ['left', 0, 1],
      ['right', 1, 0],
    ] as const) {
      const view = rendered(
        createElement(
          'div',
          { className: 'diff-view side-by-side', 'data-selecting': selecting },
          splitLine('removed', 'added'),
        ),
      );
      const codes = allWithClass(view, 'split-code');
      looks(codes[kept], { 'user-select': undefined });
      looks(codes[left], { 'user-select': 'none' });
    }
  });

  test('highlights what a find in the diff matched in the search match colors, edging the current match, and ticks the minimap in them', () => {
    const [match, current] = allWithClass(
      diffView(
        {},
        inlineLine('context', {
          finds: [
            { start: 0, end: 1 },
            { start: 2, end: 3 },
          ],
          current: { start: 2, end: 3 },
        }),
      ),
      'find-match',
    );
    const colors = {
      color: 'var(--color-search-match-foreground)',
      background: 'var(--color-search-match)',
    };
    looks(match, { ...colors, 'box-shadow': undefined });
    looks(current, {
      ...colors,
      'box-shadow':
        '0 0 0 var(--hairline) var(--color-search-match-foreground)',
    });
    assert.ok(current.classes.includes('current'));
    looks(withClass(minimap(), 'minimap-mark', 'match'), {
      background: 'var(--color-search-match)',
    });
  });

  test('divides the two sides with one hairline from top to bottom, across headers and hunk gaps, letting the pointer through', () => {
    const view = diffView({ sideBySide: true }, splitLine('', ''));
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
          diffView({ sideBySide: true }, splitLine('filler', 'added')),
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
