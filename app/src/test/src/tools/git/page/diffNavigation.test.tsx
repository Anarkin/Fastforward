import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { sidewaysColumns } from '../../../../../lib/page/rowScroll';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../../tools/git/page/diff';
import type { TextWidths } from '../../../../../lib/page/textWidths';
import { kinds } from './diffViewFixtures';
import { diffRows, type DiffRow } from '../../../../../tools/git/page/diffRows';
import {
  changeMargin,
  changeScrollTop,
  changeStarts,
  diffScrollLeft,
  diffScrollTop,
  firstChangeTop,
  foundMiddle,
  foundScroll,
  keyedScrollTop,
} from '../../../../../tools/git/page/diffScrolling';
import {
  FileHeader,
  HunkDivider,
} from '../../../../../tools/git/page/diffRowParts';

suite('Diff keys', () => {
  test('scrolls back left with the left arrow while scrolled right, as many columns of the text a press as the viewer does, leaving it to move between the columns only then', () => {
    assert.strictEqual(
      diffScrollLeft(-1, 100, undefined, 7),
      100 - sidewaysColumns * 7,
    );
    assert.strictEqual(diffScrollLeft(-1, 20, undefined, 7), 0);
    assert.strictEqual(diffScrollLeft(-1, 0, undefined, 7), undefined);
    assert.strictEqual(diffScrollLeft(1, 100, undefined, 7), undefined);
  });

  test('scrolls the sides of a side by side diff right with the right arrow too, no further than the widest line, as nothing else scrolls them', () => {
    assert.strictEqual(diffScrollLeft(1, 0, 100, 7), sidewaysColumns * 7);
    assert.strictEqual(diffScrollLeft(1, 80, 100, 7), 100);
    assert.strictEqual(diffScrollLeft(1, 100, 100, 7), undefined);
    assert.strictEqual(diffScrollLeft(1, 0, 0, 7), undefined);
    assert.strictEqual(
      diffScrollLeft(-1, 100, 100, 7),
      100 - sidewaysColumns * 7,
    );
  });

  test('scrolls a line with the arrows, as the terminal, the viewer and the commander do, a screen less a line with the page keys, and to either end', () => {
    assert.strictEqual(diffScrollTop('down', 100, 400, 2000), 122);
    assert.strictEqual(diffScrollTop('up', 40, 400, 2000), 18);
    assert.strictEqual(diffScrollTop('up', 10, 400, 2000), 0);
    assert.strictEqual(diffScrollTop('pageDown', 100, 400, 2000), 478);
    assert.strictEqual(diffScrollTop('pageUp', 500, 400, 2000), 122);
    assert.strictEqual(diffScrollTop('first', 500, 400, 2000), 0);
    assert.strictEqual(diffScrollTop('last', 0, 400, 2000), 1600);
    assert.strictEqual(diffScrollTop('last', 0, 400, 300), 0);
  });

  test('scrolls by lines as tall as those of the diff', () => {
    assert.strictEqual(diffScrollTop('down', 100, 400, 2000, 17), 117);
    assert.strictEqual(diffScrollTop('up', 100, 400, 2000, 17), 83);
    assert.strictEqual(diffScrollTop('pageDown', 100, 400, 2000, 17), 483);
    assert.strictEqual(diffScrollTop('pageUp', 500, 400, 2000, 17), 117);
  });
});

const changeTops = () => [100, 500, 900];

suite('Jumping between changes', () => {
  test('finds where each run of added or removed lines starts', () => {
    const rows = diffRows(
      parsePatch(
        [
          'diff --git a/a.ts b/a.ts',
          '--- a/a.ts',
          '+++ b/a.ts',
          '@@ -1,6 +1,6 @@',
          ' one',
          '-two',
          '+2',
          ' three',
          ' four',
          '+five',
          '',
        ].join('\n'),
      ),
      new Map(),
      undefined,
    );
    assert.deepStrictEqual(
      changeStarts(rows).map((index) => rows[index]),
      [
        {
          kind: 'line',
          file: 0,
          line: {
            kind: 'removed',
            oldNumber: 2,
            newNumber: undefined,
            text: 'two',
          },
        },
        {
          kind: 'line',
          file: 0,
          line: {
            kind: 'added',
            oldNumber: undefined,
            newNumber: 5,
            text: 'five',
          },
        },
      ],
    );
  });

  test('scrolls to the first change below the header and some context, as J would from above it, and nowhere without a change', () => {
    assert.strictEqual(firstChangeTop([100, 500], 60), 40);
    assert.strictEqual(firstChangeTop([30, 500], 60), 0);
    assert.strictEqual(firstChangeTop([], 60), undefined);
  });

  test('scrolls to the next or previous change below the header and some context, and no further at either end', () => {
    const starts = [100, 500, 900];
    assert.strictEqual(changeScrollTop(starts, 0, 1, 60), 40);
    assert.strictEqual(changeScrollTop(starts, 40, 1, 60), 440);
    assert.strictEqual(changeScrollTop(starts, 440, -1, 60), 40);
    assert.strictEqual(changeScrollTop(starts, 40, -1, 60), undefined);
    assert.strictEqual(changeScrollTop(starts, 840, 1, 60), undefined);
    assert.strictEqual(changeScrollTop([30], 100, -1, 60), 0);
  });

  test('jumps to the change after or before where a smooth scroll is headed, as the arrows and page keys move from there too, as J pressed while the view glided went back to a change it had passed', () => {
    const headedTo = 440;
    assert.strictEqual(
      keyedScrollTop(1, undefined, headedTo, 400, 2000, 22, changeTops),
      834,
    );
    assert.strictEqual(
      keyedScrollTop(-1, undefined, headedTo, 400, 2000, 22, changeTops),
      434,
    );
    assert.strictEqual(
      keyedScrollTop(undefined, 'down', headedTo, 400, 2000, 22, changeTops),
      462,
    );
    assert.strictEqual(
      keyedScrollTop(undefined, undefined, headedTo, 400, 2000, 22, changeTops),
      undefined,
    );
  });

  test('leaves room above a change for the file header stuck atop the diff, a line itself, and two lines, however tall the lines', () => {
    assert.strictEqual(changeMargin(22), 66);
    assert.strictEqual(changeMargin(17), 51);
  });
});

