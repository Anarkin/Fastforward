import { diffLinesSeen, diffSides } from './diffSeen';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { baseSettings, launchApp } from './appLaunch';
import { barOf, barParts, type Axis } from './scrollbarsShown';
import { onceDrawn } from './waits';
import { longLines } from './wrappingSamples';
import { waitFor } from '../helpers/fixtures';
import { viewerRows, viewerTexts } from './cellsSeen';
import { tempRepository } from '../helpers/repositories';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { rounded } from './rounding';

const scale = 1.25;

async function pixelsOf(
  page: Page,
  shot: Buffer,
  points: readonly (readonly [number, number])[],
): Promise<string[]> {
  return page.evaluate(
    async ({ data, at }) => {
      const bytes = Uint8Array.from(atob(data), (each) => each.charCodeAt(0));
      const image = await createImageBitmap(
        new Blob([bytes], { type: 'image/png' }),
      );
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext('2d');
      context?.drawImage(image, 0, 0);
      return at.map(([x, y]) =>
        Array.from(context?.getImageData(x, y, 1, 1).data ?? []).join(','),
      );
    },
    { data: shot.toString('base64'), at: points },
  );
}

const scaled = (value: number) => Math.round(value * scale);

const topCommit = async (page: Page): Promise<void> => {
  await page
    .locator('.columns > .column')
    .first()
    .locator('.virtual-rows')
    .evaluate((list) => list.scrollTo({ top: 0 }));
  await page.locator('.commit', { hasText: 'first' }).click();
  await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
  await page.locator('.row.file', { hasText: 'file0.txt' }).waitFor();
};

const partPointedAt = (page: Page) =>
  page.evaluate(
    () =>
      document
        .querySelector('[data-scrollbar-hover]')
        ?.getAttribute('data-scrollbar-hover') ?? '',
  );

async function partAgainstLine(
  page: Page,
  scroller: string,
  axis: Axis,
  part: 'thumb' | 'end',
  edge: 'right' | 'bottom',
): Promise<{
  readonly reached: string | undefined;
  readonly before: string | undefined;
  readonly line: string | undefined;
}> {
  await page.mouse.move(2, 2);
  await waitFor(
    async () => (await partPointedAt(page)) === '',
    'no scrollbar to be pointed at',
  );
  await onceDrawn(page);
  const bare = await page.screenshot();
  const { box } = await barOf(page, scroller, axis);
  const found = (await barParts(page, box, axis))[part];
  assert.ok(found, `the ${axis} scrollbar of ${scroller} has no ${part}`);
  const middle = {
    x: found.left + found.width / 2,
    y: found.top + found.height / 2,
  };
  await page.mouse.move(middle.x, middle.y);
  await waitFor(
    async () => (await partPointedAt(page)) === `${axis}-${part}`,
    `the ${part} of the ${axis} scrollbar to be pointed at`,
  );
  const column = await page
    .locator(scroller)
    .first()
    .evaluate((element) => {
      const { right, bottom } = element
        .closest('.column')
        ?.getBoundingClientRect() ?? { right: 0, bottom: 0 };
      return { right, bottom };
    });
  const points: [number, number][] =
    edge === 'right'
      ? Array.from(
          { length: scaled(column.right) - scaled(middle.x) },
          (_, index) => [scaled(middle.x) + index, scaled(found.top + 4)],
        )
      : Array.from(
          { length: scaled(column.bottom) - scaled(middle.y) },
          (_, index) => [scaled(found.left + 4), scaled(middle.y) + index],
        );
  const without = await pixelsOf(page, bare, points);
  let pointedAt = without;
  await waitFor(async () => {
    pointedAt = await pixelsOf(page, await page.screenshot(), points);
    return pointedAt[0] !== without[0];
  }, `the ${part} of the ${axis} scrollbar to be drawn as pointed at`);
  const reached = without.findIndex(
    (pixel, index) => pixel === pointedAt[index],
  );
  return {
    reached: without[reached],
    before: pointedAt[reached - 1],
    line: without[without.length - 1],
  };
}

