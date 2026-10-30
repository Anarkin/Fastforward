import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from './fixtures';
import { closeOrKill, launchApp, waitForFocus } from './appFixtures';
import { removeFolder, tempFolder } from './repositories';

suite('App commander', () => {
  let folder: string;
  let opened: string;
  let profile: string;
  let app: ElectronApplication;
  let page: Page;

  const right = () => page.locator('.commander-pane').nth(1);
  const rowNames = (pane = right()) =>
    pane
      .locator('.commander-row')
      .evaluateAll((rows) =>
        rows.map((row) =>
          [
            row.querySelector('.commander-name')?.textContent,
            row.querySelector('.commander-extension')?.textContent,
          ]
            .filter(Boolean)
            .join('.'),
        ),
      );

  beforeAll(async () => {
    folder = tempFolder('app-commander');
    profile = path.join(folder, 'profile');
    opened = path.join(folder, 'opened');
    fs.mkdirSync(path.join(opened, 'src'), { recursive: true });
    fs.writeFileSync(path.join(opened, 'notes.txt'), '12345');
    fs.writeFileSync(path.join(opened, 'big.bin'), Buffer.alloc(12_288));
    fs.writeFileSync(path.join(opened, 'src', 'main.ts'), '');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [{ id: '1', tool: 'commander', root: opened }],
        activeTab: '1',
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await right().locator('.commander-row').first().waitFor();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  test('lists the folder it was opened with on the right, the active side, folders first and then files by extension, with their sizes', async () => {
    await waitForFocus(
      right().locator('.virtual-rows'),
      'the list of the right side',
    );
    assert.deepStrictEqual(await rowNames(), [
      '..',
      'src',
      'big.bin',
      'notes.txt',
    ]);
    assert.strictEqual(
      await right()
        .locator('.commander-row', { hasText: 'big' })
        .locator('.commander-size')
        .textContent(),
      '12,288',
    );
  });

  test('opens a folder with Enter and goes back up with Backspace, selecting the folder it came from', async () => {
    await right().locator('.commander-row', { hasText: 'src' }).click();
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..,main.ts',
      'the listing of src',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () =>
        (
          await right().locator('.commander-row.selected').textContent()
        )?.includes('src') === true,
      'src to be selected again',
    );
  });

  test('opens a folder with a double click', async () => {
    await right().locator('.commander-row', { hasText: 'src' }).dblclick();
    await waitFor(
      async () => (await rowNames()).join() === '..,main.ts',
      'the listing of src',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).length === 4,
      'the listing of the folder opened',
    );
  });

  test.skipIf(process.platform !== 'win32')(
    'opens the drive menu of the right side with Alt+F2 and changes the drive by its letter',
    async () => {
      await right().locator('.virtual-rows').focus();
      await page.keyboard.press('Alt+F1');
      await page.locator('.commander-pane').nth(0).locator('.menu').waitFor();
      await page.keyboard.press('Alt+F2');
      await right().locator('.menu').waitFor();
      await page
        .locator('.commander-pane')
        .nth(0)
        .locator('.menu')
        .waitFor({ state: 'detached' });
      await page.keyboard.press(opened.charAt(0).toLowerCase());
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent()) ===
          `${opened.charAt(0).toUpperCase()}:\\`,
        'the root of the drive of the folder opened',
      );
      await page
        .locator('.commander-pane .menu')
        .waitFor({ state: 'detached' });
    },
  );

  test('draws rows as the diff draws lines, in the monospace font and its line height', async () => {
    const row = await right()
      .locator('.commander-row')
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          family: style.fontFamily,
          height: element.getBoundingClientRect().height,
          lineHeight: style.lineHeight,
        };
      });
    assert.match(row.family, /JetBrains Mono/);
    assert.ok(
      Math.abs(row.height - parseFloat(row.lineHeight)) < 0.01,
      `${row.height} ${row.lineHeight}`,
    );
  });

  test('saves the width of a column dragged in the header to the user settings', async () => {
    const handle = right().locator('.column-handle').first();
    const box = await handle.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 40, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await waitFor(() => {
      const file = path.join(profile, 'settings.user.json');
      if (!fs.existsSync(file)) {
        return false;
      }
      const extension: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
        ?.tools?.commander?.columns?.extension;
      return typeof extension === 'number' && extension > 10;
    }, 'the width of the extension to be saved');
  });
});
