import * as assert from 'node:assert';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { suite, test } from 'vitest';
import { wrapColumns, wrappedLines, wrapStarts } from '../../lib/page/wordWrap';
import {
  diffLineNumbered,
  openChangedFile,
  page,
  repository,
  savedSetting,
  sharedApp,
  viewSaved,
  wrapsSaved,
} from './appFixtures';
import { gridLines } from './gridLines';
import { waitFor, writeWhenFree } from '../helpers/fixtures';
import {
  diffLinesSeen,
  diffListTop,
  diffRowsSeen,
  diffTexts,
  untilDiffLine,
  type DiffLineSeen,
  type DiffRowSeen,
} from './diffSeen';
import {
  drawnCodeRow,
  near,
  wrappingInPage,
  pressWrap,
  clickView,
  wrapColumnsShown,
} from './wrappingFixtures';
import {
  hyphenatedLine,
  dottedLine,
  breakLines,
  longestLine,
  minifiedLine,
  breakCharacters,
  breakContexts,
  breakSentences,
  paddedLine,
  firstLongLine,
  longLines,
  reportDataLine,
  reportPage,
} from './wrappingSamples';
import { commitRow, commitsSeen } from './commitRows';

const rowsFrom = (first: number, last: number) =>
  Array.from({ length: last - first + 1 }, (_, at) => first + at);

const wraps = ({ rows }: DiffLineSeen) => rows.length > 1;

const startsOf = (rows: readonly DiffRowSeen[]) => {
  let at = 0;
  return rows.map(({ text }) => {
    const start = at;
    at += text.length;
    return start;
  });
};

const marked = ({ breakAt, column, text }: DiffRowSeen) =>
  breakAt === column + text.length;

async function columnsShown(side = 0): Promise<number> {
  const { width, char } = await wrapColumnsShown(side);
  return wrapColumns(width, char);
}

async function sidesShown(): Promise<string[]> {
  const byTop = new Map<number, string[]>();
  for (const { top, side, text } of await diffLinesSeen(page)) {
    const texts = byTop.get(Math.round(top)) ?? [];
    texts[side] = text;
    byTop.set(Math.round(top), texts);
  }
  return [...byTop.values()].map((texts) => texts.join(' | '));
}

const long = ({ text }: DiffLineSeen) => text === firstLongLine;

const tall = ({ rows }: DiffLineSeen) => rows.length * (rows[0]?.height ?? 0);

const linesAtTop = async () => {
  const top = (await diffListTop(page)) + 0.5;
  return (await diffLinesSeen(page)).filter(
    ({ rows }) =>
      (rows[0]?.top ?? Infinity) <= top &&
      (rows.at(-1)?.top ?? 0) + (rows.at(-1)?.height ?? 0) > top,
  );
};

const topLine = async () => (await linesAtTop())[0]?.text.split(' ')[0];

