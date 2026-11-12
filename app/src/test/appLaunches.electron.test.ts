import * as assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Locator, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../shared/strings';
import {
  appArguments,
  appFolder,
  baseSettings,
  closeOrKill,
  firstLongLine,
  launchApp,
  longLines,
  savedTabs,
  waitForFocus,
  within,
} from './appFixtures';
import { waitFor } from './fixtures';
import { removeFolder, tempFolder, tempRepository } from './repositories';

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
    await page.locator('.diff-line', { hasText: firstLongLine }).waitFor();
  });

  afterAll(async () => {
    await app?.close();
    removeFolder(folder);
  });

  test('scrolls on the wheel over the folders pinned atop the files and the file header stuck atop the diff, which stays in place sideways, showing the scrollbar of the files over them', async () => {
    const files = page.locator('.column').nth(1).locator('.virtual-rows');
    const pinned = page.locator('.pinned-rows');
    await scrollsOnWheelOver(page, files, pinned);
    await pinned.hover();
    assert.strictEqual(
      await page.locator('.overlay-scrollbar.vertical.shown').count(),
      1,
    );

    const diff = page.locator('.diff-view .virtual-rows');
    const stuck = page.locator('.diff-stuck-header');
    await scrollsOnWheelOver(page, diff, stuck);
    await diff.evaluate((element) => {
      element.scrollLeft = 300;
    });
    await waitFor(
      async () => (await diff.evaluate((element) => element.scrollLeft)) > 0,
      'the diff to scroll sideways',
    );
    const header = await stuck.locator('.file-header').boundingBox();
    const view = await page.locator('.diff-view').boundingBox();
    assert.ok(header && view, 'the header or the diff has no box');
    assert.strictEqual(header.x, view.x);
  });

  test('keeps the scrollbar the pointer rests on where it is while another list scrolls, as the diff on the keys', async () => {
    const bar = page.locator('.overlay-scrollbar.vertical');
    await page.locator('.column').nth(1).locator('.virtual-rows').hover();
    await bar.hover();
    const shown = await bar.boundingBox();
    const diff = page.locator('.diff-view .virtual-rows');
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
    assert.ok(await bar.evaluate((element) => element.matches('.shown')));
    assert.deepStrictEqual(await bar.boundingBox(), shown);
  });
});

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

