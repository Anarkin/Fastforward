import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import {
  opened,
  page,
  rowNames,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';
import { shownState, closeViewer, firstViewerRow } from './viewerAppFixtures';

const rowTexts = () =>
  page.locator('.viewer-rows .viewer-row').allTextContents();

const firstKeywords = () =>
  page
    .locator('.viewer-rows .viewer-row')
    .evaluateAll((rows) =>
      rows.map((row) => row.querySelector('.syntax-keyword')?.textContent),
    );

suite('App commander', () => {
  sharedCommanderApp();

  test('reads a file in the encoding its byte order mark names, and in the one chosen from the menu E opens, found by what is typed, staying where it was', async () => {
    const text = Array.from(
      { length: 300 },
      (_, index) => `ligne ${index} é`,
    ).join(String.fromCharCode(10));
    fs.writeFileSync(
      path.join(opened, 'wide.txt'),
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]),
    );
    await select('wide');
    await page.keyboard.press('F3');
    await waitFor(
      async () => (await rowTexts())[0] === 'ligne 0 é',
      'the text read as UTF-16',
    );
    assert.strictEqual(
      await page.locator('.viewer-encoding .menu-button-label').textContent(),
      'UTF-16 LE',
    );

    await page.keyboard.press('End');
    await waitFor(
      async () => (await rowTexts()).at(-1) === 'ligne 299 é',
      'the end of the text',
    );
    await page.keyboard.press('e');
    const encodingItems = page.locator('.viewer-encoding .menu-item');
    assert.strictEqual(
      await encodingItems
        .and(page.locator('[aria-checked="true"]'))
        .textContent(),
      '✓Auto: UTF-16 LE',
    );
    await encodingItems.filter({ hasText: /^Bytes$/ }).click();
    await waitFor(
      async () => (await rowTexts()).join('').includes('2.9.9. .é.'),
      'the end of the file as bytes',
    );
    await page.keyboard.press('e');
    await page.locator('.viewer-encoding .menu-filter').waitFor();
    await page.keyboard.type('latin2');
    await page.keyboard.press('Enter');
    await waitFor(
      async () =>
        (await page
          .locator('.viewer-encoding .menu-button-label')
          .textContent()) === '8859-2',
      'the encoding found by its other name chosen',
    );
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'wide.txt'));
    await waitFor(
      async () => !(await rowNames()).includes('wide.txt'),
      'the file to be gone from the list',
    );
  });

  test('colors the code of a file in any encoding, from the first line of one with a byte order mark', async () => {
    try {
      const code = ['const a = 1;', "let b = 'é';"].join(
        String.fromCharCode(10),
      );
      const files = {
        'wide.ts': Buffer.concat([
          Buffer.from([0xff, 0xfe]),
          Buffer.from(code, 'utf16le'),
        ]),
        'marked.ts': Buffer.concat([
          Buffer.from([0xef, 0xbb, 0xbf]),
          Buffer.from(code),
        ]),
      };
      for (const [name, bytes] of Object.entries(files)) {
        fs.writeFileSync(path.join(opened, name), bytes);
        await select(name.replace('.ts', ''));
        await page.keyboard.press('F3');
        await waitFor(
          async () => (await firstKeywords()).join(' ') === 'const let',
          `the keywords of both lines of ${name} colored`,
        ).catch(async (error: unknown) => {
          throw new Error(`${String(error)}: ${await shownState()}`);
        });
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
        fs.rmSync(path.join(opened, name));
        await waitFor(
          async () => !(await rowNames()).includes(name),
          `${name} to be gone from the list`,
        );
      }
    } finally {
      await closeViewer();
    }
  });

  test('reads a text file that is not UTF-8 in the code page of the system', async () => {
    fs.writeFileSync(
      path.join(opened, 'legacy.txt'),
      Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x6f, 0x6b]),
    );
    try {
      await select('legacy');
      await page.keyboard.press('F3');
      await page.locator('.viewer').waitFor();
      await waitFor(
        async () => (await firstViewerRow()).startsWith('caf'),
        'the text',
      ).catch(async (error: unknown) => {
        throw new Error(
          `${String(error)}: the viewer of ${await page.locator('.viewer').getAttribute('data-file')} showed ${JSON.stringify(await page.locator('.viewer').innerText())}`,
        );
      });
      const row = await firstViewerRow();
      assert.ok(!row.includes(String.fromCharCode(0xfffd)), row);
      assert.ok(
        ['1250', '1251', '1252'].includes(
          (await page
            .locator('.viewer-encoding .menu-button-label')
            .textContent()) ?? '',
        ),
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'legacy.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('legacy.txt'),
        'the file to be gone from the list',
      );
    }
  });
});
