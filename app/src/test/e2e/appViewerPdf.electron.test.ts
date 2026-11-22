import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { pdfOf } from './pdfs';
import { waitForFocus } from './waits';
import {
  opened,
  profile,
  page,
  rowNames,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';

const count = () => page.locator('.viewer .search-count').textContent();

const toggle = (title: string) =>
  page.locator(`.viewer .search-toggle[data-tip="${title}"]`);

const pdfSheets = () =>
  page.evaluate(
    () =>
      [...document.head.querySelectorAll('style')].filter((sheet) =>
        (sheet.textContent ?? '').includes('pdfViewer.css'),
      ).length,
  );

suite('App commander', () => {
  sharedCommanderApp();

  test('brings the styles of PDF.js into the page only while a PDF is shown, its pages laid out by them, and takes them out once it is closed, as every element the app draws was matched against their rules', async () => {
    fs.writeFileSync(
      path.join(opened, 'styled.pdf'),
      pdfOf(
        [['A page laid out by the styles of its viewer']],
        'fedcba9876543210fedcba9876543210',
      ),
    );
    const scroller = page.locator('.viewer .pdf-scroll');
    try {
      assert.strictEqual(await pdfSheets(), 0);
      await select('styled');
      await page.keyboard.press('F3');
      const text = page.locator('.viewer .textLayer', {
        hasText: 'A page laid out',
      });
      await text.waitFor();
      assert.strictEqual(await pdfSheets(), 1);
      assert.deepStrictEqual(
        await text.evaluate((layer) => {
          const { position, overflow } = getComputedStyle(layer);
          const shown = layer.closest('.page');
          return {
            position,
            overflow,
            page: shown === null ? '' : getComputedStyle(shown).position,
          };
        }),
        { position: 'absolute', overflow: 'clip', page: 'relative' },
      );
      await waitForFocus(scroller, 'the PDF');
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });
      assert.strictEqual(await pdfSheets(), 0);
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await scroller.focus();
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'styled.pdf'));
      await waitFor(
        async () => !(await rowNames()).includes('styled.pdf'),
        'the file to be gone from the list',
      );
    }
  });

  test('previews a PDF, searching it on Ctrl+F without leaving the preview, in the case of the query while its toggle is pressed and never by a regular expression, and opens it again where it was left', async () => {
    fs.writeFileSync(
      path.join(opened, 'book.pdf'),
      pdfOf(
        Array.from({ length: 12 }, (_page, pageIndex) =>
          Array.from({ length: 40 }, (_line, line) =>
            line === 20 && (pageIndex === 2 || pageIndex === 8)
              ? `Needle on page ${pageIndex + 1}`
              : `Page ${pageIndex + 1}, line ${line + 1}`,
          ),
        ),
      ),
    );
    const scroller = page.locator('.viewer .pdf-scroll');
    const shownPage = () =>
      scroller.evaluate((element) => {
        const top = element.getBoundingClientRect().top;
        const pages = [...element.querySelectorAll('.page')];
        return (
          pages.findIndex(
            (each) => each.getBoundingClientRect().bottom > top + 40,
          ) + 1
        );
      });
    try {
      await select('book');
      await page.keyboard.press('F3');
      await page
        .locator('.viewer .textLayer', { hasText: 'Page 1, line 1' })
        .waitFor();
      await waitForFocus(scroller, 'the PDF');
      assert.strictEqual(
        await page.locator('.viewer .page').first().getAttribute('aria-label'),
        'Page 1',
      );

      await page.keyboard.press('ControlOrMeta+F');
      await waitForFocus(
        page.locator('.viewer .search-box-input'),
        'the search',
      );
      await page.keyboard.type('needle');
      await waitFor(
        async () => (await count()) === '1 of 2',
        'the matches counted',
      );
      assert.strictEqual(
        await toggle(
          "A PDF can't be searched by a regular expression.",
        ).isDisabled(),
        true,
      );
      await toggle('Match Case').click();
      await waitFor(
        async () => (await count()) === 'No matches',
        'nothing in the case of the query',
      );
      await toggle('Match Case').click();
      await waitFor(
        async () => (await count()) === '1 of 2',
        'the matches counted again',
      );
      await page.locator('.viewer .textLayer .highlight.selected').waitFor();
      await page.keyboard.press('Enter');
      await waitFor(async () => (await count()) === '2 of 2', 'the next match');
      await waitFor(
        async () => (await shownPage()) === 9,
        'the page of the match',
      );
      await page.keyboard.press('Escape');
      await page.locator('.viewer .search-box').waitFor({ state: 'detached' });
      assert.strictEqual(await page.locator('.viewer .pdf-pane').count(), 1);

      await scroller.evaluate((element) => {
        const seventh = element.querySelectorAll('.page')[6];
        if (seventh instanceof HTMLElement) {
          element.scrollTop = seventh.offsetTop + 20;
        }
      });
      const pdfState = () =>
        scroller.evaluate((element) => ({
          scrollTop: element.scrollTop,
          seventh: [...element.querySelectorAll('.page')].map((each) =>
            each instanceof HTMLElement ? each.offsetTop : -1,
          )[6],
          count: element.querySelectorAll('.page').length,
        }));
      await waitFor(
        async () => (await shownPage()) === 7,
        'page 7 shown',
      ).catch(async (error: unknown) => {
        throw new Error(
          `${String(error)}: page ${await shownPage()} shown, ${JSON.stringify(await pdfState())}`,
        );
      });
      await scroller.focus();
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });

      await select('book');
      await page.keyboard.press('F3');
      await page.locator('.viewer .textLayer').first().waitFor();
      await waitFor(
        async () => (await shownPage()) === 7,
        'the PDF opened at page 7 again',
      ).catch(async (error: unknown) => {
        throw new Error(
          `${String(error)}: page ${await shownPage()} shown, ${JSON.stringify(await pdfState())}, places ${fs.existsSync(path.join(profile, 'pdf-places.json')) ? fs.readFileSync(path.join(profile, 'pdf-places.json'), 'utf8') : 'none saved'}`,
        );
      });
    } finally {
      if (await page.locator('.viewer .search-box').isVisible()) {
        await page.keyboard.press('Escape');
      }
      if (await page.locator('.viewer').isVisible()) {
        await scroller.focus();
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'book.pdf'));
      await waitFor(
        async () => !(await rowNames()).includes('book.pdf'),
        'the file to be gone from the list',
      );
    }
  });
});
