import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Locator, Page } from 'playwright-core';
import { suite, test, afterAll, beforeAll } from 'vitest';
import { baseSettings, launchApp, savedTabs } from './appLaunch';
import {
  page as sharedPage,
  repository as sharedRepository,
  sharedApp,
} from './appFixtures';
import { diffRowsSeen, untilDiffLine } from './diffSeen';
import { scrollPlaces } from './scrollProbes';
import { barOf, barParts } from './scrollbarsShown';
import { longLines, firstLongLine } from './wrappingSamples';
import { defaultSettings, waitFor, writeWhenFree } from '../helpers/fixtures';
import { tempRepository } from '../helpers/repositories';
import { removeFolder, tempFolder } from '../helpers/tempFolders';

const diffRows = '.diff-view > .virtual-rows';
const diffBarBelow = '.diff-view .scroll-proxy.horizontal';
const diffColumn = '.column-body:has(> .diff-view)';
const fileRows = '.columns > .column:nth-child(2) .virtual-rows';

const whole = (pixels: number) => Math.round(pixels) + 0;

const firstLineShown = () =>
  untilDiffLine(
    sharedPage,
    ({ text }) => text.includes('line0 '),
    'the first line of the file',
  );

suite('App', () => {
  sharedApp({
    'long.txt': `${longLines.join('\n')}\n`,
  });

  test('scrolls the diff by whole lines, gliding to each line, after its scrollbar dragged too, and coming to rest with a line at the top of the view', async () => {
    const file = path.join(sharedRepository.root, 'long.txt');
    await writeWhenFree(
      file,
      `${longLines.map((line, index) => (index % 10 === 0 ? `changed ${index}` : line)).join('\n')}\n`,
    );
    try {
      await sharedPage.locator('.commit', { hasText: 'second' }).click();
      await sharedPage
        .locator('.commit.selected', { hasText: 'second' })
        .waitFor();
      await sharedPage
        .locator('.commit.working-tree', { hasText: '1 uncommitted change' })
        .click();
      await sharedPage.locator('.row.file', { hasText: 'long.txt' }).click();
      await untilDiffLine(
        sharedPage,
        ({ change }) => change === 'added',
        'the added line',
      );
      const list = sharedPage.locator('.diff-view .virtual-rows');
      const place = () =>
        list.evaluate((element) => {
          const top = element.getBoundingClientRect().top;
          const seen = [
            ...element.querySelectorAll<HTMLElement>('.diff-cells'),
          ].flatMap((cells) => cells.seenRows?.() ?? []);
          const line = seen[0]?.height ?? 1;
          const first = [
            ...[...element.querySelectorAll('.virtual-row')].map((row) =>
              row.getBoundingClientRect(),
            ),
            ...seen.map((row) => new DOMRect(row.left, row.top, 1, row.height)),
          ]
            .filter((box) => box.height > 0 && box.bottom > top + 0.5)
            .toSorted((one, other) => one.top - other.top)[0];
          return {
            scrolled: element.scrollTop,
            lines: element.scrollTop / line,
            offset: (first?.top ?? top) - top,
          };
        });
      await list.hover();
      const wheeled = await scrollPlaces(sharedPage, list, () =>
        sharedPage.mouse.wheel(0, 50),
      );
      const scrolled = await place();
      assert.ok((wheeled.at(-1) ?? 0) > 0, JSON.stringify(wheeled));
      assert.ok(
        Math.abs(scrolled.lines - Math.round(scrolled.lines)) < 0.01 &&
          Math.abs(scrolled.offset) < 0.01,
        JSON.stringify(scrolled),
      );

      const bar = await barOf(sharedPage, diffRows, 'vertical');
      const { thumb } = await barParts(sharedPage, bar.box, 'vertical');
      assert.ok(thumb, 'the scrollbar of the diff has no thumb');
      await list.evaluate((element) => {
        const offsets: number[] = [];
        Reflect.set(window, 'lineOffsets', offsets);
        const painted = new MessageChannel();
        painted.port1.addEventListener('message', () => {
          const top = element.getBoundingClientRect().top;
          const first = [
            ...[...element.querySelectorAll('.virtual-row')].map((row) =>
              row.getBoundingClientRect(),
            ),
            ...[...element.querySelectorAll<HTMLElement>('.diff-cells')]
              .flatMap((cells) => cells.seenRows?.() ?? [])
              .map((row) => new DOMRect(row.left, row.top, 1, row.height)),
          ]
            .filter((box) => box.height > 0 && box.bottom > top + 0.5)
            .toSorted((one, other) => one.top - other.top)[0];
          offsets.push((first?.top ?? top) - top);
          if (Reflect.get(window, 'lineOffsets') === offsets) {
            requestAnimationFrame(() => painted.port2.postMessage(null));
          }
        });
        painted.port1.start();
        requestAnimationFrame(() => painted.port2.postMessage(null));
      });
      const x = thumb.left + thumb.width / 2;
      const y = thumb.top + thumb.height / 2;
      await sharedPage.mouse.move(x, y);
      await sharedPage.mouse.down();
      for (let step = 1; step <= 30; step++) {
        await sharedPage.mouse.move(x, y + step);
        await sharedPage.evaluate(
          () => new Promise((resolve) => requestAnimationFrame(resolve)),
        );
      }
      await sharedPage.mouse.up();
      const offsets = await sharedPage.evaluate(() => {
        const recorded: unknown = Reflect.get(window, 'lineOffsets');
        Reflect.set(window, 'lineOffsets', undefined);
        return Array.isArray(recorded) ? recorded.map(Number) : [];
      });
      assert.ok((await place()).scrolled > scrolled.scrolled);
      assert.ok(
        offsets.some((offset) => Math.abs(offset) >= 0.01),
        'the diff to glide after the scrollbar',
      );
      await waitFor(async () => {
        const { lines, offset } = await place();
        return (
          Math.abs(lines - Math.round(lines)) < 0.01 && Math.abs(offset) < 0.01
        );
      }, 'the diff to come to rest on a line');
    } finally {
      await sharedRepository.git('checkout', '-q', 'HEAD', '--', 'long.txt');
    }
    await sharedPage.locator('.commit.working-tree.empty').waitFor();
  });

  test('scrolls the diff on the wheel over its scrollbar as over its lines, rather than the column around it', async () => {
    await sharedPage.locator('.commit', { hasText: 'first' }).click();
    await sharedPage.locator('.row.file', { hasText: 'long.txt' }).click();
    await firstLineShown();
    await wheelsDiffOverItsBar(sharedPage);
  });

  test('keeps the scrollbar of a diff, with the marks on its track between its buttons, against the line its column draws on the right, and the scrollbar under its lines against the line at the bottom, or the status line under it, the two ending at the square between them', async () => {
    await sharedPage.locator('.commit', { hasText: 'first' }).click();
    await sharedPage.locator('.row.file', { hasText: 'long.txt' }).click();
    await firstLineShown();
    const down = (await barOf(sharedPage, diffRows, 'vertical')).box;
    const across = (await barOf(sharedPage, diffBarBelow, 'horizontal')).box;
    const { start, end } = await barParts(sharedPage, down, 'vertical');
    const inside = await sharedPage
      .locator('.diff-view > .scrollbar-marks')
      .evaluate((layer) => {
        const column = layer.closest('.column');
        if (column === null) {
          return undefined;
        }
        const line = parseFloat(
          getComputedStyle(column).getPropertyValue('--column-line'),
        );
        const edge = column.getBoundingClientRect();
        const frame = getComputedStyle(column, '::after');
        const status = column.querySelector('.column-status');
        const { left, top, right, bottom } = layer.getBoundingClientRect();
        return {
          right: edge.right - parseFloat(frame.right) - line,
          bottom:
            status?.getBoundingClientRect().top ??
            edge.bottom - parseFloat(frame.bottom) - line,
          marks: { left, top, right, bottom },
        };
      });
    assert.ok(inside, 'the diff is in no column');

    assert.deepStrictEqual(
      {
        right: whole(inside.right - (down.left + down.width)),
        bottom: whole(inside.bottom - (across.top + across.height)),
        meeting: [
          whole(across.top - (down.top + down.height)),
          whole(down.left - (across.left + across.width)),
        ],
        marks: [
          whole(inside.marks.left - down.left),
          whole(inside.marks.right - (down.left + down.width)),
          whole(inside.marks.top - (start.top + start.height)),
          whole(inside.marks.bottom - end.top),
        ],
      },
      { right: 0, bottom: 0, meeting: [0, 0], marks: [0, 0, 0, 0] },
      JSON.stringify({ down, across, start, end, inside }),
    );
  });

  test('never scrolls the column around the diff, which has its own scrollbar, even when the diff sticks out of it by a few pixels', async () => {
    await sharedPage.locator('.commit', { hasText: 'first' }).click();
    await sharedPage.locator('.row.file', { hasText: 'long.txt' }).click();
    await firstLineShown();
    const taller = await sharedPage.addStyleTag({
      content: '.diff-view { margin-bottom: 4px; }',
    });
    try {
      const sticksOut = await sharedPage
        .locator(diffColumn)
        .evaluate((element) => element.scrollHeight - element.clientHeight);
      assert.ok(sticksOut >= 4, `the diff sticks out by ${sticksOut} pixels`);
      const around = (await barOf(sharedPage, diffColumn, 'vertical')).box;
      assert.strictEqual(whole(around.width), 0);
      await wheelsDiffOverItsBar(sharedPage);
    } finally {
      await taller.evaluate((element) =>
        element.parentNode?.removeChild(element),
      );
    }
  });

  test('draws the rows of where its scrollbar is dragged to in the frame it scrolls there, rather than once the scroll event of the frame after comes, which left every other frame without new rows', async () => {
    await sharedPage.locator('.commit', { hasText: 'first' }).click();
    await sharedPage.locator('.row.file', { hasText: 'long.txt' }).click();
    await firstLineShown();
    await sharedPage.locator(diffRows).evaluate((element) => {
      element.scrollTop = 0;
    });
    await sharedPage.evaluate(() => {
      const list = document.querySelector('.diff-view .virtual-rows');
      const seen: boolean[] = [];
      Reflect.set(window, 'coveredMoves', seen);
      let last = list?.scrollTop;
      const check = () => {
        if (!list || list.scrollTop === last) {
          return;
        }
        last = list.scrollTop;
        const rows = [
          ...list.querySelectorAll<HTMLElement>('.diff-cells'),
        ].flatMap((cells) => cells.seenRows?.() ?? []);
        const end = rows.find((row) => row.text.includes('line199 '));
        const top = Math.min(
          list.getBoundingClientRect().top + list.clientHeight - 2,
          end ? end.top + end.height - 2 : Infinity,
        );
        seen.push(
          rows.some((row) => row.top <= top && top < row.top + row.height),
        );
      };
      window.addEventListener('scroll', check, { capture: true });
    });
    const { box } = await barOf(sharedPage, diffRows, 'vertical');
    const { thumb, end } = await barParts(sharedPage, box, 'vertical');
    assert.ok(thumb, 'the scrollbar of the diff has no thumb');
    const x = thumb.left + thumb.width / 2;
    const y = thumb.top + thumb.height / 2;
    const reach = end.top - thumb.height / 2 - y;
    await sharedPage.mouse.move(x, y);
    await sharedPage.mouse.down();
    for (let step = 1; step <= 5; step++) {
      await sharedPage.mouse.move(x, y + reach * (step / 5));
    }
    await sharedPage.mouse.up();

    const covered = await sharedPage.evaluate(() =>
      Reflect.get(window, 'coveredMoves'),
    );
    assert.ok(
      Array.isArray(covered) && covered.length > 2,
      JSON.stringify(covered),
    );
    assert.ok(covered.every(Boolean), JSON.stringify(covered));
  });
});

