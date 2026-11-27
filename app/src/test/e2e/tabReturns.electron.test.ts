import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { viewerRows } from './cellsSeen';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { settledLooks, tabs } from './tabReturns';
import { untilSettled } from './waits';

const newline = String.fromCharCode(10);

const viewedText = Array.from({ length: 40 }, (_, index) =>
  index % 4 === 1 ? `NAME_${index}=adam` : `KEY_${index}=value ${index}`,
).join(newline);

suite('What a tab shows once settled', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('tab-returns');
    const profile = path.join(folder, 'profile');
    const opened = path.join(folder, 'opened');
    fs.mkdirSync(opened, { recursive: true });
    fs.writeFileSync(path.join(opened, '.env'), viewedText);
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [{ id: '1', tool: 'viewer', root: path.join(opened, '.env') }],
        activeTab: '1',
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await waitFor(async () => (await tabs(page).count()) === 1, 'the tab');
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  const cursorPlace = () =>
    page.evaluate(() => {
      const field = document.querySelector('.viewer .search-box-input');
      const cursor = field?.nextElementSibling;
      return field !== null &&
        cursor?.classList.contains('text-cursor') === true
        ? Math.round(
            cursor.getBoundingClientRect().left -
              field.getBoundingClientRect().left,
          )
        : undefined;
    });

  const firstTexts = async () => {
    const lines = (await settledLooks(page)).text.split(newline);
    const pathLine = lines.findIndex((line) => line.endsWith('.env'));
    return lines.slice(pathLine + 1, pathLine + 3);
  };

  test('reads what the page drew after the last key, though the page stalls right after the key for longer than a tab takes to settle, rather than what it showed before the key, which a stalled page shows unchanged for as long', async () => {
    await page.locator(viewerRows).first().click();
    await page.keyboard.press('ControlOrMeta+F');
    await page.keyboard.type('adam');
    await waitFor(
      async () =>
        (await page.locator('.viewer .search-count').textContent()) ===
        '1 of 10',
      'the matches counted',
    );
    assert.deepStrictEqual(await firstTexts(), ['1 of 10', 'Aa']);
    const before = await untilSettled(cursorPlace, 'the cursor drawn');
    await page.evaluate(() => {
      window.addEventListener(
        'keydown',
        () => {
          setTimeout(() => {
            const until = performance.now() + 700;
            while (performance.now() < until) {
              Math.sqrt(2);
            }
          }, 0);
        },
        { once: true, capture: true },
      );
    });
    await page.keyboard.press('ArrowLeft');
    const moved = await untilSettled(
      cursorPlace,
      'the cursor drawn after the key',
    );
    assert.ok(
      before !== undefined && moved !== undefined && moved < before,
      JSON.stringify([before, moved]),
    );
  });
});
