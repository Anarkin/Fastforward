import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Locator, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { baseSettings, launchApp, savedTabs } from './appLaunch';
import { firstLongLine, longLines } from './wrappingFixtures';
import { waitFor } from '../helpers/fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
} from '../helpers/repositories';

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
