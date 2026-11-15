import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { app, page, repository, sharedApp } from './appFixtures';
import { waitForFocus } from './waits';
import { waitFor } from '../helpers/fixtures';

const focused = () =>
  page.evaluate(() => document.activeElement?.textContent ?? '');

suite('App', () => {
  sharedApp({});

  test('opens the saved tab, titling the window after its repository, showing no worktree row for its only worktree', async () => {
    await page.locator('.tabs .tab.active').waitFor();
    assert.strictEqual(
      await page.locator('.tabs .tab.active .tab-name').textContent(),
      'repo',
    );
    await page.locator('.commit', { hasText: 'second' }).waitFor();
    assert.strictEqual(await page.locator('.worktrees').count(), 0);
    const version = await app.evaluate((electron) => electron.app.getVersion());
    assert.strictEqual(
      await page.title(),
      `${repository.root} - ${strings.app.name(version, true)}`,
    );
  });

  test('gives the page no permission it asks for, as it needs none and shows content from outside the app', async () => {
    assert.deepStrictEqual(
      await page.evaluate(async () => [
        await Notification.requestPermission(),
        (await navigator.permissions.query({ name: 'notifications' })).state,
        (await navigator.permissions.query({ name: 'geolocation' })).state,
      ]),
      ['denied', 'denied', 'denied'],
    );
  });

  test('colors the window buttons only as its own page asks, as it takes messages from no other', async () => {
    const colored = await app.evaluate(({ BrowserWindow, ipcMain }) => {
      const window = BrowserWindow.getAllWindows().find((each) =>
        each.isVisible(),
      );
      if (window === undefined) {
        return undefined;
      }
      const colors: unknown[] = [];
      const overlay = window.setTitleBarOverlay.bind(window);
      window.setTitleBarOverlay = (options) => {
        colors.push(options.symbolColor);
      };
      try {
        for (const [url, color] of [
          ['https://example.com/', '#ff0000'],
          ['fastforward://app/index.html', '#00ff00'],
        ]) {
          ipcMain.emit(
            'windowButtonColor',
            { sender: window.webContents, senderFrame: { url } },
            color,
          );
        }
      } finally {
        window.setTitleBarOverlay = overlay;
      }
      return colors;
    });

    assert.deepStrictEqual(
      colored,
      process.platform === 'darwin' ? [] : ['#00ff00'],
    );
  });

  test('shows About on Shift+F1, its copy button focused, closing it on Esc or Shift+F1', async () => {
    const about = page.getByRole('dialog', { name: 'About' });
    await page.keyboard.press('Shift+F1');
    await about.waitFor();
    await waitFor(
      async () => (await focused()) === 'Copy',
      'Copy to be focused',
    );
    await page.keyboard.press('Escape');
    await about.waitFor({ state: 'detached' });
    await page.keyboard.press('Shift+F1');
    await about.waitFor();
    await page.keyboard.press('Shift+F1');
    await about.waitFor({ state: 'detached' });
  });

  test('works a menu with the keys, giving the keyboard back when it closes', async () => {
    await page
      .locator('.commit', { hasText: 'first' })
      .click({ button: 'right' });
    const first = await page
      .locator('.context-menu .menu-item')
      .first()
      .textContent();
    await page.waitForFunction(
      () => document.activeElement?.classList.contains('menu-item') ?? false,
    );
    assert.strictEqual(await focused(), first);
    await page.keyboard.press('ArrowDown');
    assert.notStrictEqual(await focused(), first);
    await page.keyboard.press('Escape');
    await page.locator('.context-menu').waitFor({ state: 'detached' });
    await waitForFocus(page.locator('.virtual-rows.list'), 'the commit list');
  });

  test('closes the + menu when + is clicked again, or on Ctrl+T again', async () => {
    const add = page.locator('.tab-add');
    const menu = page.locator('.context-menu', {
      hasText: strings.tools.commander,
    });
    await add.click();
    await menu.waitFor();
    await add.click();
    assert.strictEqual(await menu.count(), 0);
    await page.keyboard.press('ControlOrMeta+T');
    await menu.waitFor();
    await page.keyboard.press('ControlOrMeta+T');
    assert.strictEqual(await menu.count(), 0);
  });
});
