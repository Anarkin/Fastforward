import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { closeOrKill, launchApp } from './appFixtures';
import { waitFor } from './fixtures';
import { removeFolder, tempFolder, tempRepository } from './repositories';

interface Area {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
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

function striped(pixels: Buffer): boolean {
  const colors = new Map<number, number>();
  for (let at = 0; at < pixels.length; at += 4) {
    const color = pixels.readUInt32LE(at) & 0xffffff;
    colors.set(color, (colors.get(color) ?? 0) + 1);
  }
  const commonest = Math.max(...colors.values());
  return commonest < 0.9 * (pixels.length / 4);
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
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  async function zoomTo(ratio: number): Promise<void> {
    await app.evaluate(({ BrowserWindow, screen }, wanted) => {
      const window = BrowserWindow.getAllWindows()[0];
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
    assert.ok(Math.abs(scrolled - line) < 0.01, `${scrolled} lines scrolled`);
  }

  function fillerArea(): Promise<Area> {
    return page.evaluate(() => {
      const view = document
        .querySelector('.diff-view .virtual-rows')
        ?.getBoundingClientRect();
      const side = document
        .querySelector('.split-side.filler')
        ?.getBoundingClientRect();
      const line = side?.height ?? 0;
      return {
        left: Math.ceil((side?.left ?? 0) * devicePixelRatio) + 2,
        right: Math.floor((side?.right ?? 0) * devicePixelRatio) - 2,
        top: Math.ceil(((view?.top ?? 0) + 4 * line) * devicePixelRatio),
        bottom: Math.floor(((view?.bottom ?? 0) - line) * devicePixelRatio),
      };
    });
  }

  async function pixelsOf(area: Area): Promise<Buffer> {
    const shot = await app.evaluate(async ({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows()[0];
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
    const width = (area.right - area.left) * 4;
    const pixels = Buffer.alloc(width * (area.bottom - area.top));
    for (let y = area.top; y < area.bottom; y++) {
      const from = (y * shot.width + area.left) * 4;
      all.copy(pixels, (y - area.top) * width, from, from + width);
    }
    return pixels;
  }

  test('leaves the stripes of the empty side of a change where they were once the diff scrolls a line, at 100%, 125%, 150%, 175% and 200%, as stripes moved by a line and part of their spacing seemed to step back and forth', async () => {
    const moved: Record<string, number> = {};
    for (const ratio of ratios) {
      await zoomTo(ratio);
      const area = await fillerArea();
      await scrollToLine(12);
      const before = await pixelsOf(area);
      await scrollToLine(13);
      const after = await pixelsOf(area);
      assert.ok(striped(before), `stripes at ${percent(ratio)}`);
      moved[percent(ratio)] = changed(before, after);
    }
    assert.deepStrictEqual(
      moved,
      Object.fromEntries(ratios.map((ratio) => [percent(ratio), 0])),
    );
  });
});