suite('App', () => {
  sharedApp({
    'long.txt': `${longLines.join('\n')}\n`,
    'hyphenated.txt': `${hyphenatedLine}\n`,
    'wrapped.txt': `${dottedLine}\n`,
    'padded.txt': `${paddedLine}\n`,
    'breaks.txt': `${breakLines.join('\n')}\n`,
    'longest.txt': `${longestLine}\n`,
    'minified.txt': `${minifiedLine}\n`,
    'grid.txt': `${gridLines.join('\n')}\n`,
    'grid.js': `${gridLines.join('\n')}\n`,
    'report.html': reportPage(2_000),
  });

  test('lists the history and shows a commit entire, with its change, inline, then side by side on its button, the default, and inline again on the other, and wraps long lines on its button or W, each row as tall as the lines the app expects its text to wrap to, keeping the line at the top in place as it wraps and changes layout, saving each choice', async () => {
    await openChangedFile();
    assert.deepStrictEqual(await diffTexts(page), ['one', 'two', '2', 'three']);
    await page
      .locator('.diff-view > .scrollbar-marks > .scrollbar-mark.added')
      .waitFor();
    await page.getByRole('button', { name: 'Side by Side' }).click();
    await page.locator('.diff-view.side-by-side').waitFor();
    await waitFor(
      async () => (await sidesShown()).length === 3,
      'the two sides drawn',
    );
    assert.deepStrictEqual(await sidesShown(), [
      'one | one',
      'two | 2',
      'three | three',
    ]);
    assert.deepStrictEqual(
      (await diffLinesSeen(page)).flatMap(({ change, side }) =>
        change === undefined ? [] : [[change, side]],
      ),
      [
        ['removed', 0],
        ['added', 1],
      ],
    );
    await waitFor(
      () => savedSetting('diff', 'diffLayout') === undefined,
      'the layout to be saved',
    );
    await page.getByRole('button', { name: 'Inline' }).click();
    await page
      .locator('.diff-view.side-by-side')
      .waitFor({ state: 'detached' });
    await untilDiffLine(
      page,
      ({ change, side }) => change === 'added' && side === 0,
      'the added line inline',
    );
    await waitFor(
      () => savedSetting('diff', 'diffLayout') === 'inline',
      'the layout to be saved',
    );

    await commitRow(page, 'first').click();
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    const unwrapped = tall(await untilDiffLine(page, long, 'the long line'));
    const lineHeight = await drawnCodeRow();
    assert.ok(near(unwrapped, lineHeight), `${unwrapped} is not ${lineHeight}`);
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    await page.locator('.diff-view.wrap').waitFor();
    const wrapped = await untilDiffLine(
      page,
      (line) => long(line) && wraps(line),
      'the long line wrapped',
    );
    const wrappedHeight =
      wrappedLines(firstLongLine, await columnsShown()) * lineHeight;
    assert.ok(
      near(tall(wrapped), wrappedHeight),
      `${tall(wrapped)} is not ${wrappedHeight}`,
    );
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
    const list = page.locator('.diff-view .virtual-rows');
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight / 4;
    });
    await waitFor(
      async () => /^line[1-9]\d*$/.test((await topLine()) ?? ''),
      'a line at the top',
    );
    const reading = await topLine();
    for (const [change, shown, state, wrapsNow, layout] of [
      [pressWrap, '.diff-view.wrap', 'detached', false, 'inline'],
      [pressWrap, '.diff-view.wrap', 'attached', true, 'inline'],
      [
        clickView('Side by Side'),
        '.diff-view.side-by-side',
        'attached',
        true,
        'sideBySide',
      ],
      [pressWrap, '.diff-view.wrap', 'detached', false, 'sideBySide'],
      [
        clickView('Inline'),
        '.diff-view.side-by-side',
        'detached',
        false,
        'inline',
      ],
      [pressWrap, '.diff-view.wrap', 'attached', true, 'inline'],
    ] as const) {
      await change();
      await page.locator(shown).waitFor({ state });
      await waitFor(
        async () => (await topLine()) === reading,
        `${reading} to stay at the top once ${shown} is ${state}`,
      ).catch(async (error: unknown) => {
        const top = await diffListTop(page);
        const rows = {
          ...(await list.evaluate((element) => ({
            scrollTop: element.scrollTop,
            room: element.scrollHeight - element.clientHeight,
            scale: devicePixelRatio,
          }))),
          rows: (await diffRowsSeen(page))
            .map((drawn) => ({
              line: drawn.text.split(' ')[0],
              top: drawn.top - top,
              height: drawn.height,
            }))
            .filter(({ top: at }) => at > -60 && at < 60),
        };
        throw new Error(
          `${String(error)} in ${layout}, ${await topLine()} at the top, ${JSON.stringify(rows)}`,
        );
      });
      await waitFor(
        () => viewSaved(wrapsNow, layout),
        `the choice that ${shown} is ${state} to be saved`,
      );
    }
  });

  test('marks where each wrapped row ends right after its text, after punctuation too', async () => {
    await commitRow(page, 'first').click();
    await page.locator('.row.file', { hasText: 'hyphenated.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    const { rows } = await untilDiffLine(
      page,
      wraps,
      'a line wrapped onto rows',
    );
    assert.deepStrictEqual(
      rows.slice(0, -1).map((row) => [row.text.at(-1), marked(row)]),
      rows.slice(0, -1).map(() => ['-', true]),
    );
    assert.strictEqual(rows.at(-1)?.breakAt, undefined);
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });

  test('wraps an indented line where VS Code would, after its punctuation, onto rows indented as far as it, as many as the app estimates, never leaving its indentation on a row of its own', async () => {
    await commitRow(page, 'first').click();
    await page.locator('.row.file', { hasText: 'wrapped.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    const { text, rows } = await untilDiffLine(
      page,
      (line) => line.text.includes('part0.part1.') && line.rows.length > 2,
      'the indented line wrapped onto rows',
    );
    const lead = text.length - text.trimStart().length;
    const starts = rows.map(
      (row, index) => row.left + (index === 0 ? lead * row.advance : 0),
    );
    assert.strictEqual(text, dottedLine);
    assert.ok(lead > 0, 'the line is not indented');
    assert.deepStrictEqual(
      rows.map((row, index) => [
        row.text.at(-1),
        near(starts[index], starts[0] ?? 0),
        marked(row),
      ]),
      rows.map((_, index) => [
        index < rows.length - 1 ? '.' : ';',
        true,
        index < rows.length - 1,
      ]),
    );
    assert.strictEqual(rows.length, wrappedLines(text, await columnsShown()));
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });

  test('finds the same places to break a line as the browser, which asks ICU, the line breaker of Unicode, beyond ASCII and uses a table of its own between two characters of ASCII, comparing every pair of a set of characters after each of a few and sentences of many scripts', async () => {
    const wrapping = await wrappingInPage();
    const texts = [...breakSentences];
    for (const context of breakContexts) {
      for (const first of breakCharacters) {
        for (const second of breakCharacters) {
          texts.push(`${context}${first}${second}a`);
        }
      }
    }

    const differing = await wrapping.evaluate((app, all) => {
      const box = document.createElement('div');
      box.style.cssText =
        'position: absolute; width: 0; white-space: pre-wrap; overflow-wrap: normal; font: 12px monospace; visibility: hidden';
      for (const text of all) {
        const line = document.createElement('div');
        line.textContent = text;
        box.append(line);
      }
      document.body.append(box);
      const range = document.createRange();
      const found: { text: string; app: number[]; browser: number[] }[] = [];
      for (const [index, line] of [...box.children].entries()) {
        const node = line.firstChild;
        const text = all[index];
        if (!(node instanceof Text)) {
          continue;
        }
        const browser: number[] = [];
        let lastTop = Number.NaN;
        for (let at = 0; at < node.length; at++) {
          const unit = node.data.charCodeAt(at);
          if (unit >= 0xdc00 && unit <= 0xdfff) {
            continue;
          }
          range.setStart(node, at);
          range.setEnd(
            node,
            unit >= 0xd800 && unit <= 0xdbff ? at + 2 : at + 1,
          );
          const rect = [...range.getClientRects()].at(-1);
          if (rect === undefined || rect.height === 0) {
            continue;
          }
          if (!(Math.abs(rect.top - lastTop) < rect.height / 2)) {
            if (at > 0) {
              browser.push(at);
            }
            lastTop = rect.top;
          }
        }
        const flags = app.lineBreaks(text);
        const breaks = [...flags.keys()].filter((at) => flags[at] === 1);
        if (breaks.join() !== browser.join()) {
          found.push({ text, app: breaks, browser });
        }
      }
      box.remove();
      return found.slice(0, 20);
    }, texts);

    assert.deepStrictEqual(differing, []);
  });

  test('wraps every line of a diff where the app expects it to, at the breaks the browser finds after hyphens and dashes, at zero-width spaces, soft hyphens and spaces of other widths, around Chinese, emoji and boxes, and at the punctuation of VS Code and tabs, as the viewer wraps lines the same way', async () => {
    await commitRow(page, 'first').click();
    await page.locator('.row.file', { hasText: 'breaks.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    await untilDiffLine(page, wraps, 'a line wrapped onto rows');
    const wrapping = await wrappingInPage();
    const columns = await columnsShown();
    const found = [];
    for (const [index, line] of breakLines.entries()) {
      const { rows } = await diffLineNumbered(index + 1);
      found.push({
        line: `${line.slice(0, 24)} ${columns}`,
        drawn: startsOf(rows),
        app: await wrapping.evaluate(
          async (app, { text, wrapAt }) =>
            app.wrapStarts(
              text,
              wrapAt,
              app.wrapIndent(text, wrapAt),
              app.cellWidthsOf(await app.terminalCells()),
            ),
          { text: line, wrapAt: columns },
        ),
      });
    }
    assert.deepStrictEqual(
      found.filter(({ drawn, app }) => !isDeepStrictEqual(drawn, app)),
      [],
    );
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });

  test('marks where each row of a line of over 200 rows ends, where the app expects the browser to break it, as reading where the browser broke it froze the page, drawing the marks near the rows in sight as it scrolls', async () => {
    await commitRow(page, 'first').click();
    await page.locator('.row.file', { hasText: 'longest.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    await untilDiffLine(page, wraps, 'the line wrapped onto rows');
    const starts = wrapStarts(longestLine, await columnsShown());
    assert.ok(starts.length > 200, String(starts.length));
    const list = page.locator('.diff-view .virtual-rows');
    const inSight = async () => {
      const { top, bottom } = await list.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      });
      return (await diffRowsSeen(page)).filter(
        (row) => row.top + row.height > top && row.top < bottom,
      );
    };
    const unmarked = async () =>
      (await inSight()).filter(
        (row) => !marked(row) && !longestLine.endsWith(row.text),
      ).length;
    assert.ok((await inSight()).length > 5, 'few rows in sight');
    assert.strictEqual(await unmarked(), 0);
    const row = await drawnCodeRow();
    await list.evaluate(
      (element, by) => {
        element.scrollTop += by;
      },
      (starts.length * row) / 2,
    );
    await waitFor(
      async () =>
        (await inSight()).some(({ text }) =>
          longestLine.slice(longestLine.length / 3).includes(text),
        ),
      'rows in sight in the middle of the line',
    );
    assert.ok((await inSight()).length > 5, 'few rows in sight');
    assert.strictEqual(await unmarked(), 0);
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });

  test('scrolls into a line of over a megabyte, through it and out of it without stalling, drawing only the blocks of its rows near the rows in sight, each row where the browser breaks the line and the app expects it, marked on its row, as laying out the whole line each time it came into view or left it stalled the diff for seconds', async () => {
    const file = path.join(repository.root, 'report.html');
    const report = reportPage(16_000);
    const data = report.split('\n')[reportDataLine - 1];
    assert.ok(data.length > 1024 * 1024);
    try {
      await commitRow(page, 'second').click();
      await commitRow(page, 'second', { selected: true }).waitFor();
      await clickView('Side by Side')();
      await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
      await page.locator('.diff-view.wrap.side-by-side').waitFor();
      await writeWhenFree(file, report);
      const changed = commitRow(page, '1 uncommitted change');
      await changed.waitFor().catch(async (error: unknown) => {
        throw new Error(
          `${String(error)}: the working tree shows ${JSON.stringify((await commitsSeen(page)).find((row) => row.kind === 'workingTree')?.subject)} while git says ${JSON.stringify(await repository.git('status', '--porcelain'))}`,
        );
      });
      await changed.click();
      await page.locator('.row.file', { hasText: 'report.html' }).click();
      await page.locator('.diff-view.wrap.side-by-side').waitFor();
      const list = page.locator('.diff-view .virtual-rows');
      await untilDiffLine(page, ({ side }) => side === 1, 'the second side');
      const rowHeight = await drawnCodeRow();
      const starts = wrapStarts(data, await columnsShown(1));
      const height = starts.length * rowHeight;
      let lineKey: string | undefined;
      const lineRows = async () =>
        (await diffRowsSeen(page)).filter(
          ({ side, key, numbers }) =>
            side === 1 &&
            (lineKey === undefined
              ? numbers?.includes(String(reportDataLine)) === true
              : key.startsWith(`${lineKey}:`)),
        );
      const scrolled = () =>
        list.evaluate((element) => ({
          at: element.scrollTop,
          view: element.clientHeight,
          top: element.getBoundingClientRect().top,
        }));
      const stalls: number[] = [];
      const scrollTo = async (top: number) => {
        stalls.push(
          await list.evaluate(async (element, to) => {
            const turns = new MessageChannel();
            let turned = performance.now();
            let busiest = 0;
            let drawing = true;
            const turn = () => {
              const now = performance.now();
              busiest = Math.max(busiest, now - turned);
              turned = now;
            };
            turns.port1.addEventListener('message', () => {
              turn();
              if (drawing) {
                turns.port2.postMessage(0);
              }
            });
            turns.port1.start();
            turns.port2.postMessage(0);
            element.scrollTop = to;
            await new Promise((drawn) =>
              requestAnimationFrame(() => requestAnimationFrame(drawn)),
            );
            drawing = false;
            turn();
            turns.port1.close();
            return busiest;
          }, top),
        );
      };
      const scrollByHalf = async () =>
        scrollTo(
          await list.evaluate(
            (element) => element.scrollTop + element.clientHeight / 2,
          ),
        );
      const drawnInSight = async (where: string, top: number) => {
        const drawnRows = async () => {
          const { at, view, top: listTop } = await scrolled();
          const rows = (await lineRows()).map((row) => ({
            ...row,
            at: Math.round((row.top - (listTop + top - at)) / rowHeight),
          }));
          const drawn = rows.map((row) => row.at);
          const unseen = rowsFrom(
            Math.floor((at - top) / rowHeight),
            Math.ceil((at + view - top) / rowHeight) - 1,
          ).filter(
            (row) => row >= 0 && row < starts.length && !drawn.includes(row),
          );
          const unmarked = rows.filter(
            (row) => row.at < starts.length - 1 && row.breakAt === undefined,
          );
          return { rows, left: unseen.length + unmarked.length };
        };
        await waitFor(
          async () => (await drawnRows()).left === 0,
          `the rows in sight drawn and marked ${where}`,
        );
        const { rows } = await drawnRows();
        assert.ok(rows.length > 0, `no rows of the line drawn ${where}`);
        assert.deepStrictEqual(
          rows.filter(
            ({ text, at }) =>
              text !== data.slice(starts[at], starts[at + 1] ?? data.length),
          ),
          [],
        );
        assert.ok(
          rows.reduce((sum, { text }) => sum + text.length, 0) <
            data.length / 10,
          `more than a tenth of the line drawn ${where}`,
        );
      };

      await scrollTo(0);
      await waitFor(
        async () => (await lineRows()).length === 0,
        'the line of over a megabyte to leave',
      );
      while ((await lineRows()).length === 0) {
        const reached = await list.evaluate((element) => ({
          top: element.scrollTop,
          height: element.scrollHeight,
          view: element.clientHeight,
        }));
        assert.ok(
          reached.top + reached.view < reached.height - 1,
          `The line of over a megabyte never came: ${JSON.stringify(reached)}`,
        );
        await scrollByHalf();
      }
      const [first] = await lineRows();
      assert.ok(first, 'the line of over a megabyte has no row');
      lineKey = first.key.slice(0, first.key.indexOf(':'));
      const { at, view, top: listTop } = await scrolled();
      const top = at + first.top - listTop;
      assert.ok(height > 100 * view, `${height} is not over a hundred views`);
      await scrollTo(top + height / 2);
      await scrollTo(top + height - view / 2);
      for (let step = 0; (await lineRows()).length > 0; step++) {
        assert.ok(step < 40, 'The line of over a megabyte never left');
        await scrollByHalf();
      }
      await scrollTo(top + height / 2);
      assert.ok(
        Math.max(...stalls) < 1000,
        `scrolling stalled for ${stalls.map(Math.round).join(', ')} ms`,
      );

      await scrollTo(top - view / 2);
      await drawnInSight('as it comes into view', top);
      await scrollTo(top + height / 2);
      await drawnInSight('in its middle', top);
      await scrollTo(top + height - view / 2);
      await drawnInSight('at its end', top);
    } finally {
      await repository.git('checkout', '-q', 'HEAD', '--', 'report.html');
    }
    await commitRow(page, 'No uncommitted changes').waitFor();
  }, 180_000);

  test('wraps a line longer than 64 KiB only where the browser breaks it, where the app expects it to, keeping its indentation on the row with its code, as the app expected breaks after punctuation it no longer marks in such a line, its marks drifting from the rows, and the browser broke it right after its indentation', async () => {
    await commitRow(page, 'first').click();
    await page.locator('.row.file', { hasText: 'minified.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    const { rows } = await untilDiffLine(
      page,
      wraps,
      'the line wrapped onto rows',
    );
    const starts = startsOf(rows);
    assert.ok(
      minifiedLine.startsWith(rows.map(({ text }) => text).join('')),
      'the rows are not the start of the line',
    );
    assert.ok((starts[1] ?? 0) > 4, `the first row ends at ${starts[1]}`);
    assert.deepStrictEqual(
      starts,
      wrapStarts(minifiedLine, await columnsShown()).slice(0, starts.length),
    );
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });
});
