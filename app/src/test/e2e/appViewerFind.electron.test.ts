import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { waitForFocus } from './waits';
import {
  opened,
  page,
  rowNames,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';
import {
  cellPoint,
  seenMarked,
  seenRows,
  seenSelected,
  viewerRows,
} from './cellsSeen';
import { findMarks, findCount } from './viewerAppFixtures';

const toggle = (title: string) =>
  page.locator(`.viewer .search-toggle[data-tip="${title}"]`);

const occurrences = () => seenMarked(page, 'occurrence');

suite('App commander', () => {
  sharedCommanderApp();

  test('searches a file viewed on Ctrl+F as the diff does, counting the matches, marking each, stepping to them with Enter and Shift+Enter, matching the case or a regular expression while their toggles are pressed, and closes the search on Esc, then the viewer', async () => {
    const lines = Array.from({ length: 300 }, (_, index) =>
      index % 100 === 50 ? `Needle ${index}` : `row ${index}`,
    );
    fs.writeFileSync(
      path.join(opened, 'haystack.txt'),
      lines.join(String.fromCharCode(10)),
    );
    try {
      await select('haystack');
      await page.keyboard.press('F3');
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');

      await page.keyboard.press('ControlOrMeta+F');
      await waitForFocus(
        page.locator('.viewer .search-box-input'),
        'the search',
      );
      assert.ok(
        (await page
          .locator('.viewer .search-bar')
          .evaluate(
            (row) =>
              row.getBoundingClientRect().left -
              (row.closest('.viewer')?.getBoundingClientRect().left ?? 0),
          )) < 8,
        'The search starts at the start of the header, as in the diff',
      );
      await page.keyboard.type('needle');
      await waitFor(async () => (await findCount()) === '1 of 3', 'the count');
      await waitFor(
        async () =>
          JSON.stringify(await findMarks()) ===
          JSON.stringify([['Needle', true]]),
        'the first match marked as current',
      );
      await page.keyboard.press('Enter');
      await waitFor(
        async () => (await findCount()) === '2 of 3',
        'the next match',
      );
      await waitFor(
        async () =>
          JSON.stringify(await findMarks()) ===
            JSON.stringify([['Needle', true]]) &&
          (await seenRows(page)).find(({ marks }) =>
            marks.some(({ name }) => name === 'current'),
          )?.text === 'Needle 150',
        'the view at the second match',
      );
      await page.keyboard.press('Shift+Enter');
      await waitFor(
        async () => (await findCount()) === '1 of 3',
        'the previous match',
      );
      await page.keyboard.press('1');
      assert.strictEqual(
        await page.locator('.viewer .search-box-input').inputValue(),
        'needle1',
      );
      await page.keyboard.press('Backspace');
      await toggle('Match Case').click();
      await waitFor(
        async () => (await findCount()) === 'No matches',
        'nothing in the case of the query',
      );
      await toggle('Match Case').click();
      await toggle('Use Regular Expression').click();
      await page.locator('.viewer .search-box-input').fill('^Needle [12]50$');
      await waitFor(
        async () => (await findCount()) === '1 of 2',
        'what the pattern matches',
      );
      await toggle('Use Regular Expression').click();
      await page.locator('.viewer .search-box-input').fill('needle');
      await waitFor(async () => (await findCount()) === '1 of 3', 'the count');

      await page.keyboard.press('Escape');
      await page.locator('.viewer .search-box').waitFor({ state: 'detached' });
      await waitForFocus(page.locator('.viewer-body'), 'the viewer again');
      assert.deepStrictEqual(await findMarks(), []);
      assert.strictEqual(await page.locator('.viewer').count(), 1);
    } finally {
      if (await page.locator('.viewer .search-box').isVisible()) {
        await page.keyboard.press('Escape');
        await page
          .locator('.viewer .search-box')
          .waitFor({ state: 'detached' });
      }
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'haystack.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('haystack.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('marks every copy of the text selected in a file viewed, as the editor marks them, in its case and inside longer words too, once the selection has rested, and none while the search has a text', async () => {
    fs.writeFileSync(
      path.join(opened, 'copies.txt'),
      'alpha beta\nbeta alpha alphabet Alpha\n',
    );
    try {
      await select('copies');
      await page.keyboard.press('F3');
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      await page.locator(viewerRows).first().waitFor();
      const first = await cellPoint(page, 0, 1);
      await page.mouse.dblclick(first.x, first.y);
      await waitFor(
        async () => (await occurrences()).join() === 'alpha,alpha,alpha',
        'every copy of the word selected marked',
      );
      assert.deepStrictEqual(
        await seenSelected(page),
        ['alpha'],
        'the word stays selected once its copies are marked',
      );
      await page.keyboard.press('ControlOrMeta+F');
      await page.keyboard.type('beta');
      await waitFor(
        async () => (await occurrences()).length === 0,
        'the copies no longer marked while the search has a text',
      );
    } finally {
      if (await page.locator('.viewer .search-box').isVisible()) {
        await page.keyboard.press('Escape');
        await page
          .locator('.viewer .search-box')
          .waitFor({ state: 'detached' });
      }
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'copies.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('copies.txt'),
        'the file to be gone from the list',
      );
    }
  });
});
