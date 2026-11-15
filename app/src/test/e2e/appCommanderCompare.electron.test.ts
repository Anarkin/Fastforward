import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { waitForFocus } from './waits';
import {
  opened,
  page,
  grayPng,
  rowNames,
  select,
  threeLines,
  markedSorted,
  markedNames,
  sharedCommanderApp,
} from './commanderAppFixtures';

suite('App commander', () => {
  sharedCommanderApp();

  test('compares the two files marked on a side with Shift+F3 in a git tab of their own, showing their diff, with every language in its menu on L, as it shows one file', async () => {
    fs.writeFileSync(path.join(opened, 'before.txt'), threeLines('two'));
    fs.writeFileSync(path.join(opened, 'after.txt'), threeLines('2'));
    await select('before');
    await page.keyboard.press('Space');
    await select('after');
    await page.keyboard.press('Space');
    await waitFor(
      async () => (await markedNames()).toSorted().join() === 'after,before',
      'both files to be marked',
    );

    await page.evaluate(() => {
      const watched = window as typeof window & { repositoryShown?: boolean };
      watched.repositoryShown = false;
      const check = () => {
        const comparing = document
          .querySelector('.tabs .tab.active')
          ?.textContent?.includes('→');
        const repository = document.querySelector<HTMLElement>(
          '.repository:not(.compare-view)',
        );
        if (comparing && repository && repository.offsetParent !== null) {
          watched.repositoryShown = true;
        }
        if (document.querySelector('.compare-view .diff-line.added') === null) {
          requestAnimationFrame(check);
        }
      };
      requestAnimationFrame(check);
    });
    await page.keyboard.press('Shift+F3');
    await page
      .locator('.tabs .tab.active', { hasText: 'after.txt → before.txt' })
      .waitFor();
    await waitFor(
      async () =>
        (
          await page.locator('.compare-view .diff-line.added').allTextContents()
        ).some((line) => line.includes('two')),
      'the diff of the two files',
    );
    await waitForFocus(
      page.locator('.compare-view [data-column-focus]').first(),
      'the diff, to take the keys at once',
    );
    assert.strictEqual(
      await page.evaluate(
        () =>
          (window as typeof window & { repositoryShown?: boolean })
            .repositoryShown,
      ),
      false,
      'The commit list showed before the comparison',
    );

    await page.keyboard.press('F1');
    await waitFor(
      async () =>
        (await page.locator('.shortcuts-heading').allTextContents()).join() ===
        'Diff,Searching',
      'the shortcuts of the diff',
    );
    await page.keyboard.press('F1');
    await page
      .locator('.shortcuts-heading')
      .first()
      .waitFor({ state: 'detached' });

    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(
      page.locator('.compare-view .find-field-input'),
      'the search of the diff',
    );
    await page.keyboard.press('Escape');
    await waitFor(
      async () =>
        (await page.locator('.compare-view .find-field-input').count()) === 0,
      'the search to close',
    );
    assert.strictEqual(
      await page.locator('.tabs .tab.active', { hasText: '→' }).count(),
      1,
    );
    const language = page.locator('.compare-view .language-button');
    assert.strictEqual(
      await language.locator('.menu-button-label').textContent(),
      'Plain Text',
    );
    await page.keyboard.press('l');
    await language.locator('.menu-filter').waitFor();
    await page.keyboard.press('Escape');
    await language.locator('.menu').waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');
    await page.locator('.tabs .tab.active', { hasText: 'Commander' }).waitFor();
    for (const name of ['before.txt', 'after.txt']) {
      fs.rmSync(path.join(opened, name));
    }
    await waitFor(async () => {
      const names = await rowNames();
      return !names.includes('before.txt') && !names.includes('after.txt');
    }, 'the files to be gone from the list');
  });

  test('opens two files compared at their first change, where J lands from the top, though the rows the diff draws as it opens turn out shorter than guessed', async () => {
    const lines = Array.from({ length: 200 }, (_, index) => `line${index}`);
    fs.writeFileSync(
      path.join(opened, 'jump-old.txt'),
      `${lines.join('\n')}\n`,
    );
    fs.writeFileSync(
      path.join(opened, 'jump-new.txt'),
      `${lines.map((line, index) => (index === 150 ? 'changed far down' : line)).join('\n')}\n`,
    );
    await select('jump-old');
    await page.keyboard.press('Space');
    await select('jump-new');
    await page.keyboard.press('Space');
    await waitFor(
      async () => (await markedSorted()) === 'jump-new,jump-old',
      'both files to be marked',
    );
    await page.keyboard.press('Shift+F3');
    const change = page.locator('.compare-view .split-side', {
      hasText: 'line150',
    });
    await change.waitFor();
    const row = await change.evaluate((line) =>
      parseFloat(getComputedStyle(line).lineHeight),
    );
    const belowTop = () =>
      change.evaluate((line) => {
        const list = line.closest('.virtual-rows');
        if (!list) {
          throw new Error('No diff list');
        }
        return Math.round(
          line.getBoundingClientRect().top - list.getBoundingClientRect().top,
        );
      });
    await waitFor(
      async () => (await belowTop()) === Math.round(3 * row),
      'the first change to be shown 3 rows below the top, as J shows it',
    );

    await page.keyboard.press('Escape');
    await page.locator('.tabs .tab.active', { hasText: 'Commander' }).waitFor();
    for (const name of ['jump-old.txt', 'jump-new.txt']) {
      fs.rmSync(path.join(opened, name));
    }
    await waitFor(async () => {
      const names = await rowNames();
      return !names.includes('jump-old.txt') && !names.includes('jump-new.txt');
    }, 'the files to be gone from the list');
  });

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
