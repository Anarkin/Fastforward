import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Locator } from 'playwright-core';
import { suite, test } from 'vitest';
import { wrapColumns, wrapIndent, wrapStarts } from '../../lib/page/wordWrap';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import { alikeWithin } from './alikeWithin';
import { seenDots, seenGlyphs, seenRows } from './cellsSeen';
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

const viewerOrigin = async () => {
  const body = await page.locator('.viewer-body').boundingBox();
  if (body === null) {
    throw new Error('No viewer');
  }
  return body;
};

const viewerLayout = async (): Promise<Layout> => {
  const origin = await viewerOrigin();
  const edge = await page.locator('.viewer-body').evaluate((body) => {
    const box = body.querySelector('.viewer-rows');
    if (box === null) {
      throw new Error('No rows');
    }
    return (
      box.getBoundingClientRect().right -
      parseFloat(getComputedStyle(box).paddingRight) -
      body.getBoundingClientRect().left
    );
  });
  const textInset = await page
    .locator('.viewer-probe')
    .first()
    .evaluate((probe) => {
      const first = document
        .createTreeWalker(probe, NodeFilter.SHOW_TEXT)
        .nextNode();
      const range = document.createRange();
      if (first !== null) {
        range.setStart(first, 0);
        range.setEnd(first, 1);
      }
      return (
        range.getBoundingClientRect().top - probe.getBoundingClientRect().top
      );
    });
  const seen = await seenRows(page);
  const starts: number[] = [];
  const rows = seen.flatMap(({ key, text, left, top }) => {
    const [start = 0, from = 0] = key.split(':').map(Number);
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
            y: top + textInset - origin.y,
          },
        ];
  });
  const breaks = (await seenGlyphs(page, strings.symbols.breaks)).flatMap(
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

const editorLayout = (): Promise<Layout> =>
  page.locator('.editor-body').evaluate((body) => {
    const origin = body.getBoundingClientRect();
    const content = body.querySelector('.cm-content');
    if (content === null) {
      throw new Error('No content');
    }
    const style = getComputedStyle(content);
    const range = document.createRange();
    const rows = [...content.querySelectorAll('.cm-line')].flatMap(
      (line, index) => {
        const found: Row[] = [];
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        let offset = 0;
        let lastTop = Number.NaN;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!(node instanceof Text)) {
            continue;
          }
          for (let at = 0; at < node.length; at++) {
            range.setStart(node, at);
            range.setEnd(node, at + 1);
            const rect = range.getBoundingClientRect();
            if (!(Math.abs(rect.top - lastTop) < rect.height / 2)) {
              found.push({
                line: index,
                from: offset + at,
                x: rect.left - origin.left,
                y: rect.top - origin.top,
              });
              lastTop = rect.top;
            }
          }
          offset += node.length;
        }
        return found;
      },
    );
    return {
      edge:
        content.getBoundingClientRect().right -
        parseFloat(style.paddingRight) -
        origin.left,
      rows,
      breaks: [...body.querySelectorAll('.wrap-break')].map((mark) => {
        const rect = mark.getBoundingClientRect();
        return { x: rect.left - origin.left, y: rect.top - origin.top };
      }),
    };
  });

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

const hangingMarks = async (body: string, marks: string): Promise<Hanging[]> =>
  (
    await page.locator(body).evaluate((shown, selector) => {
      const origin = shown.getBoundingClientRect();
      return [...shown.querySelectorAll(selector)].map((mark) => {
        const rect = mark.getBoundingClientRect();
        return {
          kind: mark.className.includes('spaces') ? 'spaces' : 'blank',
          x: rect.left - origin.left,
          y: rect.top - origin.top,
          width: rect.width,
        };
      });
    }, marks)
  )
    .map((mark) => ({
      ...mark,
      x: hundredths(mark.x),
      y: hundredths(mark.y),
      width: hundredths(mark.width),
    }))
    .toSorted((a, b) => a.y - b.y || a.x - b.x);

const whitespaceButton = (pressed?: boolean) =>
  page.locator('.viewer').getByRole('button', {
    name: 'Show Whitespace',
    ...(pressed === undefined ? {} : { pressed }),
  });

const showWhitespace = () => whitespaceButton().click();