async function thumbAgainstLine(
  page: Page,
  list: Locator,
  edge: 'right' | 'bottom',
  bar = page.locator('.overlay-scrollbar.vertical.shown'),
): Promise<{
  readonly reached: string;
  readonly before: string;
  readonly line: string;
}> {
  await page.mouse.move(2, 2);
  await bar.waitFor({ state: 'detached' });
  await page.waitForTimeout(400);
  const bare = await page.screenshot();
  const box = await list.boundingBox();
  assert.ok(box, 'the list has no box');
  await page.mouse.move(
    box.x + 20,
    edge === 'right' ? box.y + box.height - 10 : box.y + 10,
  );
  await bar.waitFor();
  await page.waitForTimeout(400);
  const shown = await page.screenshot();
  const thumb = await bar.boundingBox();
  const column = await list.evaluate((element) => {
    const { right, bottom } = element
      .closest('.column')
      ?.getBoundingClientRect() ?? { right: 0, bottom: 0 };
    return { right, bottom };
  });
  assert.ok(thumb, 'the thumb has no box');
  const points: [number, number][] =
    edge === 'right'
      ? Array.from(
          {
            length:
              Math.round(column.right * scale) -
              Math.round((thumb.x + thumb.width / 2) * scale),
          },
          (_, index) => [
            Math.round((thumb.x + thumb.width / 2) * scale) + index,
            Math.round((thumb.y + 8) * scale),
          ],
        )
      : Array.from(
          {
            length:
              Math.round(column.bottom * scale) -
              Math.round((thumb.y + thumb.height / 2) * scale),
          },
          (_, index) => [
            Math.round((thumb.x + 4) * scale),
            Math.round((thumb.y + thumb.height / 2) * scale) + index,
          ],
        );
  const [without, withThumb] = await Promise.all([
    pixelsOf(page, bare, points),
    pixelsOf(page, shown, points),
  ]);
  const reached = without.findIndex(
    (pixel, index) => pixel === withThumb[index],
  );
  return {
    reached: without[reached],
    before: without[reached - 1],
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
      before: [`--force-device-scale-factor=${scale}`],
    });
    page = await app.firstWindow();
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'file0.txt' }).waitFor();
  });

  afterAll(async () => {
    await app?.close();
    removeFolder(folder);
  });

  test('runs the thumb of the files over every pixel up to the line of their column, those the line fills in part too, and over none the line fills whole, wherever the column falls between pixels', async () => {
    const columns = page.locator('.columns > .column');
    for (const [list, edge] of [
      [columns.nth(1).locator('.virtual-rows'), 'right'],
      [columns.nth(1).locator('.virtual-rows'), 'bottom'],
    ] as const) {
      if (edge === 'bottom') {
        await list.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
      }
      const met = await thumbAgainstLine(page, list, edge);
      assert.strictEqual(
        met.reached,
        met.line,
        `${edge} ${JSON.stringify(met)}`,
      );
      assert.notStrictEqual(
        met.before,
        met.line,
        `${edge} ${JSON.stringify(met)}`,
      );
    }
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

  test('runs the thumb of a file viewed at its end over every pixel up to the bottom line of its column, and over none the line fills', async () => {
    await page.locator('.tabs [role="tab"]').nth(1).click();
    const side = page.locator('.commander-pane').nth(1);
    await side.locator('.commander-row', { hasText: 'long' }).click();
    await page.keyboard.press('F3');
    await page.locator('.viewer-rows .viewer-row').first().waitFor();
    await page.keyboard.press('End');
    await waitFor(
      async () =>
        (await page
          .locator('.viewer-row', { hasText: `line${longLines.length - 1} ` })
          .count()) > 0,
      'the last line of the file',
    );
    const met = await thumbAgainstLine(
      page,
      page.locator('.viewer-body'),
      'bottom',
      page.locator('.viewer-thumb.shown'),
    );
    assert.strictEqual(met.reached, met.line, JSON.stringify(met));
    assert.notStrictEqual(met.before, met.line, JSON.stringify(met));
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
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
});

const dark = (page: Page) =>
  page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);

const turned = (page: Page, toDark: boolean) =>
  dark(page).then(
    (isDark) => isDark === toDark,
    () => false,
  );

suite('App with a theme', () => {
  test('follows the system by default, turns to the other theme at once when the settings file is saved with it, and starts in it from then on', async () => {
    const folder = tempFolder('themes');
    const profile = path.join(folder, 'profile');
    fs.mkdirSync(profile, { recursive: true });
    const settingsFile = path.join(profile, 'settings.user.json');
    fs.writeFileSync(settingsFile, JSON.stringify(baseSettings));
    let app = await launchApp(profile);
    try {
      let page = await app.firstWindow();
      await page.emulateMedia({ colorScheme: null });
      await page.locator('.tabs > .menu-button > button').waitFor();
      const [source, systemDark] = await app.evaluate(({ nativeTheme }) => [
        nativeTheme.themeSource,
        nativeTheme.shouldUseDarkColors,
      ]);
      assert.deepStrictEqual(
        [source, await dark(page)],
        ['system', systemDark],
      );
      fs.writeFileSync(
        settingsFile,
        JSON.stringify({
          ...baseSettings,
          theme: systemDark ? 'light' : 'dark',
        }),
      );
      await waitFor(
        () => turned(page, !systemDark),
        'the window to turn to the other theme',
      );
      await closeOrKill(app);
      app = await launchApp(profile);
      page = await app.firstWindow();
      await page.emulateMedia({ colorScheme: null });
      await page.locator('.tabs > .menu-button > button').waitFor();
      assert.strictEqual(await dark(page), !systemDark);
    } finally {
      await closeOrKill(app);
      removeFolder(folder);
    }
  });
});

const syntaxWorkers = (page: Page) =>
  page.workers().filter((worker) => worker.url().endsWith('/syntaxWorker.js'))
    .length;

suite('App with a git tab behind a commander tab', () => {
  test('starts the worker coloring code once a git tab or a file viewed is shown, before there is code to color, so its highlighter is made while the diff or file is read, but not for the commander alone', async () => {
    const folder = tempFolder('syntax-worker');
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first', { 'notes.unknown': 'plain\n' });
    const launched = async (name: string) => {
      const profile = path.join(folder, name);
      fs.mkdirSync(profile, { recursive: true });
      fs.writeFileSync(
        path.join(profile, 'state.json'),
        JSON.stringify({
          tabs: [
            { id: '1', tool: 'commander', root: repository.root },
            { id: '2', tool: 'git', root: repository.root },
          ],
          activeTab: '1',
        }),
      );
      const app = await launchApp(profile);
      const page = await app.firstWindow();
      const notes = page
        .locator('.commander-pane')
        .nth(1)
        .locator('.commander-row', { hasText: 'notes' });
      await notes.waitFor();
      assert.strictEqual(syntaxWorkers(page), 0);
      return { app, page, notes };
    };
    try {
      const git = await launched('git');
      try {
        await git.page.locator('.tabs .tab').nth(1).click();
        await git.page.locator('.commit', { hasText: 'first' }).waitFor();
        await waitFor(() => syntaxWorkers(git.page) === 1, 'the syntax worker');
      } finally {
        await closeOrKill(git.app);
      }
      const viewer = await launched('viewer');
      try {
        await viewer.notes.click();
        await viewer.page.keyboard.press('F3');
        await viewer.page.locator('.viewer').waitFor();
        await waitFor(
          () => syntaxWorkers(viewer.page) === 1,
          'the syntax worker',
        );
      } finally {
        await closeOrKill(viewer.app);
      }
    } finally {
      removeFolder(folder);
    }
  });
});

suite('App with several tabs', () => {
  test('moves a tab dragged past the middle of the next one while it is still dragged, keeping it under the pointer, opening it, and keeps that order once dropped', async () => {
    const folder = tempFolder('dragging-tabs');
    const profile = path.join(folder, 'profile');
    const roots: string[] = [];
    for (const name of ['first', 'second', 'third']) {
      const repository = await tempRepository(path.join(folder, name));
      await repository.commit(name);
      roots.push(repository.root);
    }
    fs.mkdirSync(profile, { recursive: true });
    const state = path.join(profile, 'state.json');
    fs.writeFileSync(state, JSON.stringify(savedTabs(roots, roots[1])));
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ tools: { git: { autoFetch: false } } }),
    );
    const app = await launchApp(profile);
    try {
      const page = await app.firstWindow();
      await page.locator('.commit', { hasText: 'second' }).waitFor();
      const names = () =>
        page.locator('.tabs .tab .tab-name').allTextContents();
      const dragged = page.locator('.tabs .tab', { hasText: 'first' });
      const start = await dragged.boundingBox();
      const next = await page
        .locator('.tabs .tab', { hasText: 'second' })
        .boundingBox();
      assert.ok(start && next);
      const pitch = next.x - start.x;
      const grab = 20;
      const y = start.y + start.height / 2;
      await page.mouse.move(start.x + grab, y);
      await page.mouse.down();
      await page.mouse.move(start.x + grab + pitch / 2 - 8, y, { steps: 8 });
      assert.deepStrictEqual(await names(), ['first', 'second', 'third']);
      const pointer = start.x + grab + pitch / 2 + 8;
      await page.mouse.move(pointer, y, { steps: 4 });
      assert.deepStrictEqual(await names(), ['second', 'first', 'third']);
      const held = await dragged.boundingBox();
      assert.ok(held);
      assert.ok(Math.abs(held.x - (pointer - grab)) < 1, String(held.x));
      await page.locator('.commit', { hasText: 'first' }).waitFor();
      await page.mouse.up();
      assert.deepStrictEqual(await names(), ['second', 'first', 'third']);
      await waitFor(() => {
        const saved: unknown = JSON.parse(fs.readFileSync(state, 'utf8'));
        const tabs: unknown = Reflect.get(Object(saved), 'tabs');
        return (
          Array.isArray(tabs) &&
          JSON.stringify(
            tabs.map((tab: unknown) => Reflect.get(Object(tab), 'root')),
          ) === JSON.stringify([roots[1], roots[0], roots[2]])
        );
      }, 'the order to be saved');
      assert.match((await dragged.getAttribute('class')) ?? '', /\bactive\b/);
    } finally {
      await closeOrKill(app);
      removeFolder(folder);
    }
  });
});

