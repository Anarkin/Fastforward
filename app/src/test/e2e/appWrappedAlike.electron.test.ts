import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Locator } from 'playwright-core';
import { suite, test } from 'vitest';
import { wrapColumns, wrapIndent, wrapStarts } from '../../lib/page/wordWrap';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import { alikeWithin } from './alikeWithin';
import { cellsOf } from './cellsSeen';
import { diffLinesSeen, untilDiffLine } from './diffSeen';
import { untilSettled, waitForFocus } from './waits';
import {
  markedNames,
  opened,
  page,
  rowNames,
  select,
  sharedCommanderApp,
  wrapLongLines,
} from './commanderAppFixtures';
import { firstViewerRow } from './viewerAppFixtures';

const escape = String.fromCharCode(27);
const bell = String.fromCharCode(7);
const startOfHeading = String.fromCharCode(1);
const deleteCharacter = String.fromCharCode(127);
const formFeed = String.fromCharCode(12);

const readmeLine = `- ${'Open a repository in a terminal with ff or ff and its '.repeat(6)}path, or with Open in Fastforward from the menu of Explorer, in a folder.`;

const wrappedLines = [
  '# Wrapped alike',
  readmeLine,
  `    ${'an indented line of words wrapping onto rows hanging as far in as it, '.repeat(9)}`,
  `| Feature${' '.repeat(150)}| What it does${' '.repeat(150)}| Notes |`,
  `\t${'a line after a tab, wrapping where the others wrap; '.repeat(12)}`,
  'https://example.com/some/path/to/a-file.txt?query=value&other=1 '.repeat(9),
  `${escape}[31mred${escape}[0m text-${bell}bell and/${startOfHeading}more, a?${deleteCharacter}b (${escape}x) `.repeat(
    9,
  ),
  `page-${formFeed}break and)${formFeed}after (${formFeed}before a${formFeed}b,${formFeed}c `.repeat(
    9,
  ),
  'short',
];

interface Row {
  readonly line: number;
  readonly from: number;
  readonly x: number;
  readonly y: number;
}

interface Place {
  readonly x: number;
  readonly y: number;
}

interface Layout {
  readonly edge: number;
  readonly rows: readonly Row[];
  readonly breaks: readonly Place[];
}

const hundredths = (value: number) => Math.round(value * 100) / 100;

const layoutUnit = 1 / 32;

interface Viewed {
  readonly name: string;
  readonly body: string;
  readonly box: string;
  readonly cells: string;
}

const viewer: Viewed = {
  name: 'viewer',
  body: '.viewer-body',
  box: '.viewer-rows',
  cells: '.viewer-rows .cell-rows',
};

const editor: Viewed = {
  name: 'editor',
  body: '.editor-body',
  box: '.editor-content',
  cells: '.editor .editor-cells',
};

const originOf = async ({ name, body }: Viewed) => {
  const box = await page.locator(body).boundingBox();
  if (box === null) {
    throw new Error(`No ${name}`);
  }
  return box;
};

const layoutOf = async (view: Viewed): Promise<Layout> => {
  const origin = await originOf(view);
  const edge = await page.locator(view.body).evaluate((body, within) => {
    const box = body.querySelector(within);
    if (box === null) {
      throw new Error('No rows');
    }
    return (
      box.getBoundingClientRect().right -
      parseFloat(getComputedStyle(box).paddingRight) -
      body.getBoundingClientRect().left
    );
  }, view.box);
  const cells = cellsOf(page, view.cells);
  const seen = await cells.rows();
  const starts: string[] = [];
  const rows = seen.flatMap(({ key, text, from, left, top }) => {
    const start = key.slice(0, key.indexOf(':'));
    if (!starts.includes(start)) {
      starts.push(start);
    }
    return text.length === 0
      ? []
      : [
          {
            line: starts.indexOf(start),
            from,
            x: left - origin.x,
            y: top - origin.y,
          },
        ];
  });
  const breaks = (await cells.glyphs(strings.symbols.breaks)).flatMap(
    ({ row, column }) => {
      const at = seen[row];
      return at === undefined
        ? []
        : [
            {
              x: at.left + (column - at.column) * at.advance - origin.x,
              y: at.top - origin.y,
            },
          ];
    },
  );
  return { edge, rows, breaks };
};

const rounded = ({ edge, rows, breaks }: Layout): Layout => ({
  edge: hundredths(edge),
  rows: rows.map((row) => ({
    ...row,
    x: hundredths(row.x),
    y: hundredths(row.y),
  })),
  breaks: breaks
    .map((mark) => ({ x: hundredths(mark.x), y: hundredths(mark.y) }))
    .toSorted((a, b) => a.y - b.y || a.x - b.x),
});

