import * as assert from 'node:assert';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { windowOfPage } from './cursorWindow';
import { barOf, barParts } from './scrollbarsShown';
import { untilSettled, waitForFocus } from './waits';

const scale = 1.25;
const perNotch = 10;
const markColumn = 16;
const stripRows = 4;
const hangingDotted = 'a dot in the middle of the hanging blank';

const cell = (text: string, width: number) => ` ${text.padEnd(width)} `;
const table = (changed: boolean) =>
  [
    '# Text views alike',
    `x${' '.repeat(600)}end`,
    ...Array.from({ length: 120 }, (_, row) =>
      [
        '',
        cell(`Feature ${row}${changed && row % 9 === 3 ? 'b' : ''}`, 11),
        cell(`What feature ${row} does, in a few words`, 36),
        cell(`git command-${row} --flag`, 23),
        cell(['Core', 'Common', 'Advanced', 'Niche'][row % 4] ?? '', 8),
        cell(row % 4 === 0 ? `A shorter note on feature ${row}` : '', 400),
        '',
      ].join('|'),
    ),
  ].join('\n');

const views = {
  viewer: {
    tab: 1,
    pane: '.viewer-body',
    below: '.viewer-sideways',
    split: undefined,
    rowsOfChange: 1,
  },
  editor: {
    tab: 2,
    pane: '.editor .cm-scroller',
    below: '.editor .cm-editor > .scroll-proxy-frame .scroll-proxy',
    split: undefined,
    rowsOfChange: 1,
  },
  'diff inline': {
    tab: 3,
    pane: '.diff-view .virtual-rows',
    below: '.diff-view .scroll-proxy.horizontal',
    split: false,
    rowsOfChange: 2,
  },
  'diff side by side': {
    tab: 3,
    pane: '.diff-view .virtual-rows',
    below: '.diff-view .scroll-proxy.horizontal',
    split: true,
    rowsOfChange: 1,
  },
} as const;

type ViewName = keyof typeof views;

const viewNames: readonly ViewName[] = [
  'viewer',
  'editor',
  'diff inline',
  'diff side by side',
];

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface Seen {
  readonly pane: Box;
  readonly advance: number;
  readonly marks: readonly {
    readonly left: number;
    readonly top: number;
    readonly height: number;
    readonly lineLeft: number;
  }[];
  readonly numbers: readonly number[];
  readonly breaks: readonly Box[];
}

function seenIn(pane: Element, feature: number): Seen {
  const paneBox = pane.getBoundingClientRect();
  const covered =
    (pane.querySelector('.diff-stuck-header > *')?.getBoundingClientRect()
      .bottom ?? paneBox.top) - paneBox.top;
  const word = `What feature ${feature} `.slice(0, 4);
  const line = `feature ${feature} does`;
  const marks: Seen['marks'][number][] = [];
  const numbers: number[] = [];
  let advance = 0;
  const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const at = (node.textContent ?? '').indexOf(word);
    const row = node.parentElement?.closest(
      '.viewer-row, .cm-line, .diff-line',
    );
    if (at === -1 || !row || !(row.textContent ?? '').includes(line)) {
      continue;
    }
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + word.length);
    const rect = range.getBoundingClientRect();
    advance = rect.width / word.length;
    const within = row.matches('.diff-line') ? row : pane;
    marks.push({
      left: rect.left,
      top: rect.top,
      height: rect.height,
      lineLeft: within.getBoundingClientRect().left,
    });
    numbers.push(
      ...[...row.querySelectorAll('.number')].map(
        (number) => number.getBoundingClientRect().left,
      ),
    );
  }
  const gutter = pane.querySelector('.cm-gutters');
  if (gutter) {
    numbers.push(gutter.getBoundingClientRect().left);
  }
  return {
    pane: {
      left: paneBox.left,
      top: paneBox.top,
      right: paneBox.right,
      bottom: paneBox.bottom,
    },
    advance,
    marks,
    numbers,
    breaks: [...pane.querySelectorAll('.wrap-break, .viewer-break')]
      .filter((mark) => getComputedStyle(mark).visibility !== 'hidden')
      .map((mark) => {
        const { left, top, right, bottom } = mark.getBoundingClientRect();
        return { left, top, right, bottom };
      })
      .filter(
        (mark) =>
          mark.right > mark.left &&
          mark.top >= paneBox.top + covered &&
          mark.bottom <= paneBox.bottom,
      )
      .toSorted((a, b) => a.top - b.top || a.left - b.left)
      .slice(0, 3),
  };
}

