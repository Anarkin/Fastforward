import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import { waitForFocus } from './waits';
import {
  opened,
  page,
  right,
  rowNames,
  select,
  savedBookmarks,
  sharedCommanderApp,
} from './commanderAppFixtures';

const folderShown = async () =>
  (await right().locator('.column-name').textContent()) ?? '';

const offered = async () => {
  await page.keyboard.press('Control+d');
  const item = right().locator('.menu-item').first();
  await waitFor(
    () => item.evaluate((element) => element === document.activeElement),
    'the menu of the bookmarks to have the keyboard',
  );
  return item.textContent();
};

suite('App commander', () => {
  sharedCommanderApp();

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

  test('opens a folder with a double click, and one with a double click right after, which Chromium counts on from 3', async () => {
    await right().locator('.commander-row', { hasText: 'src' }).dblclick();
    await waitFor(
      async () => (await rowNames()).join() === '..,main.ts',
      'the listing of src',
    );
    await right().locator('.commander-row', { hasText: '..' }).hover();
    await page.mouse.down({ clickCount: 3 });
    await page.mouse.up({ clickCount: 3 });
    await page.mouse.down({ clickCount: 3 });
    await page.mouse.up({ clickCount: 3 });
    await waitFor(
      async () => (await rowNames()).length === 4,
      'the listing of the folder opened',
    );
  });

  test('shows a file made in the folder shown at once, and drops it once removed', async () => {
    const made = path.join(opened, 'made.log');
    fs.writeFileSync(made, 'made');
    await waitFor(
      async () => (await rowNames()).includes('made.log'),
      'the file made to be listed',
    );
    fs.rmSync(made);
    await waitFor(
      async () => !(await rowNames()).includes('made.log'),
      'the file removed to be dropped',
    );
  });

  test('opens the folder of the active side in another tool, the left one once Tab makes it active', async () => {
    const left = page.locator('.commander-pane').nth(0);
    await right().locator('.virtual-rows').focus();
    await page.keyboard.press('Tab');
    await waitForFocus(
      left.locator('.virtual-rows'),
      'the list of the left side',
    );
    assert.notStrictEqual(
      await left.locator('.column-name').textContent(),
      await right().locator('.column-name').textContent(),
    );
    await page.keyboard.press('ControlOrMeta+Shift+O');
    await page.locator('.open-with-folders').waitFor();
    assert.strictEqual(
      await page.locator('.open-with-folders').textContent(),
      await left.locator('.column-name').textContent(),
    );
    await page.keyboard.press('Escape');
    await page.locator('.open-with-folders').waitFor({ state: 'detached' });
    await page.keyboard.press('Tab');
    await waitForFocus(
      right().locator('.virtual-rows'),
      'the list of the right side',
    );
  });

  test('says in a window, not a notice, that a folder can’t be read, closing it with Enter', async () => {
    const locked = path.join(opened, 'locked');
    fs.mkdirSync(locked);
    const user = process.env.USERNAME ?? '';
    if (process.platform === 'win32') {
      execFileSync('icacls', [locked, '/deny', `${user}:(RX)`]);
    } else {
      fs.chmodSync(locked, 0o000);
    }
    try {
      await right().locator('.commander-row', { hasText: 'locked' }).click();
      await waitFor(
        async () =>
          (
            await right().locator('.commander-row.selected').textContent()
          )?.includes('locked') === true,
        'the locked folder to be selected',
      );
      await page.keyboard.press('Enter');
      const popup = page.locator('.confirm-popup');
      await popup.waitFor();
      assert.deepStrictEqual(
        [
          await popup.locator('.confirm-question > span').count(),
          await popup.locator('.name-value').allTextContents(),
        ],
        [0, [locked]],
      );
      assert.strictEqual(await page.locator('.notice').count(), 0);
      assert.deepStrictEqual(
        await popup.locator('.confirm-button').allTextContents(),
        process.platform === 'win32'
          ? [strings.commander.asAdministrator, strings.confirm.ok]
          : [strings.confirm.ok],
      );
      await waitForFocus(
        popup.locator('.confirm-button.default'),
        'the OK button of the window',
      );
      await page.keyboard.press('Enter');
      await popup.waitFor({ state: 'detached' });
      assert.strictEqual(
        await right().locator('.column-name').textContent(),
        opened,
      );
    } finally {
      if (process.platform === 'win32') {
        execFileSync('icacls', [locked, '/remove:d', user]);
      } else {
        fs.chmodSync(locked, 0o755);
      }
      fs.rmdirSync(locked);
    }
  });

  test('goes back through the folders of the side with Alt+Left, and forward again with Alt+Right', async () => {
    await right().locator('.virtual-rows').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await waitFor(
      async () => (await rowNames()).join() === '..,main.ts',
      'the folder before, src',
    );
    await page.keyboard.press('Alt+ArrowRight');
    await waitFor(
      async () =>
        (await right().locator('.column-name').textContent()) === opened,
      'the folder after, the one opened',
    );
  });

  test('goes to the path typed on Ctrl+Shift+F6, starting from the path of the side selected whole, so a path pasted takes its place, and to the folder of a file with the file selected', async () => {
    const field = page.locator('.prompt-input');
    await select('notes');

    await page.keyboard.press('Control+Shift+F6');
    await field.waitFor();
    assert.deepStrictEqual(
      await field.evaluate((input: HTMLInputElement) => [
        input.value,
        input.selectionStart,
        input.selectionEnd,
      ]),
      [opened, 0, opened.length],
    );
    await page.keyboard.type(path.join(opened, 'src'));
    await page.keyboard.press('Enter');
    await field.waitFor({ state: 'detached' });
    await waitFor(
      async () =>
        (await right().locator('.column-name').textContent()) ===
        path.join(opened, 'src'),
      'the folder typed to open',
    );
    await page.keyboard.press('Control+Shift+F6');
    await field.waitFor();
    await page.keyboard.type(`"${path.join(opened, 'notes.txt')}"`);
    await page.keyboard.press('Enter');
    await field.waitFor({ state: 'detached' });
    await waitFor(
      async () =>
        (await right().locator('.column-name').textContent()) === opened,
      'the folder of the file to open',
    );
    await waitFor(
      async () =>
        (
          await right().locator('.commander-row.selected').textContent()
        )?.includes('notes') === true,
      'the file to be selected',
    );
  });

  test('bookmarks the folder of the active side from the menu Ctrl+D opens, which offers to remove it from then on, saving it to the user settings, and goes back to it by its key from another folder', async () => {
    const bookmarked = await folderShown();
    await right().locator('.virtual-rows').focus();

    assert.strictEqual(await offered(), strings.commander.addBookmark);
    await page.keyboard.press('Enter');
    assert.strictEqual(await offered(), strings.commander.removeBookmark);
    await page.keyboard.press('Escape');
    await waitFor(
      () => savedBookmarks() === JSON.stringify([bookmarked]),
      'the folder of the side to be saved as a bookmark',
    );

    await select('src');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await folderShown()) === path.join(bookmarked, 'src'),
      'src to open',
    );
    assert.strictEqual(await offered(), strings.commander.addBookmark);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+d');
    await right().locator('.menu-item', { hasText: bookmarked }).waitFor();
    await page.keyboard.press('1');
    await waitFor(
      async () => (await folderShown()) === bookmarked,
      'the bookmark to open',
    );
    assert.strictEqual(await offered(), strings.commander.removeBookmark);
    await page.keyboard.press('Escape');
  });

  test('opens the selected folder on the left side with Mod+Left, or the folder it is in when a file is selected', async () => {
    const left = page.locator('.commander-pane').nth(0);
    await select('src');
    await page.keyboard.press('ControlOrMeta+ArrowLeft');
    await waitFor(
      async () =>
        (await left.locator('.column-name').textContent()) ===
        path.join(opened, 'src'),
      'the left side to open src',
    );
    await select('notes');
    await page.keyboard.press('ControlOrMeta+ArrowLeft');
    await waitFor(
      async () => (await left.locator('.column-name').textContent()) === opened,
      'the left side to open the folder of the file',
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

  test.skipIf(process.platform !== 'win32')(
    'opens Users for Documents and Settings, a link no one may list, without saying there is no access',
    async () => {
      const drive = `${opened.charAt(0).toUpperCase()}:\\`;
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent()) === drive,
        'the right side to show the root of the drive',
      );
      await select('Documents and Settings');
      await page.keyboard.press('Enter');
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent()) ===
          `${drive}Users`,
        'the right side to open Users',
      );
      assert.strictEqual(await page.locator('.confirm-popup').count(), 0);
    },
  );
});