const viewerHanging = async (): Promise<Hanging[]> => {
  const origin = await viewerOrigin();
  const seen = await seenRows(page);
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
  for (const { row, column } of (await seenDots(page)).toSorted(
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
    ...(await seenGlyphs(page, strings.symbols.tab)).flatMap(
      ({ row, column }) => placed(row, column, 1, 'blank'),
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

const diffWraps = (): Promise<readonly DiffWrap[]> =>
  page.locator('.compare-view .diff-view').evaluate((view) => {
    const rows = view.querySelector(':scope > .virtual-rows');
    const bar =
      rows === null
        ? undefined
        : rows.getBoundingClientRect().left +
          rows.clientLeft +
          rows.clientWidth;
    const range = document.createRange();
    return [
      ...view.querySelectorAll<HTMLElement>('.virtual-row .diff-line .code'),
    ]
      .filter((code) => (code.textContent ?? '').length > 0)
      .map((code) => {
        const style = getComputedStyle(code);
        const box = code.getBoundingClientRect();
        const contentRight = box.right - parseFloat(style.paddingRight);
        const sample = document.createElement('span');
        sample.style.font = style.font;
        sample.style.letterSpacing = style.letterSpacing;
        sample.style.whiteSpace = 'pre';
        sample.textContent = '0'.repeat(1000);
        document.body.append(sample);
        const char = sample.getBoundingClientRect().width / 1000;
        sample.remove();
        const starts: number[] = [];
        let lastTop = Number.NaN;
        let offset = 0;
        const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!(node instanceof Text)) {
            continue;
          }
          for (let at = 0; at < node.length; at++) {
            range.setStart(node, at);
            range.setEnd(node, at + 1);
            const rect = range.getBoundingClientRect();
            if (
              rect.height > 0 &&
              !(Math.abs(rect.top - lastTop) < rect.height / 2)
            ) {
              starts.push(offset + at);
              lastTop = rect.top;
            }
          }
          offset += node.length;
        }
        const line = code.closest('.diff-line');
        const marks = [...(line?.querySelectorAll('.wrap-break') ?? [])].filter(
          (mark) =>
            Math.abs(mark.getBoundingClientRect().left - box.left) <
            box.width + 4 * char,
        );
        return {
          text: code.textContent ?? '',
          starts,
          width:
            box.width -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight) -
            parseFloat(style.textIndent),
          char,
          marksInside: marks.every(
            (mark) =>
              mark.getBoundingClientRect().right <=
              contentRight + 2 * char + 0.5,
          ),
          clear: bar !== undefined && contentRight + 2 * char <= bar + 0.5,
          breaksMarked: marks.length,
        };
      });
  });

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

const brokenByTheBrowserAlone = (text: string) => text.includes('␌');

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
        async () => rounded(await viewerLayout()),
        'the viewer to settle, its breaks marked',
        { accepted: ({ breaks }) => breaks.length > 0 },
      );
      await showWhitespace();
      await whitespaceButton(false).waitFor();
      const viewedHanging = await untilSettled(
        viewerHanging,
        'the blanks hanging in the viewer',
        { accepted: (hanging) => hanging.length > 0 },
      );
      await showWhitespace();
      await whitespaceButton(true).waitFor();

      await page.keyboard.press('F4');
      await page.locator('.editor .cm-content').waitFor();
      let edited = rounded(await editorLayout());
      await waitFor(async () => {
        const now = rounded(await editorLayout());
        const settled = JSON.stringify(now) === JSON.stringify(edited);
        edited = now;
        return settled && now.breaks.length > 0;
      }, 'the editor to settle, its breaks marked');
      assert.ok(
        viewed.rows.length > wrappedLines.length + 8,
        String(viewed.rows.length),
      );
      alikeWithin(edited, viewed, layoutUnit);
      await showWhitespace();
      await page.locator('.editor .wrap-spaces').first().waitFor();
      assert.ok(viewedHanging.length > 0);
      alikeWithin(
        await hangingMarks('.editor-body', '.wrap-spaces, .wrap-blank'),
        viewedHanging,
        layoutUnit,
      );
      await showWhitespace();
      await page
        .locator('.editor .wrap-spaces')
        .first()
        .waitFor({ state: 'detached' });
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
      await page
        .locator('.compare-view .diff-view.wrap .wrap-break')
        .first()
        .waitFor();
      for (const layout of ['Inline', 'Side by Side']) {
        await page.getByRole('button', { name: layout }).click();
        await page
          .locator(
            layout === 'Inline'
              ? '.compare-view .diff-view.wrap:not(.side-by-side) .wrap-break'
              : '.compare-view .diff-view.wrap.side-by-side .wrap-break',
          )
          .first()
          .waitFor();
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