suite('App at a scale of 125%', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('scaled');
    const profile = path.join(folder, 'profile');
    const repository = await tempRepository(path.join(folder, 'repo'));
    for (let index = 0; index < 60; index++) {
      await repository.git('commit', '--allow-empty', '-m', `step ${index}`);
    }
    await repository.commit(
      'first',
      Object.fromEntries(
        Array.from({ length: 80 }, (_, index) => [
          `src/file${index}.txt`,
          `${index}\n`,
        ]),
      ),
    );
    fs.writeFileSync(
      path.join(folder, 'long.txt'),
      `${longLines.join('\n')}\n`,
    );
    fs.writeFileSync(
      path.join(folder, 'apart.txt'),
      `${longLines.join('\n')}\n`,
    );
    fs.writeFileSync(
      path.join(folder, 'beside.txt'),
      `${longLines.map((line, index) => (index % 3 === 0 ? `${line} more` : line)).join('\n')}\n`,
    );
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'git', root: repository.root },
          { id: '2', tool: 'commander', root: folder },
        ],
        activeTab: '1',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify(baseSettings),
    );
    app = await launchApp(profile, {
      scale,
    });
    page = await app.firstWindow();
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'file0.txt' }).waitFor();
  });

  afterAll(async () => {
    await app?.close();
    removeFolder(folder);
  });

  test('runs the scrollbar of the files over every pixel up to the lines around it, its thumb up to the line of their column beside it and its last button up to the line under the files, those a line fills in part too, and over none a line fills whole, wherever the column falls between pixels', async () => {
    const files = '.columns > .column:nth-child(2) .virtual-rows';
    const beside = await partAgainstLine(
      page,
      files,
      'vertical',
      'thumb',
      'right',
    );
    assert.strictEqual(beside.reached, beside.line, JSON.stringify(beside));
    assert.notStrictEqual(beside.before, beside.line, JSON.stringify(beside));
    const below = await partAgainstLine(
      page,
      files,
      'vertical',
      'end',
      'bottom',
    );
    assert.strictEqual(below.reached, below.line, JSON.stringify(below));
  });

  test('ends a list scrolled to its end above the line of its column, so its last row shows whole', async () => {
    const list = page
      .locator('.columns > .column')
      .nth(1)
      .locator('.virtual-rows');
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.evaluate(
      () =>
        new Promise((drawn) =>
          requestAnimationFrame(() => requestAnimationFrame(drawn)),
        ),
    );
    const below = await list.evaluate((element) => {
      const column = element.closest('.column');
      if (!column) {
        return Number.NaN;
      }
      const line = parseFloat(
        getComputedStyle(column).getPropertyValue('--column-line'),
      );
      const last = Math.max(
        ...[...element.querySelectorAll('.virtual-row')].map(
          (row) => row.getBoundingClientRect().bottom,
        ),
      );
      return column.getBoundingClientRect().bottom - line - last;
    });
    assert.ok(below >= -0.01, String(below));
  });

  test('reveals a row it moves to at the bottom of a list above the line of its column', async () => {
    const list = page
      .locator('.columns > .column')
      .nth(1)
      .locator('.virtual-rows');
    await list.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.locator('.row.file', { hasText: 'file0.txt' }).click();
    for (let step = 0; step < 45; step++) {
      await page.keyboard.press('ArrowDown');
    }
    const below = async () =>
      list.evaluate((element) => {
        const column = element.closest('.column');
        const selected = element.querySelector('.row.selected');
        if (!column || !selected) {
          return Number.NaN;
        }
        const line = parseFloat(
          getComputedStyle(column).getPropertyValue('--column-line'),
        );
        return (
          column.getBoundingClientRect().bottom -
          line -
          selected.getBoundingClientRect().bottom
        );
      });
    await waitFor(async () => !Number.isNaN(await below()), 'a row selected');
    await page.waitForTimeout(500);
    assert.ok((await below()) >= -0.01, String(await below()));
  });

  test('draws the line of each column on whole device pixels, so what stands against it meets it', async () => {
    const lines = await page
      .locator('.columns > .column')
      .evaluateAll((columns) =>
        columns.map(
          (column) =>
            parseFloat(
              getComputedStyle(column).getPropertyValue('--column-line'),
            ) * devicePixelRatio,
        ),
      );
    assert.deepStrictEqual(
      lines.map((line) => Math.round(line * 1000) / 1000),
      lines.map((line) => Math.max(1, Math.round(line))),
    );
  });

  test('paints the device pixels the app leaves at the edge of a window, which is no whole number of pixels wide, in the color around its columns', async () => {
    const shot = await page.screenshot();
    const width = await page.evaluate(() =>
      Math.ceil(innerWidth * devicePixelRatio),
    );
    const height = Math.round((await page.evaluate(() => innerHeight)) * scale);
    const [last, before] = await pixelsOf(page, shot, [
      [width - 1, Math.round(height / 2)],
      [width - 2, Math.round(height / 2)],
    ]);
    assert.strictEqual(last, before);
  });

  test('centers the buttons of the title of each column between the line of the column and the line under the title, to a device pixel', async () => {
    const gaps = await page
      .locator('.columns > .column')
      .evaluateAll((columns) =>
        columns.map((column) => {
          const title = column.querySelector('.column-title');
          const button = title?.querySelector('button');
          if (!title || !button) {
            return undefined;
          }
          const ratio = devicePixelRatio;
          const device = (value: number) => Math.round(value * ratio);
          const line = parseFloat(
            getComputedStyle(column).getPropertyValue('--column-line'),
          );
          const under = parseFloat(getComputedStyle(title).borderBottomWidth);
          const box = button.getBoundingClientRect();
          const edges = title.getBoundingClientRect();
          return {
            above: device(box.top) - device(edges.top + line),
            below: device(edges.bottom - under) - device(box.bottom),
          };
        }),
      );
    for (const gap of gaps) {
      assert.ok(
        gap !== undefined && Math.abs(gap.above - gap.below) <= 1,
        JSON.stringify(gaps),
      );
    }
  });

  test('draws the app icon of the title bar with the edges between its sky and the back and front of its folder on whole device pixels, so no row of it blends two of them', async () => {
    const box = await page.locator('.title-bar-icon').first().boundingBox();
    assert.ok(box, 'the app icon has no box');
    const size = Math.round(box.width * scale);
    const column = Math.round(box.x * scale) + Math.floor(size * 0.3);
    const top = Math.round(box.y * scale);
    const pixels = await pixelsOf(
      page,
      await page.screenshot(),
      Array.from(
        { length: Math.floor(size * 0.7) - Math.ceil(size * 0.15) },
        (_, index): [number, number] => [
          column,
          top + Math.ceil(size * 0.15) + index,
        ],
      ),
    );
    const bands = ['26,115,232,255', '216,139,0,255', '251,188,4,255'];
    assert.deepStrictEqual(
      pixels.filter((pixel) => !bands.includes(pixel)),
      [],
      JSON.stringify(pixels),
    );
  });

  test('edges a menu with its line on one whole device pixel, with no faint pixel inside it', async () => {
    await page.locator('.tabs .tab-add').click();
    const menu = page.locator('.menu').first();
    await menu.waitFor();
    await page.waitForTimeout(300);
    const box = await menu.boundingBox();
    assert.ok(box, 'the menu has no box');
    const line = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.color = 'var(--color-border)';
      document.body.append(probe);
      const { color } = getComputedStyle(probe);
      probe.remove();
      return `${color.match(/\d+/g)?.slice(0, 3).join(',') ?? ''},255`;
    });
    const start = Math.round(box.x * scale);
    const row = await pixelsOf(
      page,
      await page.screenshot(),
      Array.from({ length: 5 }, (_, index): [number, number] => [
        start - 1 + index,
        Math.round((box.y + box.height / 2) * scale),
      ]),
    );
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
    const inside = row.at(-1);
    const edge = row.findLastIndex((pixel) => pixel !== inside);
    assert.strictEqual(row[edge], line, JSON.stringify(row));
  });

  test('rounds the end of the scrollbar of the shortcuts of the commander, the longest, as their window rounds its corner once the app has a radius, painting none of it past the corner, as a thumb stood square past the corner where the side of the shortcuts fell between pixels', async () => {
    await rounded(page);
    await page.keyboard.press('F1');
    const pane = page.locator('.shortcuts-pane');
    await pane.waitFor();
    try {
      await page.locator('.shortcuts-tool', { hasText: 'Commander' }).click();
      await page
        .locator('.shortcuts-tool.open', { hasText: 'Commander' })
        .waitFor();
      assert.ok(
        await pane.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
        'the shortcuts of the commander fit their window, so it has no scrollbar',
      );
      const { box } = await barOf(page, '.shortcuts-pane', 'vertical');
      const corner = await pane.evaluate((element) => {
        const window = element.closest('.shortcuts-window');
        if (window === null) {
          return undefined;
        }
        const style = getComputedStyle(window);
        const line = parseFloat(
          getComputedStyle(window, '::after').getPropertyValue('--frame-line'),
        );
        const end = parseFloat(
          getComputedStyle(element).getPropertyValue('--scrollbar-round-end'),
        );
        const { right, bottom } = window.getBoundingClientRect();
        return {
          right,
          bottom,
          end,
          rounded:
            parseFloat(style.borderBottomRightRadius) -
            Math.floor(line * devicePixelRatio + 0.001) / devicePixelRatio,
        };
      });
      assert.ok(corner, 'the shortcuts are in no window');
      await page.mouse.move(2, 2);
      await onceDrawn(page);
      const right = Math.round(corner.right * scale);
      const bottom = Math.round(corner.bottom * scale);
      const [within, past] = await pixelsOf(page, await page.screenshot(), [
        [right - 8, bottom - 8],
        [right - 1, bottom - 1],
      ]);
      const seen = JSON.stringify({ box, corner, within, past });
      assert.ok(
        Math.abs(box.left + box.width - corner.right) < 1 &&
          Math.abs(box.top + box.height - corner.bottom) < 1,
        seen,
      );
      assert.ok(corner.rounded > 0, seen);
      assert.ok(Math.abs(corner.end - corner.rounded) < 0.01, seen);
      assert.notStrictEqual(past, within, seen);
    } finally {
      await page.keyboard.press('Escape');
      await pane.waitFor({ state: 'detached' });
    }
  });

  test('runs the scrollbars of a file viewed at its end over every pixel up to the lines of its column, the thumb of the one beside it up to the line on the right and the thumb of the one below it up to the bottom line, and over none the lines fill', async () => {
    await page.locator('.tabs [role="tab"]').nth(1).click();
    const side = page.locator('.commander-pane').nth(1);
    await side.locator('.commander-row', { hasText: 'long' }).click();
    await page.keyboard.press('F3');
    await page.locator(viewerRows).first().waitFor();
    try {
      await page.keyboard.press('End');
      await waitFor(
        async () =>
          (await viewerTexts(page)).some((text) =>
            text.includes(`line${longLines.length - 1} `),
          ),
        'the last line of the file',
      );
      const beside = await partAgainstLine(
        page,
        '.viewer-body .scroll-proxy.vertical',
        'vertical',
        'thumb',
        'right',
      );
      const below = await partAgainstLine(
        page,
        '.viewer-sideways',
        'horizontal',
        'thumb',
        'bottom',
      );
      for (const met of [beside, below]) {
        assert.strictEqual(met.reached, met.line, JSON.stringify(met));
        assert.notStrictEqual(met.before, met.line, JSON.stringify(met));
      }
    } finally {
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });
    }
  });

  test('keeps the scroller standing in for the scrollbar of a file viewed as wide as the scrollbar setting while the browser draws its bar a whole number of device pixels narrower, as one no wider than its bar dropped 47 frames of a drag of its thumb at 125% rather than 39', async () => {
    await page.locator('.tabs [role="tab"]').nth(1).click();
    const side = page.locator('.commander-pane').nth(1);
    await side.locator('.commander-row', { hasText: 'long' }).click();
    await page.keyboard.press('F3');
    await page.locator(viewerRows).first().waitFor();
    try {
      const sizes = await page
        .locator('.viewer-body .scroll-proxy.vertical')
        .evaluate((proxy) => [
          proxy.parentElement?.getBoundingClientRect().width ?? 0,
          parseFloat(getComputedStyle(proxy, '::-webkit-scrollbar').width),
        ]);
      assert.deepStrictEqual(
        sizes.map((length) => Math.round(length * 100) / 100),
        [18, 17.6],
      );
    } finally {
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });
    }
  });

  test('reveals a commit it moves to at the bottom of the list above the line of its column', async () => {
    await page.locator('.tabs [role="tab"]').first().click();
    const list = page
      .locator('.columns > .column')
      .first()
      .locator('.virtual-rows');
    await page.locator('.commit', { hasText: 'first' }).click();
    for (let step = 0; step < 45; step++) {
      await page.keyboard.press('ArrowDown');
    }
    await page.waitForTimeout(500);
    const below = await list.evaluate((element) => {
      const column = element.closest('.column');
      const selected = element.querySelector('.commit.selected');
      if (!column || !selected) {
        return Number.NaN;
      }
      const line = parseFloat(
        getComputedStyle(column).getPropertyValue('--column-line'),
      );
      return (
        column.getBoundingClientRect().bottom -
        line -
        selected.getBoundingClientRect().bottom
      );
    });
    assert.ok(below >= -0.01, String(below));
  });

  test('rings the dot of a commit in the color its row shows, plain or selected', async () => {
    const grounds = await page
      .locator('.columns > .column')
      .first()
      .locator('.virtual-rows')
      .evaluate((list) => {
        const view = list.ownerDocument.defaultView;
        const ring = (commit: Element | null | undefined) => {
          const dot = commit?.previousElementSibling?.querySelector('circle');
          return dot ? (view?.getComputedStyle(dot).stroke ?? '') : 'no dot';
        };
        const selected = list.querySelector('.commit.selected');
        const plain = [...list.querySelectorAll('.commit:not(.selected)')].find(
          (commit) =>
            !commit.matches(':hover') &&
            commit.previousElementSibling?.querySelector('circle'),
        );
        const column = list.closest('.column');
        return {
          selected: ring(selected),
          selectedRow: selected
            ? getComputedStyle(selected).backgroundColor
            : '',
          plain: ring(plain),
          panel: column ? getComputedStyle(column).backgroundColor : '',
        };
      });
    assert.deepStrictEqual(
      [grounds.selected, grounds.plain],
      [grounds.selectedRow, grounds.panel],
    );
  });

  test('draws the lanes of the graph on whole device pixels, with no pixel half in a lane', async () => {
    await page.mouse.move(2, 2);
    const list = page
      .locator('.columns > .column')
      .first()
      .locator('.virtual-rows');
    const across = await list.evaluate((element) => {
      const shown = element.getBoundingClientRect();
      const row = [...element.querySelectorAll('.virtual-row')].find(
        (each) =>
          each.getBoundingClientRect().top > shown.top &&
          each.getBoundingClientRect().bottom < shown.bottom &&
          each.querySelector('.commit:not(.selected)') &&
          each.querySelector('.graph path'),
      );
      const graph = row?.querySelector('.graph');
      const line = graph?.querySelector('path');
      if (!row || !graph || !line) {
        return undefined;
      }
      const box = graph.getBoundingClientRect();
      return {
        left: box.left,
        top: row.getBoundingClientRect().top + 2,
        lane: getComputedStyle(line).stroke,
        ground: getComputedStyle(element).backgroundColor,
      };
    });
    assert.ok(across, 'no row of the graph');
    const shot = await page.screenshot();
    const start = Math.ceil((across.left + 3) * scale);
    const pixels = await pixelsOf(
      page,
      shot,
      Array.from({ length: 16 }, (_, index): [number, number] => [
        start + index,
        Math.round(across.top * scale),
      ]),
    );
    const colors = await page.evaluate(
      (css) =>
        css.map((color) => {
          const canvas = new OffscreenCanvas(1, 1);
          const context = canvas.getContext('2d');
          if (!context) {
            return '';
          }
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return Array.from(context.getImageData(0, 0, 1, 1).data).join(',');
        }),
      [across.lane, across.ground],
    );
    assert.deepStrictEqual(
      pixels.filter((pixel) => !colors.includes(pixel)),
      [],
      JSON.stringify({ pixels, colors }),
    );
  });

  test('opens the search of the commits over their title with its button and line where those of the title are, to a device pixel', async () => {
    const column = page.locator('.columns > .column').first();
    const place = () =>
      column.evaluate((element) => {
        const ratio = devicePixelRatio;
        const device = (value: number) => Math.round(value * ratio);
        const popup = element.querySelector('.locations-popup');
        const title = element.querySelector('.column-title');
        const button = (popup ?? title)?.querySelector('button');
        const line = popup
          ? popup.querySelector('.locations-groups')?.getBoundingClientRect()
              .top
          : title
            ? title.getBoundingClientRect().bottom -
              parseFloat(getComputedStyle(title).borderBottomWidth)
            : undefined;
        return {
          button: device(button?.getBoundingClientRect().top ?? Number.NaN),
          line: device(line ?? Number.NaN),
        };
      });
    const closed = await place();
    await column.locator('.search-button').first().click();
    await column.locator('.locations-popup').waitFor();
    const opened = await place();
    await page.keyboard.press('Escape');
    await column.locator('.locations-popup').waitFor({ state: 'detached' });
    assert.deepStrictEqual(opened, closed);
  });

  test('wraps a diff to the columns that fit its side, so the mark of each break stands inside it, where the code starts between device pixels too, inline and side by side', async () => {
    await page.locator('.tabs [role="tab"]').nth(1).click();
    const side = page.locator('.commander-pane').nth(1);
    await side.locator('.commander-row', { hasText: 'apart' }).click();
    await page.keyboard.press('Insert');
    await page.keyboard.press('Insert');
    await page.keyboard.press('Shift+F3');
    const diff = page.locator('.diff-view .virtual-rows');
    await waitFor(
      async () => (await diffLinesSeen(page)).length > 5,
      'the lines of the diff',
    );
    await diff.click({ position: { x: 200, y: 100 } });
    await page.keyboard.press('w');
    const marksInside = () =>
      page.evaluate(
        (sides) =>
          [...document.querySelectorAll<HTMLElement>(sides)].map((host) => {
            const { right } = host.getBoundingClientRect();
            return (host.seenRows?.() ?? []).flatMap(
              ({ breakAt, left, column, advance }) =>
                breakAt === undefined
                  ? []
                  : [left + (breakAt - column + 1) * advance <= right + 0.01],
            );
          }),
        diffSides,
      );
    const wrapped = (sides: number) =>
      waitFor(async () => {
        const marks = await marksInside();
        return marks.length === sides && marks.flat().length > 0;
      }, `the lines wrapped on ${sides} sides`);
    await wrapped(1);
    const inline = await marksInside();
    await page.locator(`[data-tip="${strings.diff.sideBySide}"]`).click();
    await wrapped(2);
    const sideBySide = await marksInside();
    assert.deepStrictEqual(
      [inline.flat().includes(false), sideBySide.flat().includes(false)],
      [false, false],
    );
  });

  test('sizes what stands beside a scrollbar by the width the browser draws the scrollbar, on whole device pixels, as the browser cuts 18 pixels down to 17.6 at 125% while the page took 18, so a view that stood a scroller in for its scrollbar ended its text 0.4 pixels short of one with a scrollbar of its own', async () => {
    const widths = await page.evaluate(() => {
      const scroller = document.createElement('div');
      scroller.style.cssText =
        'position: fixed; left: 0; top: 0; width: 200px; height: 100px; overflow: scroll';
      const inside = document.createElement('div');
      inside.style.cssText = 'width: 100%; height: 10px';
      const sized = document.createElement('div');
      sized.style.cssText =
        'position: fixed; left: 0; top: 0; width: var(--scrollbar-size); height: 1px';
      scroller.append(inside);
      document.body.append(scroller, sized);
      const drawn = 200 - inside.getBoundingClientRect().width;
      const taken = sized.getBoundingClientRect().width;
      scroller.remove();
      sized.remove();
      return { drawn, taken };
    });
    assert.ok(
      Math.abs(widths.drawn - widths.taken) < 1 / 64,
      JSON.stringify(widths),
    );
  });

  test('takes the pointer over the scrollbar of a list from where what the list scrolls ends to its edge, as the width taken from the rounded width of what it scrolls put it up to a pixel off', async () => {
    await page.locator('.tabs [role="tab"]').first().click();
    await topCommit(page);
    const files = page
      .locator('.columns > .column:nth-child(2) .virtual-rows')
      .first();
    const drawn = await files.evaluate((element) => {
      const inside = document.createElement('div');
      inside.style.cssText = 'width: 100%; height: 0; flex: none';
      element.append(inside);
      const content = inside.getBoundingClientRect();
      inside.remove();
      const { right, top, height } = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const left = content.right + (parseFloat(style.paddingRight) || 0);
      return {
        left,
        top: top + (parseFloat(style.borderTopWidth) || 0),
        width: right - (parseFloat(style.borderRightWidth) || 0) - left,
        height,
      };
    });
    const { cover } = await barParts(page, drawn, 'vertical');
    assert.ok(
      Math.abs(cover.left - drawn.left) < 1 / 64 &&
        Math.abs(cover.width - drawn.width) < 1 / 64,
      JSON.stringify({ cover, drawn }),
    );
  });
});
