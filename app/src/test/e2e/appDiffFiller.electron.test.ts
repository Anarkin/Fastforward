import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { closeOrKill, launchApp } from './appFixtures';
import { waitFor } from '../support/fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
} from '../support/repositories';

interface Area {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface Areas {
  readonly filler: Area;
  readonly numbers: Area;
}

interface Capture {
  readonly filler: Buffer;
  readonly numbers: Buffer;
}

const ratios = [1, 1.25, 1.5, 1.75, 2];

const percent = (ratio: number) => `${ratio * 100}%`;

function changed(before: Buffer, after: Buffer): number {
  let count = 0;
  for (let at = 0; at < before.length; at += 4) {
    if (
      before[at] !== after[at] ||
      before[at + 1] !== after[at + 1] ||
      before[at + 2] !== after[at + 2]
    ) {
      count++;
    }
  }
  return count / (before.length / 4);
}

function commonestOf(pixels: Buffer): { color: string; share: number } {
  const colors = new Map<number, number>();
  for (let at = 0; at < pixels.length; at += 4) {
    const color = pixels.readUInt32LE(at) & 0xffffff;
    colors.set(color, (colors.get(color) ?? 0) + 1);
  }
  const [color, count] = [...colors].reduce(
    (most, entry) => (entry[1] > most[1] ? entry : most),
    [0, 0],
  );
  return {
    color: color.toString(16).padStart(6, '0'),
    share: count / Math.max(1, pixels.length / 4),
  };
}

function striped(pixels: Buffer): boolean {
  return pixels.length > 0 && commonestOf(pixels).share < 0.95;
}

suite('App diff filler', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('app-diff-filler');
    const repository = await tempRepository(path.join(folder, 'repo'));
    const lines = Array.from({ length: 20 }, (_, index) => `line ${index}`);
    const added = Array.from({ length: 300 }, (_, index) => `added ${index}`);
    await repository.commit('first', { 'a.txt': `${lines.join('\n')}\n` });
    await repository.commit('second', {
      'a.txt': `${[...lines.slice(0, 10), ...added, ...lines.slice(10)].join('\n')}\n`,
    });
    const profile = path.join(folder, 'profile');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [{ id: '1', tool: 'git', root: repository.root }],
        activeTab: '1',
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await page.locator('.commit', { hasText: 'second' }).click();
    await page.locator('.split-side.filler').first().waitFor();
    await page.keyboard.press('c');
    await page.locator('.columns.commits-hidden').waitFor();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  async function zoomTo(ratio: number): Promise<void> {
    await app.evaluate(({ BrowserWindow, screen }, wanted) => {
      const window = BrowserWindow.getAllWindows().toSorted(
        (a, b) => a.id - b.id,
      )[0];
      const display = screen.getDisplayMatching(
        window?.getBounds() ?? { x: 0, y: 0, width: 1, height: 1 },
      );
      window?.webContents.setZoomFactor(wanted / display.scaleFactor);
    }, ratio);
    await waitFor(
      () =>
        page.evaluate(
          (wanted) =>
            devicePixelRatio === wanted &&
            Math.abs(
              parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue(
                  '--device-pixel',
                ),
              ) -
                1 / wanted,
            ) < 1e-6,
          ratio,
        ),
      `the window at ${percent(ratio)}`,
    );
  }

  async function scrollToLine(line: number): Promise<void> {
    await waitFor(async () => {
      const scrolled = await page.evaluate(async (wanted) => {
        const list = document.querySelector('.diff-view .virtual-rows');
        const filler = document.querySelector('.split-side.filler');
        const height = filler?.getBoundingClientRect().height ?? 0;
        if (list) {
          list.scrollTop = wanted * height;
        }
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        return (list?.scrollTop ?? 0) / height;
      }, line);
      return Math.abs(scrolled - line) < 0.01;
    }, `the diff to stay scrolled to line ${line}`);
  }

