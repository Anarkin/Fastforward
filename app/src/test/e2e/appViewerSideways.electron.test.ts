import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { waitForFocus } from './waits';
import {
  opened,
  profile,
  page,
  savedText,
  rowNames,
  select,
  sharedCommanderApp,
  wrapLongLines,
} from './commanderAppFixtures';
import { firstViewerRow } from './viewerAppFixtures';

suite('App commander', () => {
  sharedCommanderApp();

  test('scrolls a file viewed sideways while its lines are not wrapped, on its overlay scrollbar, Shift and the wheel, or Left and Right, keeping the width of the widest row seen as it scrolls away, drawing only the columns near the screen yet copying rows whole, and brings a match off to the side into view', async () => {
    const long = `start ${'x'.repeat(600)} found`;
    fs.writeFileSync(
      path.join(opened, 'wide.txt'),
      [long, ...Array.from({ length: 300 }, (_, index) => `row ${index}`)].join(
        String.fromCharCode(10),
      ),
    );
    const sideways = page.locator('.viewer-sideways');
    const across = () =>
      sideways.evaluate((element) => ({
        left: element.scrollLeft,
        width: element.scrollWidth,
        shown: element.clientWidth,
      }));
    try {
      await select('wide');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()).startsWith('start'),
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      await wrapLongLines(false);
      await waitFor(async () => {
        const { width, shown } = await across();
        return width > shown + 100;
      }, 'the long line too wide to show');
      const drawn =
        (await page
          .locator('.viewer-rows .viewer-row')
          .first()
          .textContent()) ?? '';
      assert.ok(drawn.length < long.length, String(drawn.length));
      await page.evaluate(() => {
        const shown = [
          ...document.querySelectorAll('.viewer-rows .viewer-row'),
        ];
        const range = document.createRange();
        range.setStartBefore(shown[0] ?? document.body);
        range.setEnd(shown[1]?.firstChild ?? document.body, 2);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
        window.addEventListener(
          'copy',
          (event) =>
            Reflect.set(
              window,
              'copied',
              event.clipboardData?.getData('text/plain'),
            ),
          { once: true },
        );
      });
      await page.keyboard.press('ControlOrMeta+C');
      assert.strictEqual(
        await page.evaluate((): unknown => Reflect.get(window, 'copied')),
        `${long}${String.fromCharCode(10)}ro`,
      );
      await page.evaluate(() => getSelection()?.removeAllRanges());

      await page.locator('.viewer-rows').hover();
      await page.locator('.overlay-scrollbar.horizontal.shown').waitFor();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await waitFor(async () => (await across()).left > 0, 'a step sideways');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await waitFor(async () => (await across()).left === 0, 'back again');
      await page.keyboard.down('Shift');
      await page.mouse.wheel(0, 300);
      await page.keyboard.up('Shift');
      let glidedTo = 0;
      await waitFor(async () => {
        const { left } = await across();
        const still = left > 0 && left === glidedTo;
        glidedTo = left;
        return still;
      }, 'the wheel sideways, glided onto its column');
      assert.ok((await firstViewerRow()).startsWith('start'));

      const before = await across();
      await page.keyboard.press('PageDown');
      await waitFor(
        async () => (await firstViewerRow()).startsWith('row'),
        'the long line scrolled away',
      );
      const after = await across();
      assert.deepStrictEqual(
        [after.left, after.width],
        [before.left, before.width],
      );

      await page.keyboard.press('Home');
      await waitFor(
        async () => (await firstViewerRow()).startsWith('start'),
        'the start again',
      );
      await sideways.evaluate((element) => {
        element.scrollLeft = 0;
      });
      await page.keyboard.press('ControlOrMeta+F');
      await page.keyboard.type('found');
      await page.keyboard.press('Enter');
      await waitFor(
        () =>
          page.evaluate(() => {
            const mark = document.querySelector('.find-match.current');
            const area = document.querySelector('.viewer-sideways');
            if (mark === null || area === null) {
              return false;
            }
            const box = mark.getBoundingClientRect();
            const shown = area.getBoundingClientRect();
            return box.left >= shown.left && box.right <= shown.right;
          }),
        'the match brought into view',
      );
      await page.keyboard.press('Escape');

      await page.keyboard.press('w');
      await waitFor(async () => {
        const { left, width, shown } = await across();
        return left === 0 && width <= shown + 1;
      }, 'the lines wrapped to the width again');
    } finally {
      for (
        let presses = 0;
        presses < 3 && (await page.locator('.viewer').isVisible());
        presses++
      ) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
      await page.locator('.viewer').waitFor({ state: 'detached' });
      fs.rmSync(path.join(opened, 'wide.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('wide.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('knows the width of the widest line of a file viewed without wrapping as soon as it opens, however far down it is, as the diff knows the widest of its lines, rather than widening as rows are read', async () => {
    const long = `start ${'x'.repeat(600)} end`;
    fs.writeFileSync(
      path.join(opened, 'widest last.txt'),
      [
        ...Array.from({ length: 3000 }, (_, index) => `row ${index}`),
        long,
      ].join(String.fromCharCode(10)),
    );
    const sideways = page.locator('.viewer-sideways');
    try {
      await select('widest last');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === 'row 0',
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      await wrapLongLines(false);
      const widthAndAdvance = () =>
        sideways.evaluate((element) => {
          const range = document.createRange();
          const row =
            element.querySelector('.viewer-rows .viewer-row') ?? element;
          range.selectNodeContents(row);
          const dots = row.querySelector('.dot-rows');
          if (dots !== null) {
            range.setEndBefore(dots);
          }
          return {
            width: element.scrollWidth,
            char: range.getBoundingClientRect().width / 'row 0'.length,
          };
        });
      await waitFor(async () => {
        const { width, char } = await widthAndAdvance();
        return char > 0 && width >= long.length * char;
      }, 'the width of the last line');
      assert.strictEqual(await firstViewerRow(), 'row 0');
      assert.strictEqual(savedText(profile, 'wordWrap'), undefined);
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'widest last.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('widest last.txt'),
        'the file to be gone from the list',
      );
    }
  });
});