async function wheelsDiffOverItsBar(page: Page): Promise<void> {
  const list = page.locator(diffRows);
  await list.evaluate((element) => {
    element.scrollTop = 0;
  });
  const { box } = await barOf(page, diffRows, 'vertical');
  await barParts(page, box, 'vertical');
  await page.mouse.wheel(0, 100);
  const scrolled = () =>
    list.evaluate((element) => {
      const line =
        element.querySelector<HTMLElement>('.diff-cells')?.seenRows?.()[0]
          ?.height ?? 1;
      return {
        lines: element.scrollTop / line,
        column: element.closest('.column-body')?.scrollTop ?? 0,
      };
    });
  await waitFor(
    async () =>
      Math.abs(
        (await scrolled()).lines - defaultSettings().scrolling.wheelRows,
      ) < 0.01,
    'the diff to scroll the lines of a notch',
  );
  assert.strictEqual((await scrolled()).column, 0);
}

async function settledTop(list: Locator): Promise<number | undefined> {
  return list.evaluate(
    (element) =>
      new Promise<number | undefined>((settled) => {
        const top = element.scrollTop;
        setTimeout(
          () => settled(element.scrollTop === top ? top : undefined),
          250,
        );
      }),
  );
}

function rowAtTop(list: Locator): Promise<boolean> {
  return list.evaluate((element) => {
    const top = element.getBoundingClientRect().top + element.clientTop;
    return [...element.querySelectorAll('.virtual-row')].some(
      (row) => Math.abs(row.getBoundingClientRect().top - top) < 0.5,
    );
  });
}

