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
import { findMarks, findCount } from './viewerAppFixtures';

suite('App commander', () => {
  sharedCommanderApp();

  test('searches a file viewed on Ctrl+F as the diff does, counting the matches, stepping to them with Enter and Shift+Enter, and closes the search on Esc, then the viewer', async () => {
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
        page.locator('.viewer .find-field-input'),
        'the search',
      );
      assert.ok(
        (await page
          .locator('.viewer .search-row')
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
          ((await page
            .locator('.viewer-rows .viewer-row', {
              has: page.locator('.find-match.current'),
            })
            .textContent()) ?? '') === 'Needle 150',
        'the view at the second match',
      );
      await page.keyboard.press('Shift+Enter');
      await waitFor(
        async () => (await findCount()) === '1 of 3',
        'the previous match',
      );
      await page.keyboard.press('1');
      assert.strictEqual(
        await page.locator('.viewer .find-field-input').inputValue(),
        'needle1',
      );
      await page.keyboard.press('Backspace');

      await page.keyboard.press('Escape');
      await page.locator('.viewer .find-field').waitFor({ state: 'detached' });
      await waitForFocus(page.locator('.viewer-body'), 'the viewer again');
      assert.deepStrictEqual(await findMarks(), []);
      assert.strictEqual(await page.locator('.viewer').count(), 1);
    } finally {
      if (await page.locator('.viewer .find-field').isVisible()) {
        await page.keyboard.press('Escape');
        await page
          .locator('.viewer .find-field')
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
});
