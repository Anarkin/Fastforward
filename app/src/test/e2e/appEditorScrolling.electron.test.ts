import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { closeOrKill, launchApp } from './appLaunch';
import { waitFor, defaultSettings } from '../helpers/fixtures';
import {
  opened as editorOpened,
  profile as editorProfile,
  page as editorPage,
  editedText,
  backToCommander,
  edit as editorEdit,
  toStart,
  activeIndex,
  topLine,
  cursorLine,
  cursorRow,
  scrolledDown,
  clickRow,
  sharedEditorApp,
} from './editorAppFixtures';
import { editorLinesSeen, editorSelected } from './editorSeen';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { onceDrawn, untilSettled } from './waits';
import { writeSettings } from './settingsWritten';

const shortLines = (count: number, name: string) =>
  Array.from({ length: count }, (_, at) => `${name} ${at + 1}`);

const records: string[] = [];
for (let at = 0; records.join(',').length < 200_000; at++) {
  records.push(
    JSON.stringify({
      freq: 'Quarterly',
      account: 'Some account name',
      tab: `Tab number ${at} of the report`,
      period: '2026-Q4',
      status: 'No Information Available',
      as_of: '2026-11-11T15:01:54Z',
    }),
  );
}
const longLine = `<script type="application/json">[${records.join(',')}]</script>`;
const longFile = [
  ...shortLines(222, '.rule'),
  longLine,
  ...shortLines(574, '<p>after'),
];

const selectedLines = async () =>
  (await editorSelected(editorPage)).filter(Boolean);

interface TopRow {
  readonly text: string;
  readonly offset: number;
}

function topRowOf(scroller: Element): TopRow {
  const top = scroller.getBoundingClientRect().top;
  const host = scroller.querySelector('.editor-cells');
  const rows = host instanceof HTMLElement ? (host.seenRows?.() ?? []) : [];
  const row = rows.find((each) => each.top + each.height > top + 1);
  return {
    text: row === undefined ? '' : row.text.slice(0, 20),
    offset: row === undefined ? NaN : Math.round((row.top - top) * 100) / 100,
  };
}

interface TopRows {
  readonly line: number;
  readonly from: number;
  readonly to: number;
}

function topRowsOf(scroller: Element): TopRows | undefined {
  const top = scroller.getBoundingClientRect().top;
  const host = scroller.querySelector('.editor-cells');
  const rows = host instanceof HTMLElement ? (host.seenRows?.() ?? []) : [];
  const at = rows.findIndex((each) => each.top + each.height > top + 1);
  const first = rows[at];
  const second = rows[at + 1];
  if (first === undefined || second === undefined) {
    return undefined;
  }
  const line = Number(first.key.slice(0, first.key.indexOf(':')));
  return line === Number(second.key.slice(0, second.key.indexOf(':')))
    ? { line, from: first.from, to: second.from }
    : undefined;
}

function undrawnIn(scroller: Element): number[] {
  const box = scroller.getBoundingClientRect();
  const host = scroller.querySelector('.editor-cells');
  const rows = (
    host instanceof HTMLElement ? (host.seenRows?.() ?? []) : []
  ).filter(
    (row) => row.top + row.height > box.top && row.top < box.top + box.height,
  );
  const [first] = rows;
  const undrawn: number[] = [];
  if (first === undefined || first.top > box.top + 0.5) {
    undrawn.push(0);
  }
  for (const [index, row] of rows.entries()) {
    const next = rows[index + 1];
    if (next !== undefined && Math.abs(next.top - row.top - row.height) > 0.5) {
      undrawn.push(Math.round(row.top + row.height - box.top));
    }
  }
  return undrawn;
}