interface Hanging {
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

const whitespaceButton = (pressed?: boolean) =>
  page.locator('.viewer').getByRole('button', {
    name: 'Show Whitespace',
    ...(pressed === undefined ? {} : { pressed }),
  });

const showWhitespace = () => whitespaceButton().click();

const hangingOf = async (view: Viewed): Promise<Hanging[]> => {
  const origin = await originOf(view);
  const cells = cellsOf(page, view.cells);
  const seen = await cells.rows();
  const placed = (
    row: number,
    column: number,
    columns: number,
    kind: string,
  ) => {
    const at = seen[row];
    return at === undefined
      ? []
      : [
          {
            kind,
            x: hundredths(
              at.left + (column - at.column) * at.advance - origin.x,
            ),
            y: hundredths(at.top - origin.y),
            width: hundredths(columns * at.advance),
          },
        ];
  };
  const runs: { row: number; column: number; columns: number }[] = [];
  for (const { row, column } of (await cells.dots()).toSorted(
    (one, other) => one.row - other.row || one.column - other.column,
  )) {
    const last = runs.at(-1);
    if (
      last !== undefined &&
      last.row === row &&
      last.column + last.columns === column
    ) {
      last.columns++;
    } else {
      runs.push({ row, column, columns: 1 });
    }
  }
  return [
    ...runs.flatMap(({ row, column, columns }) =>
      placed(row, column, columns, 'spaces'),
    ),
    ...(await cells.glyphs(strings.symbols.tab)).flatMap(({ row, column }) =>
      placed(row, column, 1, 'blank'),
    ),
  ].toSorted((a, b) => a.y - b.y || a.x - b.x);
};

interface DiffWrap {
  readonly text: string;
  readonly starts: readonly number[];
  readonly width: number;
  readonly char: number;
  readonly marksInside: boolean;
  readonly clear: boolean;
  readonly breaksMarked: number;
}

const compared = '.compare-view';

async function diffWraps(): Promise<readonly DiffWrap[]> {
  const probes = await page
    .locator(`${compared} .diff-view .wrap-probe:has(.number) .code`)
    .evaluateAll((codes) =>
      codes.map((code) => {
        const style = getComputedStyle(code);
        return {
          width:
            code.getBoundingClientRect().width -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight),
          char:
            (code.querySelector('.wrap-sample')?.getBoundingClientRect()
              .width ?? 0) / 1000,
        };
      }),
    );
  const bar = await page
    .locator(`${compared} .diff-view > .virtual-rows`)
    .evaluate(
      (rows) =>
        rows.getBoundingClientRect().left + rows.clientLeft + rows.clientWidth,
    );
  return (await diffLinesSeen(page, compared))
    .filter(
      ({ text, rows }) =>
        text.length > 0 && rows.map((row) => row.text).join('') === text,
    )
    .map(({ text, rows, side }) => {
      const probe = probes[side] ?? probes[0];
      const width = probe?.width ?? 0;
      const char = probe?.char ?? 0;
      const [first] = rows;
      const contentRight =
        (first === undefined ? 0 : first.left - first.column * first.advance) +
        width;
      const marks = rows.filter(({ breakAt }) => breakAt !== undefined);
      let at = 0;
      return {
        text,
        starts: rows.map((row) => {
          const start = at;
          at += row.text.length;
          return start;
        }),
        width,
        char,
        marksInside: marks.every(
          (row) =>
            row.left + ((row.breakAt ?? 0) - row.column + 1) * row.advance <=
            contentRight + 2 * char + 0.5,
        ),
        clear: contentRight + 2 * char <= bar + 0.5,
        breaksMarked: marks.length,
      };
    });
}

const expectedWrap = ({ text, width, char }: DiffWrap) => {
  const columns = wrapColumns(width, char);
  return wrapStarts(text, columns, wrapIndent(text, columns));
};

const wrappedAsExpected = (wraps: readonly DiffWrap[]) =>
  wraps.map((wrap) => ({
    line: wrap.text.slice(0, 20),
    starts: wrap.starts,
    marksInside: wrap.marksInside,
    clear: wrap.clear,
    breaksMarked: wrap.breaksMarked,
  }));

const brokenByTheBrowserAlone = (text: string) => text.includes(formFeed);

const expectedWraps = (wraps: readonly DiffWrap[]) =>
  wraps.map((wrap) => ({
    line: wrap.text.slice(0, 20),
    starts: brokenByTheBrowserAlone(wrap.text)
      ? wrap.starts
      : expectedWrap(wrap),
    marksInside: true,
    clear: true,
    breaksMarked: wrap.starts.length - 1,
  }));