suite('App with a row of tabs', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('row-of-tabs');
    const profile = path.join(folder, 'profile');
    const roots = Array.from({ length: 12 }, (_, index) => {
      const root = path.join(folder, `folder${index}`);
      fs.mkdirSync(root, { recursive: true });
      return root;
    });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: roots.map((root, index) => ({
          id: String(index + 1),
          tool: 'commander',
          root,
        })),
        activeTab: '1',
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await page.locator('.tabs [role="tab"]').nth(11).waitFor();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  async function openedTab(): Promise<{
    strips: string[];
    strip: { left: number; right: number };
    tab: { left: number; right: number };
  }> {
    await page.evaluate(() => {
      const strip = document.querySelector('.tab-strip');
      const strips: string[] = [];
      Reflect.set(window, 'strips', strips);
      const record = () => {
        strips.push(strip?.className ?? '');
        if (strips.length < 60) {
          requestAnimationFrame(record);
        }
      };
      requestAnimationFrame(record);
    });
    await page.locator('.tab-add').click();
    await page
      .locator('.menu-item', { hasText: strings.tools.commander })
      .click();
    await waitFor(
      () =>
        page.evaluate(() => {
          const strips: unknown = Reflect.get(window, 'strips');
          return (
            Array.isArray(strips) &&
            strips.length >= 60 &&
            document.querySelector('.tab.opening') === null
          );
        }),
      'the opened tab to grow',
    );
    return page.evaluate(() => {
      const strip = document.querySelector('.tab-strip');
      const tab = document.querySelector('.tabs .tab.active');
      const inside = strip?.getBoundingClientRect();
      const padding = strip
        ? parseFloat(getComputedStyle(strip).paddingLeft)
        : 0;
      const box = tab?.getBoundingClientRect();
      const strips: unknown = Reflect.get(window, 'strips');
      return {
        strips: Array.isArray(strips) ? strips.map(String) : [],
        strip: {
          left: (inside?.left ?? 0) + padding,
          right: (inside?.right ?? 0) - padding,
        },
        tab: { left: box?.left ?? 0, right: box?.right ?? 0 },
      };
    });
  }

  test('grows a tab opened into a full row without the row taking the tabs for too many and back, which shifted them all while it grew', async () => {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .toSorted((a, b) => a.id - b.id)[0]
        ?.setContentSize(1000, 600);
    });
    const { strips } = await openedTab();
    assert.deepStrictEqual([...new Set(strips)], ['tab-strip']);
  });

  test('keeps a tab opened into a row of too many in view as it grows, rather than only where it started, at no width', async () => {
    const overflowing = page.locator('.tab-strip.overflowing');
    for (let opened = 0; (await overflowing.count()) === 0; opened++) {
      assert.ok(opened < 40, 'the row to take the tabs for too many');
      await openedTab();
    }
    await page.locator('.tabs [role="tab"]').first().click();
    const { strip, tab } = await openedTab();
    assert.ok(
      tab.left >= strip.left - 1 && tab.right <= strip.right + 1,
      JSON.stringify({ strip, tab }),
    );
  });
});

