import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { closeOrKill, launchApp } from './appFixtures';
import { waitFor } from '../helpers/fixtures';
import { removeFolder, tempFolder } from '../helpers/repositories';

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

interface TopRow {
  readonly text: string;
  readonly offset: number;
}

function topRowOf(scroller: Element): TopRow {
  const top = scroller.getBoundingClientRect().top;
  const line = Array.from(scroller.querySelectorAll('.cm-line')).find(
    (each) => each.getBoundingClientRect().bottom > top + 1,
  );
  const range = document.createRange();
  if (line !== undefined) {
    range.selectNodeContents(line);
  }
  const row = Array.from(range.getClientRects()).find(
    (rect) => rect.height > 0 && rect.bottom > top + 1,
  );
  const at =
    row === undefined
      ? null
      : document.caretRangeFromPoint(row.left + 1, row.top + row.height / 2);
  const shown = document.createRange();
  if (at !== null && line !== undefined) {
    shown.setStart(at.startContainer, at.startOffset);
    shown.setEnd(line, line.childNodes.length);
  }
  return {
    text: shown.toString().slice(0, 20),
    offset: row === undefined ? NaN : Math.round((row.top - top) * 100) / 100,
  };
}

function recordTopRows(frameCount: number): void {
  const frames: string[] = [];
  Reflect.set(window, 'topRowsRecorded', frames);
  const record = (scroller: Element | null) => {
    if (
      scroller === null ||
      (scroller.querySelector('.cm-content')?.textContent ?? '') === '' ||
      getComputedStyle(scroller).visibility !== 'visible' ||
      getComputedStyle(scroller).opacity !== '1'
    ) {
      return;
    }
    const top = scroller.getBoundingClientRect().top;
    const line = Array.from(scroller.querySelectorAll('.cm-line')).find(
      (each) => each.getBoundingClientRect().bottom > top + 1,
    );
    const range = document.createRange();
    if (line !== undefined) {
      range.selectNodeContents(line);
    }
    const row = Array.from(range.getClientRects()).find(
      (rect) => rect.height > 0 && rect.bottom > top + 1,
    );
    const at =
      row === undefined
        ? null
        : document.caretRangeFromPoint(row.left + 1, row.top + row.height / 2);
    const shown = document.createRange();
    if (at !== null && line !== undefined) {
      shown.setStart(at.startContainer, at.startOffset);
      shown.setEnd(line, line.childNodes.length);
    }
    frames.push(
      JSON.stringify({
        text: shown.toString().slice(0, 20),
        offset:
          row === undefined ? NaN : Math.round((row.top - top) * 100) / 100,
      }),
    );
  };
  const scrollTop = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'scrollTop',
  );
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    get(this: Element) {
      const value: unknown = scrollTop?.get?.call(this);
      return typeof value === 'number' ? value : 0;
    },
    set(this: Element, value: number) {
      scrollTop?.set?.call(this, value);
      if (this.matches('.editor .cm-scroller')) {
        record(this);
      }
    },
  });
  const channel = new MessageChannel();
  let left = frameCount;
  channel.port1.addEventListener('message', () => {
    record(document.querySelector('.editor .cm-scroller'));
    left--;
    if (left > 0) {
      requestAnimationFrame(() => channel.port2.postMessage(0));
    } else if (scrollTop !== undefined) {
      Object.defineProperty(Element.prototype, 'scrollTop', scrollTop);
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
  const content = () => page.locator('.editor .cm-content');
  const scroller = () => page.locator('.editor .cm-scroller');
  const tabs = () => page.locator('.tabs [role="tab"]');
  const topRow = () => scroller().evaluate(topRowOf);
  const recordedRows = () =>
    page.evaluate(() => {
      const recorded: unknown = Reflect.get(window, 'topRowsRecorded');
      return Array.isArray(recorded) ? recorded.map(String) : [];
    });
  const firstLineIs = (text: string) =>
    waitFor(
      async () =>
        (await content().locator('.cm-line').first().textContent()) === text,
      text,
    );
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
  const settledTopRow = async () => {
    let last = '';
    let since = Date.now();
    await waitFor(async () => {
      const now = JSON.stringify(await topRow());
      if (now !== last) {
        last = now;
        since = Date.now();
      }
      return Date.now() - since > 600;
    }, 'the text to stop scrolling');
    return topRow();
  };
  const scrolledToRow = async (rows: number) => {
    await scroller().evaluate((element, by) => {
      const row = parseFloat(getComputedStyle(element).lineHeight);
      element.scrollTop = row * by;
    }, rows);
    return settledTopRow();
  };
  const gapsShown = () =>
    scroller().evaluate((element) => {
      const box = element.getBoundingClientRect();
      return Array.from(element.querySelectorAll('.cm-line > div'))
        .filter((gap) => gap instanceof HTMLElement && gap.style.height !== '')
        .map((gap) => gap.getBoundingClientRect())
        .filter((rect) => rect.bottom > box.top && rect.top < box.bottom)
        .map((rect) => Math.round(rect.top - box.top));
    });
  const shownAgain = async () => {
    const editorTab = await tabs().evaluateAll((all) =>
      all.findIndex((tab) => tab.classList.contains('active')),
    );
    await tabs().first().click();
    await right().locator('.commander-row').first().waitFor();
    await page.evaluate(recordTopRows, 120);
    await tabs().nth(editorTab).click();
    await content().waitFor();
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return recordedRows();
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
    const frames = await shownAgain();
    assert.ok(frames.length > 0, 'frames drawn');
    assert.deepStrictEqual([...new Set(frames)], [JSON.stringify(scrolledTo)]);
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
    const frames = await shownAgain();
    assert.ok(frames.length > 0, 'frames drawn');
    assert.deepStrictEqual([...new Set(frames)], [JSON.stringify(scrolledTo)]);
    assert.deepStrictEqual(await topRow(), scrolledTo);
    assert.deepStrictEqual(await gapsShown(), [], 'nothing undrawn');
  });

  test('shows a long line where it was scrolled to deep inside it, with a few characters selected inside it, from the first frame drawn each time its tab is shown again, every row in view drawn and the editor focused', async () => {
    await edit('long');
    await waitFor(
      async () => ((await content().textContent()) ?? '') !== '',
      'the text',
    );
    await page.keyboard.press('ControlOrMeta+F');
    await waitFor(
      () =>
        page.evaluate(
          () =>
            document.activeElement?.classList.contains('find-field-input') ===
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
            document.activeElement?.classList.contains('cm-content') === true,
        ),
      'the editor focused',
    );
    await statusIs(/^Ln 223, .*12 characters selected$/);
    const scrolledTo = await settledTopRow();
    assert.match(scrolledTo.text, /^(?!<script)/, 'deep inside the line');
    for (let time = 0; time < 6; time++) {
      const frames = await shownAgain();
      assert.ok(frames.length > 0, 'frames drawn');
      assert.deepStrictEqual(
        [...new Set(frames)],
        [JSON.stringify(scrolledTo)],
        `shown again ${time + 1} times`,
      );
      assert.deepStrictEqual(await gapsShown(), [], 'nothing undrawn');
      assert.ok(
        await page.evaluate(
          () =>
            document.activeElement?.classList.contains('cm-content') === true,
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
    const reloaded = page.waitForEvent('load');
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ dateFormat: 'DD.MM.YYYY' }),
    );
    await reloaded;
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
