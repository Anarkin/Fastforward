import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import {
  opened,
  page,
  grayPng,
  rowNames,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';

suite('App commander', () => {
  sharedCommanderApp();

  test('compares two images marked on a side with Shift+F3 side by side, as a commit shows them, rather than showing nothing', async () => {
    fs.writeFileSync(path.join(opened, 'shot1.png'), grayPng(40, 30));
    fs.writeFileSync(path.join(opened, 'shot2.png'), grayPng(30, 40));
    await select('shot1');
    await page.keyboard.press('Space');
    await select('shot2');
    await page.keyboard.press('Space');
    await page.keyboard.press('Shift+F3');
    await waitFor(
      async () =>
        (
          await page
            .locator('.compare-view .image-diff img')
            .evaluateAll((images) =>
              images.map((image) =>
                image instanceof HTMLImageElement && image.complete
                  ? `${image.naturalWidth}x${image.naturalHeight}`
                  : '',
              ),
            )
        )
          .toSorted((a, b) => a.localeCompare(b))
          .join() === '30x40,40x30',
      'both images, side by side',
    );
    await page.keyboard.press('Escape');
    await page.locator('.tabs .tab.active', { hasText: 'Commander' }).waitFor();
    for (const name of ['shot1.png', 'shot2.png']) {
      fs.rmSync(path.join(opened, name));
    }
    await waitFor(async () => {
      const names = await rowNames();
      return !names.includes('shot1.png') && !names.includes('shot2.png');
    }, 'the images to be gone from the list');
  });

  test('says two files compared are the same rather than showing nothing', async () => {
    fs.writeFileSync(path.join(opened, 'twin1.txt'), 'twins');
    fs.writeFileSync(path.join(opened, 'twin2.txt'), 'twins');
    await select('twin1');
    await page.keyboard.press('Space');
    await select('twin2');
    await page.keyboard.press('Space');
    await page.keyboard.press('Shift+F3');
    await page
      .locator('.compare-view .diff-note', {
        hasText: 'The files are the same.',
      })
      .waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.tabs .tab.active', { hasText: 'Commander' }).waitFor();
    for (const name of ['twin1.txt', 'twin2.txt']) {
      fs.rmSync(path.join(opened, name));
    }
    await waitFor(async () => {
      const names = await rowNames();
      return !names.includes('twin1.txt') && !names.includes('twin2.txt');
    }, 'the files to be gone from the list');
  });
});