const hundredths = (value: number) => Math.round(value * 100) / 100;

interface Shot {
  readonly width: number;
  readonly ratio: number;
  readonly pixels: Buffer;
}

const pixelsOf = (taken: Shot, box: Box) => {
  const rows: Buffer[] = [];
  const left = Math.round(box.left * taken.ratio);
  const right = Math.round(box.right * taken.ratio);
  for (
    let y = Math.round(box.top * taken.ratio);
    y < Math.round(box.bottom * taken.ratio);
    y++
  ) {
    rows.push(
      taken.pixels.subarray(
        (y * taken.width + left) * 4,
        (y * taken.width + right) * 4,
      ),
    );
  }
  return Buffer.concat(rows);
};

const inked = (pixels: Buffer) => {
  let count = 0;
  for (let at = 0; at < pixels.length; at += 4) {
    if (!pixels.subarray(at, at + 3).equals(pixels.subarray(0, 3))) {
      count++;
    }
  }
  return count;
};

const stripsOf = ({ advance, marks }: Seen): Box[] =>
  marks.map((mark) => ({
    left: mark.lineLeft,
    right: Math.floor(mark.left - markColumn * advance) - 1,
    top: mark.top - (stripRows / 2) * mark.height,
    bottom: mark.top + (stripRows / 2) * mark.height,
  }));

const alike = <T>(value: T): Record<string, T> =>
  Object.fromEntries(viewNames.map((name) => [name, value]));