function recordTopRows(frameCount: number): void {
  const frames: string[] = [];
  Reflect.set(window, 'topRowsRecorded', frames);
  const record = (scroller: Element | null) => {
    if (
      scroller === null ||
      getComputedStyle(scroller).visibility !== 'visible' ||
      getComputedStyle(scroller).opacity !== '1'
    ) {
      return;
    }
    const top = scroller.getBoundingClientRect().top;
    const host = scroller.querySelector('.editor-cells');
    const rows = host instanceof HTMLElement ? (host.seenRows?.() ?? []) : [];
    const row = rows.find((each) => each.top + each.height > top + 1);
    if (row === undefined) {
      return;
    }
    frames.push(
      JSON.stringify({
        text: row.text.slice(0, 20),
        offset: Math.round((row.top - top) * 100) / 100,
      }),
    );
  };
  const channel = new MessageChannel();
  let left = frameCount;
  channel.port1.addEventListener('message', () => {
    record(document.querySelector('.editor .editor-scroller'));
    left--;
    if (left > 0) {
      requestAnimationFrame(() => channel.port2.postMessage(0));
    }
  });
  channel.port1.start();
  requestAnimationFrame(() => channel.port2.postMessage(0));
}

suite('App editor, long lines and places shown again', () => {
  let folder: string;
  let profile: string;
  let opened: string;
  let app: ElectronApplication;
  let page: Page;

  const right = () => page.locator('.commander-pane').nth(1);
  const content = () => page.locator('.editor .editor-content');
  const scroller = () => page.locator('.editor .editor-scroller');
  const tabs = () => page.locator('.tabs [role="tab"]');
  const topRow = () => scroller().evaluate(topRowOf);
  const topRowOfLongLine = async () => {
    const top = await scroller().evaluate(topRowsOf);
    assert.ok(
      top?.line === longFile.indexOf(longLine) + 1,
      `the top row and the one below it inside the long line: ${JSON.stringify(top)}`,
    );
    return top;
  };
  const recordedRows = () =>
    page.evaluate(() => {
      const recorded: unknown = Reflect.get(window, 'topRowsRecorded');
      return Array.isArray(recorded) ? recorded.map(String) : [];
    });
  const firstLineIs = (text: string) =>
    waitFor(async () => (await editorLinesSeen(page))[0]?.text === text, text);
  const edit = async (name: string) => {
    await tabs().first().click();
    await right().locator('.commander-row', { hasText: name }).first().click();
    await page.keyboard.press('F4');
    await content().waitFor();
    await waitFor(
      async () =>
        (await scroller().evaluate(
          (element) => getComputedStyle(element).opacity,
        )) === '1',
      'the editor shown',
    );
  };
  const statusIs = (wanted: RegExp) =>
    waitFor(
      async () =>
        wanted.test(
          (await page.locator('.editor .column-status-text').textContent()) ??
            '',
        ),
      `the status ${String(wanted)}`,
    );
  const settledTopRow = () =>
    untilSettled(
      async () => {
        await onceDrawn(page);
        return topRow();
      },
      'the text to stop scrolling, its top row drawn',
      { quiet: 600, accepted: (row) => row.text !== '' },
    );
  const scrolledToRow = async (rows: number) => {
    await scroller().evaluate((element, by) => {
      const row = parseFloat(getComputedStyle(element).lineHeight);
      element.scrollTop = row * by;
    }, rows);
    return settledTopRow();
  };
  const gapsShown = () => scroller().evaluate(undrawnIn);
  const shownAgain = async () => {
    const editorTab = await tabs().evaluateAll((all) =>
      all.findIndex((tab) => tab.classList.contains('active')),
    );
    const left = JSON.stringify(await topRow());
    await tabs().first().click();
    await right().locator('.commander-row').first().waitFor();
    await page.evaluate(recordTopRows, 120);
    await tabs().nth(editorTab).click();
    await content().waitFor();
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return { left, frames: await recordedRows() };
  };

  beforeAll(async () => {
    folder = tempFolder('app-editor-long-line');
    profile = path.join(folder, 'profile');
    opened = path.join(folder, 'opened');
    fs.mkdirSync(opened, { recursive: true });
    fs.writeFileSync(
      path.join(opened, 'long.html'),
      `${longFile.join('\n')}\n`,
    );
    fs.writeFileSync(
      path.join(opened, 'places.txt'),
      `${shortLines(300, 'place').join('\n')}\n`,
    );
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [{ id: '1', tool: 'commander', root: opened }],
        activeTab: '1',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({
        text: { wordWrap: true },
        scrolling: { smooth: false },
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await right().locator('.commander-row').first().waitFor();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  test('shows a file where it was scrolled to from the first frame drawn once its tab is shown again, the top row whole, rather than scrolled elsewhere first', async () => {
    await edit('places');
    await firstLineIs('place 1');
    const scrolledTo = await scrolledToRow(150);
    const { left, frames } = await shownAgain();
    assert.strictEqual(left, JSON.stringify(scrolledTo), 'left where scrolled');
    assert.ok(frames.length > 0, 'frames drawn');
    assert.deepStrictEqual([...new Set(frames)], [left]);
  });

  test('draws every row of a long line in view from the first frame drawn once its tab is shown again, the view starting at the line, rather than leaving the rows after the cursor undrawn', async () => {
    await edit('long');
    await firstLineIs('.rule 1');
    await page.keyboard.press('Control+G');
    await page.keyboard.type('223');
    await page.keyboard.press('Enter');
    for (let word = 0; word < 40; word++) {
      await page.keyboard.press('Control+ArrowRight');
    }
    const scrolledTo = await scrolledToRow(222);
    assert.deepStrictEqual(await gapsShown(), [], 'nothing undrawn at first');
    const { left, frames } = await shownAgain();
    assert.strictEqual(left, JSON.stringify(scrolledTo), 'left where scrolled');
    assert.ok(frames.length > 0, 'frames drawn');
    assert.deepStrictEqual([...new Set(frames)], [left]);
    assert.deepStrictEqual(await topRow(), scrolledTo);
    assert.deepStrictEqual(await gapsShown(), [], 'nothing undrawn');
  });

  test('shows a long line where it was scrolled to deep inside it, with a few characters selected inside it, from the first frame drawn each time its tab is shown again, every row in view drawn and the editor focused', async () => {
    await edit('long');
    await waitFor(
      async () => (await editorLinesSeen(page)).length > 0,
      'the text',
    );
    await page.keyboard.press('ControlOrMeta+F');
    await waitFor(
      () =>
        page.evaluate(
          () =>
            document.activeElement?.classList.contains('search-box-input') ===
            true,
        ),
      'the find field focused',
    );
    await page.keyboard.type('number 90 of');
    await statusIs(/12 characters selected$/);
    await page.keyboard.press('Escape');
    await waitFor(
      () =>
        page.evaluate(
          () =>
            document.activeElement?.classList.contains('editor-content') ===
            true,
        ),
      'the editor focused',
    );
    await statusIs(/^Col \d+ · 12 characters selected$/);
    assert.ok((await cursorLine(page)).includes('number 90 of'));
    const scrolledTo = await settledTopRow();
    assert.match(scrolledTo.text, /^(?!<script)/, 'deep inside the line');
    for (let time = 0; time < 6; time++) {
      const led = (await topRowOfLongLine()).from;
      const { frames } = await shownAgain();
      assert.ok(frames.length > 0, 'frames drawn');
      assert.deepStrictEqual(
        [...new Set(frames)],
        [JSON.stringify(await topRow())],
        `one place from the first frame, shown again ${time + 1} times`,
      );
      const back = await topRowOfLongLine();
      assert.ok(
        back.from <= led && led < back.to,
        `the character that led the top row in that row still, shown again ${time + 1} times: ${JSON.stringify({ led, back })}`,
      );
      assert.deepStrictEqual(await gapsShown(), [], 'nothing undrawn');
      assert.ok(
        await page.evaluate(
          () =>
            document.activeElement?.classList.contains('editor-content') ===
            true,
        ),
        'the editor focused to type in',
      );
    }
  });

  test('keeps the rows of a long line on the whole rows the wheel scrolls by, past the stretches of the line the editor leaves undrawn', async () => {
    await edit('long');
    const first = await scrolledToRow(0);
    assert.strictEqual(first.text, '.rule 1');
    const leading = first.offset;
    const box = await scroller().boundingBox();
    assert.ok(box !== null);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const wrong: string[] = [];
    let last = '';
    for (let notch = 0; notch < 100; notch++) {
      await page.mouse.wheel(0, 100);
      let shown = await topRow();
      await waitFor(async () => {
        const now = await topRow();
        const settled = JSON.stringify(now) === last;
        last = JSON.stringify(now);
        shown = now;
        return settled;
      }, 'the text to stop scrolling');
      if (shown.offset !== leading) {
        wrong.push(`${notch}: ${JSON.stringify(shown)}`);
      }
    }
    assert.match((await topRow()).text, /^(?!\.rule|<p>)/, 'into the line');
    assert.deepStrictEqual(wrong, []);
  });

  test('shows a file where it was scrolled to from the first frame drawn as its page loads again, as the settings are saved', async () => {
    await edit('places');
    const scrolledTo = await scrolledToRow(100);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await page.addInitScript({
      content: `(${recordTopRows.toString()})(600);`,
    });
    await writeSettings(page, profile, { dateFormat: 'DD.MM.YYYY' });
    await content().waitFor();
    await waitFor(
      async () => JSON.stringify(await topRow()) === JSON.stringify(scrolledTo),
      'the place scrolled to',
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const frames = await recordedRows();
    assert.ok(frames.length > 0, 'frames drawn');
    assert.deepStrictEqual([...new Set(frames)], [JSON.stringify(scrolledTo)]);
  });
});

suite('App editor', () => {
  sharedEditorApp();

  test('scrolls the text by the rows of a notch of the wheel on whole rows, as the diff and the viewer do, the rows whole at the end too', async () => {
    const lines = Array.from({ length: 300 }, (_, at) => `row ${at + 1}`);
    fs.writeFileSync(
      path.join(editorOpened, 'rows.txt'),
      `${lines.join('\n')}\n`,
    );
    await backToCommander();
    await editorEdit('rows.txt');
    await waitFor(
      async () => (await editedText()).startsWith('row 1\n'),
      'the text',
    );
    const scroller = editorPage.locator('.editor .editor-scroller');
    const box = await scroller.boundingBox();
    assert.ok(box !== null);
    await editorPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const rowsScrolled = () =>
      scroller.evaluate((element) => {
        const row =
          element.querySelector<HTMLElement>('.editor-cells')?.seenRows?.()[0]
            ?.height ?? 1;
        return element.scrollTop / row;
      });
    await editorPage.mouse.wheel(0, 100);
    await waitFor(
      async () =>
        Math.abs(
          (await rowsScrolled()) - defaultSettings().scrolling.wheelRows,
        ) < 0.01,
      'the text to scroll the rows of a notch',
    );
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await waitFor(async () => {
      const rows = await rowsScrolled();
      return rows > 200 && Math.abs(rows - Math.round(rows)) < 0.01;
    }, 'the last rows whole');
  });

  test('keeps the text still as it is typed into the top or the bottom row shown, scrolled down by whole rows, and shows the row the cursor moves onto above or below them whole, scrolled by whole rows', async () => {
    const lines = Array.from({ length: 300 }, (_, at) => `line ${at + 1}`);
    fs.writeFileSync(
      path.join(editorOpened, 'typed.txt'),
      `${lines.join('\n')}\n`,
    );
    await backToCommander();
    await editorEdit('typed.txt');
    await waitFor(
      async () => (await editedText()).startsWith('line 1\n'),
      'the text',
    );
    await toStart();
    const scroller = editorPage.locator('.editor .editor-scroller');
    const shown = 20;
    const row = await scroller.evaluate((element, rows) => {
      const height =
        element.querySelector<HTMLElement>('.editor-cells')?.seenRows?.()[0]
          ?.height ?? 1;
      element.style.flex = 'none';
      element.style.height = `${rows * height}px`;
      element.scrollTop = (rows / 2) * height;
      element.dataset.scrolls = '0';
      element.addEventListener('scroll', () => {
        element.dataset.scrolls = String(
          Number(element.dataset.scrolls ?? '0') + 1,
        );
      });
      return height;
    }, shown);
    const scrolledTop = () => scroller.evaluate((element) => element.scrollTop);
    const settled = async () => {
      let last = NaN;
      await waitFor(async () => {
        await editorPage.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const now = await scrolledTop();
        const still = now === last;
        last = now;
        return still;
      }, 'the text to stop scrolling');
      return Math.round((last / row) * 100) / 100;
    };
    const onRow = async (number: number) => {
      const place = await scroller.evaluate((element, wanted) => {
        const line = (
          element.querySelector<HTMLElement>('.editor-cells')?.seenRows?.() ??
          []
        ).find((each) => each.text === `line ${wanted}`);
        return line === undefined
          ? undefined
          : {
              x:
                line.left +
                (line.text.length - line.column) * line.advance +
                20,
              y: line.top + line.height / 2,
            };
      }, number);
      assert.ok(place !== undefined, `line ${number} shown`);
      await editorPage.mouse.click(place.x, place.y);
      await editorPage.keyboard.press('End');
      await settled();
      await scroller.evaluate((element) => {
        element.dataset.scrolls = '0';
      });
    };
    const scrolls = () =>
      scroller.evaluate((element) => Number(element.dataset.scrolls));
    assert.strictEqual(await settled(), shown / 2);

    const topRow = shown / 2 + 1;
    await onRow(topRow);
    await editorPage.keyboard.type('xyz');
    assert.strictEqual(await settled(), shown / 2, 'typed into the top row');
    assert.strictEqual(await scrolls(), 0, 'scrolls typing into the top row');

    const bottomRow = shown / 2 + shown;
    await onRow(bottomRow);
    await editorPage.keyboard.type('xyz');
    assert.strictEqual(await settled(), shown / 2, 'typed into the bottom row');
    assert.strictEqual(
      await scrolls(),
      0,
      'scrolls typing into the bottom row',
    );

    const shownWhole = async (number: number) => {
      const rows = await settled();
      const whole = await scroller.evaluate((element, wanted) => {
        const line = (
          element.querySelector<HTMLElement>('.editor-cells')?.seenRows?.() ??
          []
        ).find((each) => each.text.startsWith(`line ${wanted}`));
        const top = element.getBoundingClientRect().top + element.clientTop;
        return (
          line !== undefined &&
          line.top >= top - 0.5 &&
          line.top + line.height <= top + element.clientHeight + 0.5
        );
      }, number);
      return { rows: Number.isInteger(rows), whole };
    };
    await editorPage.keyboard.press('ArrowDown');
    assert.deepStrictEqual(
      await shownWhole(bottomRow + 1),
      { rows: true, whole: true },
      'moved below the rows',
    );
    const rowsNow = await settled();
    await onRow(rowsNow + 1);
    await editorPage.keyboard.press('ArrowUp');
    assert.deepStrictEqual(
      await shownWhole(rowsNow),
      { rows: true, whole: true },
      'moved above the rows',
    );
    await editorPage.keyboard.press('Control+s');
  });

  test('moves the cursor a page up as many rows as a page down, a row less than the view shows, the cursor staying on the row of the view it was on, selecting as far with Shift, and to the last line of the file on Ctrl+End and the first on Ctrl+Home, as the caret of the browser went up no further than the lines drawn above the view, to the top row on Page Down, and on Ctrl+End to the last line drawn rather than the last of the file', async () => {
    const lines = Array.from({ length: 400 }, (_, at) => `line ${at + 1}`);
    fs.writeFileSync(path.join(editorOpened, 'paged.txt'), lines.join('\n'));
    await backToCommander();
    await editorEdit('paged.txt');
    await waitFor(
      async () => (await editedText()).startsWith('line 1\n'),
      'the text',
    );
    await toStart();
    const scroller = editorPage.locator('.editor .editor-scroller');
    const page = await scroller.evaluate((element) => {
      const row =
        element.querySelector<HTMLElement>('.editor-cells')?.seenRows?.()[0]
          ?.height ?? 1;
      return Math.floor(element.clientHeight / row) - 1;
    });
    const cursor = () =>
      untilSettled(
        () =>
          scroller.evaluate((element) => {
            const rows =
              element
                .querySelector<HTMLElement>('.editor-cells')
                ?.seenRows?.() ?? [];
            const drawn = element
              .querySelector('.editor-cursor-primary')
              ?.getBoundingClientRect();
            const row = rows[0]?.height ?? 1;
            const top = element.getBoundingClientRect().top;
            const middle =
              drawn === undefined ? NaN : drawn.top + drawn.height / 2;
            return {
              line:
                rows.find(
                  (each) =>
                    each.top <= middle && middle < each.top + each.height,
                )?.text ?? '',
              row:
                drawn === undefined
                  ? NaN
                  : Math.round(((drawn.top - top) / row) * 100) / 100,
            };
          }),
        'the cursor to stop moving',
        { quiet: 300, accepted: ({ row }) => Number.isInteger(row) },
      );
    const pressed = async (key: string) => {
      await editorPage.keyboard.press(key);
      return cursor();
    };
    assert.ok(page > 5, `a page of ${page} rows`);
    await editorPage.keyboard.press('ArrowDown');

    assert.deepStrictEqual(
      {
        down: await pressed('ArrowDown'),
        pageDown: await pressed('PageDown'),
        again: await pressed('PageDown'),
        pageUp: await pressed('PageUp'),
        end: (await pressed('ControlOrMeta+End')).line,
        home: await pressed('ControlOrMeta+Home'),
        selectedDown: await pressed('Shift+PageDown'),
        selectedOn: await pressed('Shift+ArrowDown'),
        selectedUp: await pressed('Shift+PageUp'),
        left: await selectedLines(),
      },
      {
        down: { line: 'line 3', row: 2 },
        pageDown: { line: `line ${3 + page}`, row: 2 },
        again: { line: `line ${3 + 2 * page}`, row: 2 },
        pageUp: { line: `line ${3 + page}`, row: 2 },
        end: 'line 400',
        home: { line: 'line 1', row: 0 },
        selectedDown: { line: `line ${1 + page}`, row: 0 },
        selectedOn: { line: `line ${2 + page}`, row: 1 },
        selectedUp: { line: 'line 2', row: 1 },
        left: ['line 1'],
      },
    );
  });

  test('shows the text where it was scrolled to and the cursor where it was once its tab is shown again', async () => {
    const lines = Array.from({ length: 300 }, (_, at) => `place ${at + 1}`);
    fs.writeFileSync(
      path.join(editorOpened, 'places.txt'),
      `${lines.join('\n')}\n`,
    );
    await backToCommander();
    await editorEdit('places.txt');
    await waitFor(
      async () => (await editedText()).startsWith('place 1\n'),
      'the text',
    );
    const editorTab = await activeIndex();
    const status = editorPage.locator('.editor .column-status-text');
    await clickRow(4);
    await waitFor(
      async () => (await cursorLine()) === 'place 5',
      'the cursor on the fifth line',
    );
    const cursor = await status.textContent();
    const scrolledTo = await scrolledDown(150);
    await backToCommander();
    await editorPage.locator('.tabs [role="tab"]').nth(editorTab).click();
    await waitFor(
      async () => (await editedText()).length > 0,
      'the text shown again',
    );
    await waitFor(
      async () => (await topLine()) === scrolledTo,
      `${scrolledTo} at the top again`,
    );
    assert.strictEqual(await status.textContent(), cursor);
    await waitFor(
      async () => (await cursorRow()) === 4,
      'the cursor on the fifth line again, though out of sight',
    );
  });

  test('shows the text where it was scrolled to while the page reloads as the settings are saved', async () => {
    const lines = Array.from({ length: 300 }, (_, at) => `reread ${at + 1}`);
    fs.writeFileSync(
      path.join(editorOpened, 'reread.txt'),
      `${lines.join('\n')}\n`,
    );
    await backToCommander();
    await editorEdit('reread.txt');
    await waitFor(
      async () => (await editedText()).startsWith('reread 1\n'),
      'the text',
    );
    const scrolledTo = await scrolledDown(120);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await writeSettings(editorPage, editorProfile, {
      scrolling: { smooth: true },
      dateFormat: 'DD.MM.YYYY',
    });
    await waitFor(
      async () => (await editedText()).includes('reread '),
      'the text read again',
    );
    await waitFor(
      async () => (await topLine()) === scrolledTo,
      `${scrolledTo} at the top again`,
    );
  });
});