suite('App started from a terminal', () => {
  test('asks which tool opens the folder it is started with, opening its repository on Enter, then that of a folder another start hands it, showing each rather than the tab left active', async () => {
    const folder = tempFolder('command-line');
    const profile = path.join(folder, 'profile');
    const roots: string[] = [];
    for (const name of ['first', 'second', 'third']) {
      const repository = await tempRepository(path.join(folder, name));
      await repository.commit(name);
      roots.push(repository.root);
    }
    const [first, second, third] = roots;
    const inner = path.join(second, 'inner');
    fs.mkdirSync(inner);
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify(savedTabs([first], first)),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ tools: { git: { autoFetch: false } } }),
    );
    const app = await launchApp(profile, { after: ['--', inner] });
    try {
      const page = await app.firstWindow();
      const names = () =>
        page.locator('.tabs .tab .tab-name').allTextContents();
      const openWithGit = async () => {
        const popup = page.locator('.open-with-popup');
        await popup.waitFor();
        await waitForFocus(
          popup.locator('.open-with-tool', { hasText: strings.tools.git }),
          'Git',
        );
        await page.keyboard.press('Enter');
        await popup.waitFor({ state: 'detached' });
      };
      await openWithGit();
      await page.locator('.commit', { hasText: 'second' }).waitFor();
      assert.deepStrictEqual(await names(), ['first', 'second']);
      const electron = await app.evaluate(() => process.execPath);
      const sandbox = process.platform === 'linux' ? ['--no-sandbox'] : [];
      const handedOff = spawnSync(
        electron,
        [...sandbox, ...appArguments(profile, '--', third)],
        { cwd: appFolder, timeout: 30_000 },
      );
      assert.strictEqual(handedOff.status, 0, String(handedOff.stderr));
      await openWithGit();
      await page.locator('.commit', { hasText: 'third' }).waitFor();
      assert.deepStrictEqual(await names(), ['first', 'second', 'third']);
      assert.match(
        (await page
          .locator('.tabs .tab', { hasText: 'third' })
          .getAttribute('class')) ?? '',
        /\bactive\b/,
      );
    } finally {
      await closeOrKill(app);
      removeFolder(folder);
    }
  });
});