const longLine = (kind: 'context' | 'added' | 'removed') => ({
  kind,
  oldNumber: 1,
  newNumber: 1,
  text: 'a'.repeat(400),
});

const foundOn = (line: number) => ({ file: 0, line, start: 300, end: 304 });

const monospace: TextWidths = {
  char: 8,
  of: (cluster) => assert.fail(`measured ${cluster}`),
};

suite('Diff sideways scrolling', () => {
  test('scrolls sideways to a found match hidden past an edge of the side it is on', () => {
    const view = { scrolled: 0, width: 600, room: 3000, minimap: 40 };
    const inline: DiffRow = { kind: 'line', file: 0, line: longLine('added') };
    assert.strictEqual(foundScroll(inline, foundOn(3), view, monospace), 2254);
    const whole: DiffRow = {
      kind: 'wholeLine',
      file: 0,
      number: 4,
      text: 'a'.repeat(400),
    };
    assert.strictEqual(foundScroll(whole, foundOn(3), view, monospace), 2198);
    const changed: DiffRow = {
      kind: 'split',
      file: 0,
      left: { index: 2, line: longLine('removed') },
      right: { index: 3, line: longLine('added') },
    };
    assert.strictEqual(foundScroll(changed, foundOn(2), view, monospace), 2122);
    assert.strictEqual(foundScroll(changed, foundOn(3), view, monospace), 2142);
    const cell = { index: 3, line: longLine('context') };
    const context: DiffRow = {
      kind: 'split',
      file: 0,
      left: cell,
      right: cell,
    };
    assert.strictEqual(foundScroll(context, foundOn(3), view, monospace), 2142);
    assert.strictEqual(
      foundScroll(
        inline,
        { ...foundOn(3), start: 10, end: 14 },
        view,
        monospace,
      ),
      0,
    );
    assert.strictEqual(
      foundScroll(
        inline,
        { ...foundOn(3), start: 0, end: 4 },
        { ...view, scrolled: 2000 },
        monospace,
      ),
      0,
    );
    assert.strictEqual(
      foundScroll({ kind: 'hunk', file: 0 }, foundOn(3), view, monospace),
      undefined,
    );
  });
});

suite('Diff scrolling to a match', () => {
  test('scrolls a wrapped diff to the middle of the match found once it is out of view, or under the stuck header, rather than to the middle of its row, as a line wrapped onto more rows than the view holds kept the match out of it, and leaves a match in view where it is', () => {
    const view = { top: 22, bottom: 400 };
    const row = { top: -1000, start: 5000 };
    assert.strictEqual(
      foundMiddle({ top: 900, bottom: 917 }, view, row),
      6908.5,
    );
    assert.strictEqual(
      foundMiddle({ top: -300, bottom: -283 }, view, row),
      5708.5,
    );
    assert.strictEqual(foundMiddle({ top: 10, bottom: 27 }, view, row), 6018.5);
    assert.strictEqual(
      foundMiddle({ top: 390, bottom: 407 }, view, row),
      6398.5,
    );
    assert.strictEqual(
      foundMiddle({ top: 100, bottom: 117 }, view, row),
      undefined,
    );
  });
});

suite('Hunk divider', () => {
  test('marks the lines left out between hunks with dots', () => {
    assert.strictEqual(
      renderToStaticMarkup(<HunkDivider />),
      '<div class="hunk-divider"><span class="hunk-dots">⋯</span></div>',
    );
  });
});

const viewHeader = (onView?: () => void) =>
  renderToStaticMarkup(
    <FileHeader
      path="v.svg"
      open
      whole={false}
      collapsible
      onClick={() => {}}
      onView={onView}
    />,
  );

suite('Files to view', () => {
  const svg = parsePatch(
    [
      'diff --git a/v.svg b/v.svg',
      `index ${'1'.repeat(40)}..${'2'.repeat(40)}`,
      '--- a/v.svg',
      '+++ b/v.svg',
      '@@ -1 +1 @@',
      '-<svg/>',
      '+<svg />',
    ].join('\n'),
  );

  test('shows an SVG by its lines as any text, to be seen drawn in a tab of its own', () => {
    for (const sideBySide of [false, true]) {
      const rows = kinds(
        diffRows(svg, new Map(), undefined, false, sideBySide),
      );
      assert.ok(rows.includes(sideBySide ? 'split' : 'line'));
      assert.ok(!rows.includes('image'));
    }
    const whole = { path: 'v.svg', content: '<svg/>\n', binary: false };
    assert.deepStrictEqual(kinds(diffRows([], new Map(), whole)), [
      'error',
      'file',
      'wholeLine',
    ]);
  });

  test('offers to view a file in a tab of its own only where the diff can tell where to read it from', () => {
    assert.doesNotMatch(viewHeader(), /<button/);
    assert.match(
      viewHeader(() => {}),
      /<button class="nav-button file-header-button" title="View the File in a Tab of Its Own">/,
    );
  });
});
