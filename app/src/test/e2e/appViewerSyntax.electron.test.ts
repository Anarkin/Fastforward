import * as assert from 'node:assert';
import { maxColoredBytes } from '../../lib/shared/colorLimit';
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
  right,
  rowNames,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';
import { shownState, closeViewer } from './viewerAppFixtures';

const languageLabel = () =>
  page.locator('.viewer .language-button .menu-button-label').textContent();

const checkedLanguage = () =>
  page
    .locator('.viewer .language-button .menu-item[aria-checked="true"]')
    .textContent();

const chooseLanguage = async (typed: string) => {
  await page.keyboard.press('l');
  await page.locator('.viewer .language-button .search-box-input').waitFor();
  await page.keyboard.type(typed);
  await page.keyboard.press('Enter');
  await page.locator('.viewer .language-button .menu').waitFor({
    state: 'detached',
  });
};

const reopen = async () => {
  await page.keyboard.press('Escape');
  await page.locator('.viewer').waitFor({ state: 'detached' });
  await waitForFocus(
    right().locator('.virtual-rows'),
    'the list of the right side',
  );
  await page.keyboard.press('F3');
  await page
    .locator('.viewer-rows .viewer-row')
    .first()
    .waitFor()
    .catch(async (error: unknown) => {
      throw new Error(`${String(error)}: ${await shownState()}`);
    });
};

const lastKeyword = () =>
  page
    .locator('.viewer-rows .viewer-row')
    .last()
    .locator('.syntax-keyword')
    .count();

suite('App commander', () => {
  sharedCommanderApp();

  test('colors the code of a file viewed as the diff colors it, a long one from the top as its lines are done, none while Plain Text is chosen from the menu L opens, which files viewed and diffs start in until Auto is, and a file in the language chosen there, found by what is typed, for as long as it is viewed, leaving a file over the size colored plain, and previews no Markdown over a size of its own', async () => {
    try {
      fs.writeFileSync(path.join(opened, 'code.ts'), 'const answer = 42;');
      await select('code');
      await page.keyboard.press('F3');
      await waitFor(
        async () =>
          (await page
            .locator('.viewer-row .syntax-keyword')
            .first()
            .textContent()) === 'const',
        'the keyword colored',
      );
      const colors = await page.evaluate(() => {
        const keyword = document.querySelector('.viewer-row .syntax-keyword');
        const plain = document.querySelector('.viewer-row');
        return keyword && plain
          ? [getComputedStyle(keyword).color, getComputedStyle(plain).color]
          : [];
      });
      assert.notStrictEqual(colors[0], colors[1]);
      assert.strictEqual(await languageLabel(), 'TypeScript');
      await page.keyboard.press('l');
      assert.strictEqual(await checkedLanguage(), '✓Auto: TypeScript');
      await page.keyboard.press('Escape');
      await chooseLanguage('plain');
      await page.locator('.viewer-row .syntax-keyword').first().waitFor({
        state: 'detached',
      });
      assert.strictEqual(await languageLabel(), 'Plain Text');
      await waitFor(
        () => savedText(profile, 'highlightSyntax') === false,
        'Plain Text saved',
      );
      await reopen();
      assert.strictEqual(await languageLabel(), 'Plain Text');
      await chooseLanguage('typescript');
      await page.locator('.viewer-row .syntax-keyword').first().waitFor();
      assert.strictEqual(savedText(profile, 'highlightSyntax'), false);
      await reopen();
      assert.strictEqual(await languageLabel(), 'Plain Text');
      await chooseLanguage('auto');
      await page.locator('.viewer-row .syntax-keyword').first().waitFor();
      assert.strictEqual(await languageLabel(), 'TypeScript');
      await waitFor(
        () => savedText(profile, 'highlightSyntax') === undefined,
        'Auto saved, as the default',
      );
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });

      fs.writeFileSync(path.join(opened, 'script.txt'), 'const answer = 42;');
      await select('script');
      await page.keyboard.press('F3');
      await page.locator('.viewer-rows .viewer-row').first().waitFor();
      assert.strictEqual(await languageLabel(), 'Plain Text');
      await chooseLanguage('javascript');
      await waitFor(
        async () =>
          (await page
            .locator('.viewer-row .syntax-keyword')
            .first()
            .textContent()) === 'const',
        'the text colored in the language chosen',
      );
      assert.strictEqual(await languageLabel(), 'JavaScript');
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });
      fs.rmSync(path.join(opened, 'script.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('script.txt'),
        'script.txt to be gone from the list',
      );

      fs.writeFileSync(
        path.join(opened, 'lines.ts'),
        Array.from({ length: 6000 }, (_, index) => `let a${index} = 1;`).join(
          String.fromCharCode(10),
        ),
      );
      await select('lines');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await lastKeyword()) > 0,
        'the first lines colored',
      );
      await page.keyboard.press('End');
      await waitFor(
        async () =>
          (await page
            .locator('.viewer-rows .viewer-row')
            .last()
            .textContent()) === 'let a5999 = 1;' && (await lastKeyword()) > 0,
        'the last line colored',
      );
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });

      fs.writeFileSync(
        path.join(opened, 'over.ts'),
        `let first = 1;${String.fromCharCode(10).repeat(1024 * 1024)}`,
      );
      await select('over');
      await page.keyboard.press('F3');
      await waitFor(
        async () =>
          (await page
            .locator('.viewer-rows .viewer-row')
            .first()
            .textContent()) === 'let first = 1;' &&
          (await page.locator('.viewer-row .syntax-keyword').count()) > 0,
        'the first line of a file over a megabyte colored',
      );
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });

      fs.writeFileSync(
        path.join(opened, 'over.md'),
        `# Over${String.fromCharCode(10).repeat(1024 * 1024)}`,
      );
      await select('overmd');
      await page.keyboard.press('F3');
      await waitFor(
        async () =>
          (await page.locator('.viewer .markdown-note').textContent()) ===
          'Documents over 1 MB are not previewed.',
        'the document too large to preview',
      );
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });

      fs.writeFileSync(
        path.join(opened, 'large.ts'),
        `const big = 1;${' '.repeat(maxColoredBytes)}`,
      );
      await select('large');
      await page.keyboard.press('F3');
      await waitFor(
        async () =>
          (
            (await page
              .locator('.viewer-rows .viewer-row')
              .first()
              .textContent()) ?? ''
          ).startsWith('const big'),
        'the large file shown',
      );
      await page.waitForTimeout(300);
      assert.strictEqual(
        await page.locator('.viewer-row .syntax-keyword').count(),
        0,
      );
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });
      const files = ['code.ts', 'lines.ts', 'over.ts', 'over.md', 'large.ts'];
      for (const file of files) {
        fs.rmSync(path.join(opened, file));
      }
      await waitFor(async () => {
        const names = await rowNames();
        return files.every((file) => !names.includes(file));
      }, 'the files to be gone from the list');
    } finally {
      await closeViewer();
    }
  });
});