suite('App whose page is gone', () => {
  test('loads the page again once its process is gone, such as killed or out of memory, saying so in the log, as the window stayed blank', async () => {
    const folder = tempFolder('page-gone');
    const profile = path.join(folder, 'profile');
    const log = path.join(profile, 'logs', 'Fastforward.log');
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify(savedTabs([repository.root], repository.root)),
    );
    const app = await launchApp(profile);
    try {
      const page = await app.firstWindow();
      await page.locator('.commit', { hasText: 'first' }).waitFor();
      const killed = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .toSorted((a, b) => a.id - b.id)[0]
          .webContents.getOSProcessId(),
      );
      const gone = await within(
        app.evaluate(({ BrowserWindow }, pid) => {
          const contents = BrowserWindow.getAllWindows().toSorted(
            (a, b) => a.id - b.id,
          )[0].webContents;
          const went = new Promise<{ reason: string; exitCode: number }>(
            (resolve) =>
              contents.once('render-process-gone', (_event, details) =>
                resolve(details),
              ),
          );
          process.kill(pid, 'SIGKILL');
          return went;
        }, killed),
        'the page to go',
        30_000,
      ).catch(async (error: unknown) => {
        const left = await app.evaluate(({ BrowserWindow }, pid) => {
          let running = true;
          try {
            process.kill(pid, 0);
          } catch {
            running = false;
          }
          return {
            running,
            crashed: BrowserWindow.getAllWindows()
              .toSorted((a, b) => a.id - b.id)[0]
              .webContents.isCrashed(),
          };
        }, killed);
        throw new Error(
          `The page did not go: its process ${killed} ${left.running ? 'still runs' : 'is gone'}, and Electron ${left.crashed ? 'sees' : 'does not see'} it crashed`,
          { cause: error },
        );
      });
      await waitFor(
        () =>
          fs
            .readFileSync(log, 'utf8')
            .includes(strings.log.pageGone(gone.reason, gone.exitCode)),
        'the page going to be logged',
      );
      const windowShowsTheHistoryAgain = () =>
        app.evaluate(async ({ BrowserWindow }) => {
          const contents = BrowserWindow.getAllWindows().toSorted(
            (a, b) => a.id - b.id,
          )[0].webContents;
          if (contents.isCrashed() || contents.isLoading()) {
            return false;
          }
          const shown: unknown = await Promise.race([
            contents.executeJavaScript(
              "[...document.querySelectorAll('.commit')].some((row) => row.textContent.includes('first'))",
            ),
            new Promise((resolve) => setTimeout(() => resolve(false), 1000)),
          ]);
          return shown === true;
        });
      await waitFor(
        windowShowsTheHistoryAgain,
        'the page to show the history again',
      );
    } finally {
      await closeOrKill(app);
      removeFolder(folder);
    }
  });
});

