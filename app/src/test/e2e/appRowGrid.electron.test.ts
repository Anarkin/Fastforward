import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { closeOrKill, launchApp } from './appFixtures';
import { waitFor } from '../helpers/fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
} from '../helpers/repositories';

const ratios = [1.1, 1.25, 1.5, 1.75];

const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

interface Grid {
  readonly line: number;
  readonly commits: readonly number[];
  readonly files: readonly number[];
}

const gridOf = (page: Page): Promise<Grid> =>
  page.evaluate(() => {
    const commits = document.querySelector('.commit-rows');
    const files = document.querySelector('.tree-row')?.closest('.virtual-rows');
    const origin = files?.getBoundingClientRect().top ?? 0;
    const onScreen = (element: Element) =>
      (element.getBoundingClientRect().top - origin) * devicePixelRatio;
    return {
      line:
        parseFloat(getComputedStyle(commits ?? document.body).lineHeight) *
        devicePixelRatio,
      commits: [
        ...(commits?.querySelectorAll('.commit-line, .bubble-line') ?? []),
      ].map(onScreen),
      files: [...(files?.querySelectorAll('.tree-row') ?? [])].map(onScreen),
    };
  });

const offTheLines = (tops: readonly number[], line: number) =>
  tops
    .map((top) => top - Math.round(top / line) * line)
    .filter((off) => Math.abs(off) > 0.05)
    .map((off) => Math.round(off * 100) / 100);

suite('App row grid', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('app-row-grid');
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first', { 'a.txt': 'a\n' });
    for (let index = 0; index < 30; index++) {
      await repository.commit(`commit ${index}`, { 'a.txt': `${index}\n` });
      if (index % 4 === 0) {
        await repository.git('tag', `tag-${index}`);
      }
    }
    const files: Record<string, string> = {};
    for (let index = 0; index < 40; index++) {
      files[`folder${index % 4}/sub${index % 2}/file${index}.txt`] = 'b\n';
    }
    await repository.commit('many', files);
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
    await page.locator('.commit', { hasText: 'many' }).click();
    await page.locator('.tree-row', { hasText: 'folder0' }).waitFor();
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
            Math.abs(devicePixelRatio - wanted) < 1e-6 &&
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

  test('lays every line of the commits on the lines of the files beside them at 110%, 125%, 150% and 175%, as commits a fraction of a CSS pixel taller or shorter than their lines drifted from them and left a pale line under the uncommitted changes', async () => {
    const off: Record<string, readonly number[]> = {};
    for (const ratio of ratios) {
      await zoomTo(ratio);
      const grid = await settledGrid(page);
      assert.ok(grid.commits.length > 10, String(grid.commits.length));
      assert.ok(grid.files.length > 10, String(grid.files.length));
      off[percent(ratio)] = [
        ...offTheLines(grid.files, grid.line),
        ...offTheLines(grid.commits, grid.line),
      ];
    }
    assert.deepStrictEqual(
      off,
      Object.fromEntries(ratios.map((ratio) => [percent(ratio), []])),
    );
  });
});

async function settledGrid(page: Page): Promise<Grid> {
  const read = () => gridOf(page);
  let last = await read();
  await waitFor(async () => {
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const next = await read();
    const settled =
      JSON.stringify(next.commits) === JSON.stringify(last.commits);
    last = next;
    return settled;
  }, 'the rows to settle');
  return last;
}