  function areasOf(): Promise<Areas> {
    return page.evaluate(() => {
      const view = document
        .querySelector('.diff-view .virtual-rows')
        ?.getBoundingClientRect();
      const filler = document.querySelector('.split-side.filler');
      const side = filler?.getBoundingClientRect();
      const numbers = filler?.nextElementSibling
        ?.querySelector('.number')
        ?.getBoundingClientRect();
      const line = side?.height ?? 0;
      const top = Math.ceil(((view?.top ?? 0) + 4 * line) * devicePixelRatio);
      const bottom = Math.floor(
        ((view?.bottom ?? 0) - line) * devicePixelRatio,
      );
      return {
        filler: {
          left: Math.ceil((side?.left ?? 0) * devicePixelRatio) + 2,
          right: Math.floor((side?.right ?? 0) * devicePixelRatio) - 2,
          top,
          bottom,
        },
        numbers: {
          left: Math.floor((numbers?.left ?? 0) * devicePixelRatio),
          right: Math.ceil((numbers?.right ?? 0) * devicePixelRatio),
          top,
          bottom,
        },
      };
    });
  }

  async function assertInWindow(areas: Areas): Promise<void> {
    const window = await page.evaluate(() => ({
      width: Math.ceil(innerWidth * devicePixelRatio),
      height: Math.ceil(innerHeight * devicePixelRatio),
    }));
    for (const [name, area] of Object.entries(areas)) {
      assert.ok(
        area.left >= 0 &&
          area.top >= 0 &&
          area.right <= window.width &&
          area.bottom <= window.height,
        `The ${name} area ${JSON.stringify(area)} lies outside the window of ${JSON.stringify(window)}`,
      );
    }
  }

  async function captured(areas: Areas): Promise<Capture> {
    const shot = await app.evaluate(async ({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows().toSorted(
        (a, b) => a.id - b.id,
      )[0];
      if (window === undefined) {
        throw new Error('The app has no window.');
      }
      const scale = screen.getDisplayMatching(window.getBounds()).scaleFactor;
      const image = await window.webContents.capturePage();
      return {
        width: image.getSize(scale).width,
        pixels: image.toBitmap({ scaleFactor: scale }).toString('base64'),
      };
    });
    const all = Buffer.from(shot.pixels, 'base64');
    const cropped = (area: Area) => {
      const width = (area.right - area.left) * 4;
      const pixels = Buffer.alloc(width * (area.bottom - area.top));
      for (let y = area.top; y < area.bottom; y++) {
        const from = (y * shot.width + area.left) * 4;
        all.copy(pixels, (y - area.top) * width, from, from + width);
      }
      return pixels;
    };
    return { filler: cropped(areas.filler), numbers: cropped(areas.numbers) };
  }

  async function capturedOnce(
    areas: Areas,
    drawn: (capture: Capture) => boolean,
    what: string,
  ): Promise<Capture> {
    let last: Capture | undefined;
    try {
      await waitFor(
        async () => {
          last = await captured(areas);
          return drawn(last);
        },
        what,
        5000,
      );
    } catch (error) {
      const { left, top, right, bottom } = areas.filler;
      const found = await page.evaluate(
        ([x, y]) => ({
          visibility: document.visibilityState,
          at: document.elementFromPoint(
            x / devicePixelRatio,
            y / devicePixelRatio,
          )?.className,
        }),
        [(left + right) / 2, (top + bottom) / 2] as const,
      );
      throw new Error(
        `${String(error)}: ${JSON.stringify({ areas, ...found, ...commonestOf(last?.filler ?? Buffer.alloc(0)) })}`,
        { cause: error },
      );
    }
    assert.ok(last);
    return last;
  }

  test('leaves the stripes of the empty side of a change where they were once the diff scrolls a line, at 100%, 125%, 150%, 175% and 200%, as stripes moved by a line and part of their spacing seemed to step back and forth', async () => {
    const moved: Record<string, number> = {};
    for (const ratio of ratios) {
      await zoomTo(ratio);
      await scrollToLine(12);
      const areas = await areasOf();
      await assertInWindow(areas);
      const before = await capturedOnce(
        areas,
        ({ filler }) => striped(filler),
        `stripes at ${percent(ratio)}`,
      );
      await scrollToLine(13);
      const after = await capturedOnce(
        areas,
        ({ filler, numbers }) =>
          striped(filler) && !numbers.equals(before.numbers),
        `the line numbers to move at ${percent(ratio)}`,
      );
      moved[percent(ratio)] = changed(before.filler, after.filler);
    }
    assert.deepStrictEqual(
      moved,
      Object.fromEntries(ratios.map((ratio) => [percent(ratio), 0])),
    );
  });
});