async function scrollsOnWheelOver(
  page: Page,
  list: Locator,
  band: Locator,
): Promise<void> {
  await list.evaluate((element) => {
    element.scrollTop = 200;
  });
  const box = await band.boundingBox();
  assert.ok(box, 'nothing stuck atop the list');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 100);
  await waitFor(
    async () => (await list.evaluate((element) => element.scrollTop)) > 200,
    'the list to scroll',
  );
}

suite('App with lists longer than their columns', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('long-lists');
    const profile = path.join(folder, 'profile');
    const repository = await tempRepository(path.join(folder, 'repo'));
    for (let index = 0; index < 60; index++) {
      await repository.git('commit', '--allow-empty', '-m', `step ${index}`);
    }
    await repository.commit('first', {
      ...Object.fromEntries(
        Array.from({ length: 60 }, (_, index) => [
          `src/file${index}.txt`,
          `${index}\n`,
        ]),
      ),
      'long.txt': `${longLines.join('\n')}\n`,
    });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify(savedTabs([repository.root], repository.root)),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify(baseSettings),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'file0.txt' }).waitFor();
    await page
      .locator('.column')
      .nth(1)
      .locator('.virtual-rows')
      .evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    await untilDiffLine(
      page,
      ({ text }) => text === firstLongLine,
      'the first long line',
    );
  });

  afterAll(async () => {
    await app?.close();
    removeFolder(folder);
  });

  test('scrolls on the wheel over the folders pinned atop the files and the file header stuck atop the diff, which stays in place sideways, the scrollbar of the files beside the folders pinned rather than under them, taking the presses of a pointer that came over them', async () => {
    const files = page.locator(fileRows);
    const pinned = page.locator('.pinned-rows');
    await scrollsOnWheelOver(page, files, pinned);
    await pinned.hover();
    const cover = page.locator('.scrollbar-cover.vertical.shown');
    await cover.waitFor();
    const { box } = await barOf(page, fileRows, 'vertical');
    const band = await pinned.boundingBox();
    const taking = await cover.boundingBox();
    assert.ok(band && taking, 'the pinned folders or the scrollbar has no box');
    assert.deepStrictEqual(
      {
        beside: whole(box.left - (band.x + band.width)),
        taking: [
          whole(taking.x - box.left),
          whole(taking.y - box.top),
          whole(taking.width - box.width),
          whole(taking.height - box.height),
        ],
      },
      { beside: 0, taking: [0, 0, 0, 0] },
      JSON.stringify({ box, band, taking }),
    );

    const diff = page.locator('.diff-view .virtual-rows');
    const stuck = page.locator('.diff-stuck-header');
    await scrollsOnWheelOver(page, diff, stuck);
    const across = async () => (await diffRowsSeen(page))[0]?.scrolled;
    const rest = await across();
    await diff.hover();
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 100);
    await page.keyboard.up('Shift');
    await waitFor(
      async () => (await across()) !== rest,
      'the diff to scroll sideways',
    );
    const header = await stuck.locator('.file-header').boundingBox();
    const view = await page.locator('.diff-view').boundingBox();
    assert.ok(header && view, 'the header or the diff has no box');
    assert.strictEqual(header.x, view.x);
  });

  test('scrolls the commits and the files on the wheel by whole rows, as the diff and the commander do, each notch coming to rest with a commit or a row starting at the top, down and up alike', async () => {
    const commits = page.locator('.virtual-rows.list');
    const files = page.locator('.column').nth(1).locator('.virtual-rows');
    for (const list of [commits, files]) {
      await list.evaluate((element) => {
        element.scrollTop = 0;
      });
      const box = await list.boundingBox();
      assert.ok(box, 'the list has no box');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (const delta of [100, 100, -100]) {
        const before = await list.evaluate((element) => element.scrollTop);
        await page.mouse.wheel(0, delta);
        await waitFor(
          async () =>
            (await settledTop(list)) !== before && (await rowAtTop(list)),
          `a row at the top of the list after the wheel turned by ${delta}`,
        );
      }
    }
  });

  test('keeps the layer taking the presses of the scrollbar the pointer rests on where it is while another list scrolls, as the diff on the keys', async () => {
    const { box } = await barOf(page, fileRows, 'vertical');
    const rested = await barParts(page, box, 'vertical');
    const cover = page.locator('.scrollbar-cover.vertical');
    const shown = await cover.boundingBox();
    const diff = page.locator(diffRows);
    const top = await diff.evaluate((element) => element.scrollTop);
    await diff.focus();
    await page.keyboard.press('PageDown');
    await waitFor(
      async () => (await diff.evaluate((element) => element.scrollTop)) > top,
      'the diff to scroll',
    );
    await page.evaluate(
      () =>
        new Promise((drawn) =>
          requestAnimationFrame(() => requestAnimationFrame(drawn)),
        ),
    );
    assert.ok(await cover.evaluate((element) => element.matches('.shown')));
    assert.deepStrictEqual(await cover.boundingBox(), shown);
    assert.deepStrictEqual(
      await cover
        .locator('.scrollbar-thumb')
        .evaluate((thumb) => thumb.getBoundingClientRect().top),
      rested.thumb?.top,
    );
  });
});
