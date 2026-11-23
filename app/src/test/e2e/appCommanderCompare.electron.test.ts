import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import {
  cellOf,
  diffLinesSeen,
  diffListTop,
  diffMarked,
  diffTexts,
  untilDiffLine,
} from './diffSeen';
import { waitForFocus } from './waits';
import {
  opened,
  page,
  rowNames,
  select,
  threeLines,
  markedSorted,
  markedNames,
  sharedCommanderApp,
} from './commanderAppFixtures';
import { grayPng } from './images';

const compared = '.compare-view';

const occurrences = () => diffMarked(page, 'occurrence', compared);

const copiesDrawn = async () =>
  (await diffTexts(page, undefined, compared)).join(' ').split('alpha').length -
  1;

suite('App commander', () => {
  sharedCommanderApp();

  test('compares the two files marked on a side with Shift+F3 in a git tab of their own, showing their diff under their whole paths, with every language in its menu on L, as it shows one file', async () => {
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
        const added = [
          ...document.querySelectorAll<HTMLElement>(
            '.compare-view .diff-cells',
          ),
        ].some((cells) =>
          (cells.seenRows?.() ?? []).some(
            ({ tint }) => tint?.startsWith('added') === true,
          ),
        );
        if (!added) {
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
        (await diffTexts(page, 'added', compared)).some((line) =>
          line.includes('two'),
        ),
      'the diff of the two files',
    );
    assert.strictEqual(
      await page.locator('.compare-view .file-header .path').textContent(),
      `${opened}${path.sep}{after.txt → before.txt}`,
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
      page.locator('.compare-view .search-box-input'),
      'the search of the diff',
    );
    await page.keyboard.press('Escape');
    await waitFor(
      async () =>
        (await page.locator('.compare-view .search-box-input').count()) === 0,
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
    await language.locator('.search-box-input').waitFor();
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
    const changed = await untilDiffLine(
      page,
      ({ text }) => text.includes('line150'),
      'the line changed',
      compared,
    );
    const row = changed.rows[0]?.height ?? 0;
    const belowTop = async () => {
      const line = (await diffLinesSeen(page, compared)).find(({ text }) =>
        text.includes('line150'),
      );
      return line === undefined
        ? undefined
        : Math.round(line.top - (await diffListTop(page, compared)));
    };
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

  test('says on a header of their paths that two files compared are identical rather than showing nothing, as a note stood alone in an empty diff', async () => {
    fs.writeFileSync(path.join(opened, 'twin1.txt'), 'twins');
    fs.writeFileSync(path.join(opened, 'twin2.txt'), 'twins');
    await select('twin1');
    await page.keyboard.press('Space');
    await select('twin2');
    await page.keyboard.press('Space');
    await page.keyboard.press('Shift+F3');
    const header = page.locator('.compare-view .file-header');
    await header
      .locator('.file-header-note', { hasText: strings.diff.identical })
      .waitFor();
    await header.locator('.path', { hasText: 'twin2.txt' }).waitFor();
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

  test('marks every copy of the text selected in two files compared, as the editor marks them, once the selection has rested, keeps the selection and the marks once the tab is shown again after another, and marks none while the search has a text', async () => {
    fs.writeFileSync(
      path.join(opened, 'copies1.txt'),
      'alpha beta\nalpha gamma\n',
    );
    fs.writeFileSync(
      path.join(opened, 'copies2.txt'),
      'alpha beta\nalpha delta\n',
    );
    try {
      await select('copies1');
      await page.keyboard.press('Space');
      await select('copies2');
      await page.keyboard.press('Space');
      await page.keyboard.press('Shift+F3');
      const [code] = (
        await untilDiffLine(page, () => true, 'a line compared', compared)
      ).rows;
      assert.ok(code, 'the first line compared has no row');
      const first = cellOf(code, 1);
      await page.mouse.dblclick(first.x, first.y);
      await waitFor(async () => {
        const marked = await occurrences();
        return (
          marked.length > 2 &&
          marked.length === (await copiesDrawn()) &&
          marked.every((text) => text === 'alpha')
        );
      }, 'every copy of the word selected marked');
      assert.strictEqual(
        (await diffLinesSeen(page, compared))
          .map(({ selected }) => selected)
          .join(''),
        'alpha',
        'the word stays selected once its copies are marked',
      );
      const marked = await occurrences();
      await page.locator('.tabs .tab', { hasText: 'Commander' }).click();
      await page
        .locator('.tabs .tab.active', { hasText: 'Commander' })
        .waitFor();
      await page.locator('.tabs .tab', { hasText: 'copies1' }).click();
      await waitFor(
        async () =>
          (await diffLinesSeen(page, compared))
            .map(({ selected }) => selected)
            .join('') === 'alpha',
        'the word selected again once the tab is shown again',
      );
      assert.deepStrictEqual(
        await occurrences(),
        marked,
        'its copies marked again at once, as they were dropped with the view drawn anew',
      );
      await page.keyboard.press('ControlOrMeta+F');
      await page.keyboard.type('beta');
      await waitFor(
        async () => (await occurrences()).length === 0,
        'the copies no longer marked while the search has a text',
      );
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page
        .locator('.tabs .tab.active', { hasText: 'Commander' })
        .waitFor();
    } finally {
      for (const name of ['copies1.txt', 'copies2.txt']) {
        fs.rmSync(path.join(opened, name));
      }
      await waitFor(async () => {
        const names = await rowNames();
        return !names.includes('copies1.txt') && !names.includes('copies2.txt');
      }, 'the files to be gone from the list');
    }
  });
});