const windowsNotedIn = (file: string) =>
  [
    "const { app } = require('electron');",
    "const { appendFileSync } = require('node:fs');",
    `const note = (what) => appendFileSync(${JSON.stringify(file)}, what + '\\n');`,
    "app.on('browser-window-created', (_event, window) => {",
    "  note(window.isVisible() ? 'shown' : 'created');",
    "  window.on('show', () => note('shown'));",
    '});',
  ].join('\n');

const toolsGtkRunsToLoadIcons = ['bwrap'];

function linkFromPath(names: readonly string[], folder: string): void {
  const folders = (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean);
  for (const name of names) {
    const found = folders
      .map((inside) => path.join(inside, name))
      .find((file) => fs.existsSync(file));
    if (found !== undefined) {
      fs.symlinkSync(found, path.join(folder, name));
    }
  }
}

suite('App without git', () => {
  test('says it needs git, showing no window, whether its alert keeps it running or it quits by itself, with git kept off its PATH but the tools GTK runs to load the icon of the alert left on it, as Ubuntu 26.04 aborts without them', async () => {
    const folder = tempFolder('no-git');
    const profile = path.join(folder, 'profile');
    const log = path.join(profile, 'logs', 'Fastforward.log');
    const windows = path.join(folder, 'windows.txt');
    const noting = path.join(folder, 'noteWindows.cjs');
    fs.writeFileSync(noting, windowsNotedIn(windows));
    linkFromPath(toolsGtkRunsToLoadIcons, folder);
    const app = await launchApp(profile, {
      before: ['-r', noting],
      env: {
        ...process.env,
        PATH: folder,
        Path: folder,
        SHELL: path.join(folder, 'no-shell'),
        ELECTRON_ENABLE_STACK_DUMPING: 'true',
      },
    });
    const child = app.process();
    const exited = once(child, 'exit');
    let printed = '';
    for (const output of [child.stdout, child.stderr]) {
      output?.on('data', (chunk: Buffer) => {
        printed += chunk.toString();
      });
    }
    try {
      await waitFor(() => {
        try {
          return fs.readFileSync(log, 'utf8').includes('Install git');
        } catch {
          return false;
        }
      }, 'the missing git to be logged');
      const gitAlertHoldsTheMainProcess = process.platform === 'darwin';
      if (!gitAlertHoldsTheMainProcess) {
        await Promise.race([
          app.firstWindow().then(async (page) => {
            await page.waitForLoadState('load');
            await new Promise((resolve) => setTimeout(resolve, 500));
          }),
          exited,
        ]).catch(async (error: unknown) => {
          await within(exited, 'the app to quit').catch(() => {
            throw error;
          });
        });
      }
      assert.strictEqual(fs.readFileSync(windows, 'utf8'), 'created\n');
      if (child.exitCode !== null || child.signalCode !== null) {
        assert.deepStrictEqual(
          [child.exitCode, child.signalCode],
          [0, null],
          `The app quit with ${String(child.exitCode ?? child.signalCode)}, printing:\n${printed}`,
        );
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await exited;
      }
      await app.close();
      removeFolder(folder);
    }
  });
});