async function marked(name: string): Promise<void> {
  await select(name);
  await page.keyboard.press('Space');
}

async function closeTabShown(what: Locator): Promise<void> {
  if (await what.isVisible()) {
    await page.keyboard.press('Escape');
    await what.waitFor({ state: 'detached' });
  }
}

suite('App', () => {
  sharedCommanderApp();

  test('wraps a file viewed and the same file edited alike in one window, every row starting at the same character in the same place, the text ending as far from the edge and every break and every blank hanging at it while whitespace is hidden marked in the same place, and the diff of it inline and side by side where its text box says, the marks of its breaks left of the scrollbar', async () => {
    const text = wrappedLines.join(String.fromCharCode(10));
    fs.writeFileSync(path.join(opened, 'wrapped.txt'), text);
    fs.writeFileSync(
      path.join(opened, 'before.txt'),
      ['# Wrapped', ...wrappedLines.slice(1)].join(String.fromCharCode(10)),
    );
    try {
      await select('wrapped');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === wrappedLines[0],
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      await wrapLongLines();
      const viewed = await untilSettled(
        async () => rounded(await layoutOf(viewer)),
        'the viewer to settle, its breaks marked',
        { accepted: ({ breaks }) => breaks.length > 0 },
      );
      await showWhitespace();
      await whitespaceButton(false).waitFor();
      const viewedHanging = await untilSettled(
        () => hangingOf(viewer),
        'the blanks hanging in the viewer',
        { accepted: (hanging) => hanging.length > 0 },
      );
      await showWhitespace();
      await whitespaceButton(true).waitFor();

      await page.keyboard.press('F4');
      await page.locator('.editor .editor-content').waitFor();
      const edited = await untilSettled(
        async () => rounded(await layoutOf(editor)),
        'the editor to settle, its breaks marked',
        { accepted: ({ breaks }) => breaks.length > 0 },
      );
      assert.ok(
        viewed.rows.length > wrappedLines.length + 8,
        String(viewed.rows.length),
      );
      alikeWithin(edited, viewed, layoutUnit);
      await showWhitespace();
      await whitespaceButton(false).waitFor();
      const editedHanging = await untilSettled(
        () => hangingOf(editor),
        'the blanks hanging in the editor',
        { accepted: (hanging) => hanging.length > 0 },
      );
      assert.ok(viewedHanging.length > 0);
      alikeWithin(editedHanging, viewedHanging, layoutUnit);
      await showWhitespace();
      await whitespaceButton(true).waitFor();
      await closeTabShown(page.locator('.editor'));
      await closeTabShown(page.locator('.viewer'));

      await marked('before');
      await marked('wrapped');
      await waitFor(
        async () =>
          (await markedNames()).toSorted().join() === 'before,wrapped',
        'both files to be marked',
      );
      await page.keyboard.press('Shift+F3');
      const wrapped = () =>
        untilDiffLine(
          page,
          ({ rows }) => rows.length > 1,
          'a line of the diff wrapped onto rows',
          compared,
        );
      await page.locator('.compare-view .diff-view.wrap').waitFor();
      await wrapped();
      for (const layout of ['Inline', 'Side by Side']) {
        await page.getByRole('button', { name: layout }).click();
        await page
          .locator(
            layout === 'Inline'
              ? '.compare-view .diff-view.wrap:not(.side-by-side)'
              : '.compare-view .diff-view.wrap.side-by-side',
          )
          .waitFor();
        await waitFor(
          async () =>
            new Set(
              (await diffLinesSeen(page, compared)).map(({ side }) => side),
            ).size === (layout === 'Inline' ? 1 : 2),
          `the diff drawn ${layout}`,
        );
        await wrapped();
        const wraps = await diffWraps();
        assert.ok(wraps.length >= wrappedLines.length, layout);
        assert.deepStrictEqual(
          wrappedAsExpected(wraps),
          expectedWraps(wraps),
          layout,
        );
      }
      await page.keyboard.press('Escape');
      await page.locator('.compare-view').waitFor({ state: 'detached' });
    } finally {
      await closeTabShown(page.locator('.viewer'));
      for (const name of ['wrapped.txt', 'before.txt']) {
        fs.rmSync(path.join(opened, name));
      }
      await waitFor(
        async () =>
          !(await rowNames()).some(
            (name) => name === 'wrapped.txt' || name === 'before.txt',
          ),
        'the files to be gone from the list',
      );
    }
  });
});