suite('App text views alike', () => {
  let app: ElectronApplication;
  let page: Page;

  const seen = (name: ViewName, feature = 0) =>
    page.locator(views[name].pane).first().evaluate(seenIn, feature);

  const show = async (name: ViewName) => {
    const { tab, pane, split } = views[name];
    await page.locator('.tabs .tab').nth(tab).click();
    await page.locator(pane).first().waitFor();
    if (split !== undefined) {
      const layout = page.locator('.diff-view');
      await layout.first().waitFor();
      if (
        (await page.locator('.diff-view.side-by-side').count()) > 0 !==
        split
      ) {
        await page
          .locator('.compare-view .toolbar[role="group"] button')
          .nth(split ? 1 : 0)
          .click();
        await waitFor(
          async () =>
            (await page.locator('.diff-view.side-by-side').count()) > 0 ===
            split,
          `the diff ${split ? 'side by side' : 'inline'}`,
        );
      }
    }
    await waitFor(async () => {
      await wheel(name, -100_000, false);
      const first = await seen(name);
      await new Promise((resolve) => setTimeout(resolve, 300));
      return (
        first.marks.length === (split === true ? 2 : 1) &&
        first.marks.every((mark) => mark.top > first.pane.top) &&
        JSON.stringify(first) === JSON.stringify(await seen(name))
      );
    }, `the first line of the table in the ${name}, at rest`);
    await page.locator(pane).first().focus();
  };

  const hover = async (name: ViewName) => {
    const box = await page.locator(views[name].pane).first().boundingBox();
    assert.ok(box, `the ${name} has no box`);
    await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
    return box;
  };

  const wheel = async (name: ViewName, delta: number, sideways: boolean) => {
    await hover(name);
    if (sideways) {
      await page.keyboard.down('Shift');
    }
    await page.mouse.wheel(0, delta);
    if (sideways) {
      await page.keyboard.up('Shift');
    }
  };

  const settled = async (name: ViewName, feature = 0) => {
    let last = JSON.stringify(await seen(name, feature));
    await waitFor(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const now = JSON.stringify(await seen(name, feature));
      const same = now === last;
      last = now;
      return same;
    }, `the ${name} at rest`);
    return seen(name, feature);
  };

  const backToStart = async (name: ViewName) => {
    await wheel(name, -100_000, true);
    await wheel(name, -100_000, false);
    await settled(name);
  };

  const shot = async (): Promise<Shot> => {
    const png = await page.screenshot();
    const taken = await app.evaluate(({ nativeImage }, encoded) => {
      const image = nativeImage.createFromBuffer(
        Buffer.from(encoded, 'base64'),
      );
      return {
        width: image.getSize().width,
        pixels: image.toBitmap().toString('base64'),
      };
    }, png.toString('base64'));
    return {
      width: taken.width,
      ratio: taken.width / (await page.evaluate(() => innerWidth)),
      pixels: Buffer.from(taken.pixels, 'base64'),
    };
  };

  const everyView = async <T>(
    check: (name: ViewName) => Promise<T>,
    scrolls = true,
  ): Promise<Record<string, T>> => {
    const found: Record<string, T> = {};
    for (const name of viewNames) {
      await show(name);
      found[name] = await check(name);
      if (scrolls) {
        await backToStart(name);
      }
    }
    return found;
  };

  const dotted = async (name: ViewName) => {
    await waitFor(
      async () => (await seen(name)).breaks.length === 3,
      `three breaks marked in the ${name}`,
    );
    const { breaks, advance } = await settled(name);
    const taken = await shot();
    const inks = breaks.map((mark) =>
      inked(
        pixelsOf(taken, {
          left: mark.left - 0.75 * advance,
          right: mark.left - 0.25 * advance,
          top: mark.top + (mark.bottom - mark.top) / 4,
          bottom: mark.bottom - (mark.bottom - mark.top) / 4,
        }),
      ),
    );
    return inks.every((ink) => ink > 0)
      ? hangingDotted
      : `${JSON.stringify(inks)} pixels of ink in the middle of the cell before each mark, at ${JSON.stringify(breaks)}, a column ${advance} wide, ${taken.ratio} device pixels a pixel`;
  };

  beforeAll(async () => {
    const folder = tempFolder('text-views-alike');
    const profile = path.join(folder, 'profile');
    const opened = path.join(folder, 'opened');
    fs.mkdirSync(opened, { recursive: true });
    fs.mkdirSync(profile, { recursive: true });
    const one = path.join(opened, 'padded-one.txt');
    const two = path.join(opened, 'padded-two.txt');
    fs.writeFileSync(one, table(false));
    fs.writeFileSync(two, table(true));
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'commander', root: opened },
          { id: '2', tool: 'viewer', root: one },
          { id: '3', tool: 'editor', root: one },
          { id: '4', tool: 'diff', compare: { old: one, new: two } },
        ],
        activeTab: '2',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({
        scrolling: { smooth: false, wheelRows: perNotch },
        text: { wordWrap: false, highlightOccurrences: false },
      }),
    );
    app = await launchApp(profile, {
      scale,
    });
    page = await app.firstWindow();
  });

  afterAll(async () => {
    await closeOrKill(app);
  });

  test('moves the text of every view by the columns of a notch, onto whole columns, as the wheel turns with Shift while scrolling does not glide, the numbers before the text staying where they are', async () => {
    assert.deepStrictEqual(
      await everyView(async (name) => {
        const rest = await settled(name);
        await wheel(name, 100, true);
        const moved = await settled(name);
        return {
          columns: rest.marks.map((mark, index) =>
            hundredths(
              (mark.left - (moved.marks[index]?.left ?? NaN)) / rest.advance,
            ),
          ),
          numbers: moved.numbers.map((left, index) =>
            hundredths(left - (rest.numbers[index] ?? NaN)),
          ),
        };
      }),
      {
        viewer: { columns: [perNotch], numbers: [] },
        editor: { columns: [perNotch], numbers: [0] },
        'diff inline': { columns: [perNotch], numbers: [0, 0] },
        'diff side by side': {
          columns: [perNotch, perNotch],
          numbers: [0, 0],
        },
      },
    );
  });

  test('draws nothing new before the first column of a view scrolled sideways, the numbers, their line and the gap after them looking as they did at rest, so the text is cut where its first column starts in every view', async () => {
    assert.deepStrictEqual(
      await everyView(async (name) => {
        const rest = await settled(name);
        const strips = stripsOf(rest);
        const before = await shot();
        await wheel(name, 100, true);
        await settled(name);
        const after = await shot();
        return strips.map((strip) =>
          pixelsOf(before, strip).equals(pixelsOf(after, strip)),
        );
      }),
      {
        viewer: [true],
        editor: [true],
        'diff inline': [true],
        'diff side by side': [true, true],
      },
    );
  });

  test('leaves the text of every view on whole columns as its scrollbar is dragged sideways, as the wheel does', async () => {
    assert.deepStrictEqual(
      await everyView(async (name) => {
        const rest = await settled(name);
        const { box } = await barOf(page, views[name].below, 'horizontal');
        const { thumb } = await barParts(page, box, 'horizontal');
        assert.ok(thumb, `the scrollbar below the ${name} has no thumb`);
        const x = thumb.left + thumb.width / 2;
        const y = thumb.top + thumb.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 37, y, { steps: 5 });
        await page.mouse.up();
        const moved = await settled(name);
        const columns = rest.marks.map(
          (mark, index) =>
            (mark.left - (moved.marks[index]?.left ?? NaN)) / rest.advance,
        );
        return columns.map(
          (by) => by > 1 && Math.abs(by - Math.round(by)) < 0.01,
        );
      }),
      {
        viewer: [true],
        editor: [true],
        'diff inline': [true],
        'diff side by side': [true, true],
      },
    );
  });

  test('moves every view down by the rows of a notch at once as the wheel turns, the row of the table that many further down standing where its first stood, one less in the inline diff, whose changed line takes a row for each side', async () => {
    assert.deepStrictEqual(
      await everyView(async (name) => {
        const rest = await settled(name);
        await wheel(name, 100, false);
        const moved = await settled(
          name,
          perNotch + 1 - views[name].rowsOfChange,
        );
        return moved.marks.map((mark, index) =>
          hundredths(mark.top - (rest.marks[index]?.top ?? NaN)),
        );
      }),
      {
        viewer: [0],
        editor: [0],
        'diff inline': [0],
        'diff side by side': [0, 0],
      },
    );
  });

  test('draws the dots of the spaces in the editor alike with text selected and without, as the browser keeps its own caret, hidden under the cursor of the editor, in a layer of its own while nothing is selected and paints the dots over it apart from the text, which blurred them by half a device pixel where the editor starts between two', async () => {
    await show('editor');
    const pane = await page.locator(views.editor.pane).first().boundingBox();
    assert.ok(pane, 'the editor has no box');
    await page.mouse.click(pane.x + pane.width / 2, pane.y + pane.height / 2);
    await waitForFocus(page.locator('.editor .cm-content'), 'the editor');
    await page.keyboard.press('ControlOrMeta+Home');
    for (let row = 0; row < 3; row++) {
      await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.press('Home');
    const line = await page.locator('.editor .cm-line').nth(3).boundingBox();
    assert.ok(line, 'the editor shows no fourth line');
    const away = {
      left: pane.x,
      right: pane.x + pane.width,
      top: line.y + 4 * line.height,
      bottom: pane.y + pane.height,
    };
    const settledDots = async (what: string) => {
      await page.mouse.move(2, 2);
      let last = Buffer.alloc(0);
      await untilSettled(async () => {
        last = pixelsOf(await shot(), away);
        return createHash('sha1').update(last).digest('hex');
      }, what);
      return last;
    };
    const plain = await settledDots('the dots with nothing selected');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    const selected = await settledDots('the dots with text selected');
    await page.keyboard.press('ArrowLeft');
    let differing = 0;
    for (let at = 0; at < plain.length; at += 4) {
      if (!plain.subarray(at, at + 3).equals(selected.subarray(at, at + 3))) {
        differing++;
      }
    }
    assert.ok(inked(plain) > 0, 'no dots below the line of the cursor');
    assert.strictEqual(differing, 0, 'pixels that changed with the selection');
  });

  test('dots the blank hanging at the end of a wrapped row, right before the mark of its break, in every view, however much of a column is left over beside the rows as the window gets narrower', async () => {
    await show('viewer');
    await page.keyboard.press('w');
    await page.locator('.viewer-rows.wrapped').waitFor();
    const narrower = [0, 2, 2];
    const window = await windowOfPage(app, page);
    const found: Record<string, string>[] = [];
    for (const by of narrower) {
      await app.evaluate(
        ({ BrowserWindow }, [id, less]) => {
          const shown = BrowserWindow.fromId(id);
          const [width = 0, height = 0] = shown?.getContentSize() ?? [];
          shown?.setContentSize(width - less, height);
        },
        [window, by] as const,
      );
      const wide = await page.evaluate(() => innerWidth);
      await waitFor(
        async () =>
          by === 0 || (await page.evaluate(() => innerWidth)) !== wide,
        'the window narrower',
      ).catch(() => undefined);
      found.push(await everyView(dotted, false));
    }
    assert.deepStrictEqual(
      found,
      narrower.map(() => alike(hangingDotted)),
    );
  });
});
