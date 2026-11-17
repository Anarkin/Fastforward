import * as assert from 'node:assert';
import * as path from 'node:path';
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
        Reflect.deleteProperty(window, 'setTitleBarOverlay');
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

  test('offers a file of a commit only to view it as the commit has it and to copy its path, viewing a copy of it rather than the file on disk', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page
      .locator('.row.file', { hasText: 'changed.txt' })
      .locator('.path-part')
      .last()
      .click({ button: 'right' });
    const menu = page.locator('.context-menu.path-menu');
    await menu.waitFor();
    assert.deepStrictEqual(
      await menu.locator('.menu-item:not(:disabled)').allTextContents(),
      [strings.commander.openWithViewer, strings.commander.copyPath],
    );
    await menu
      .locator('.menu-item', { hasText: strings.commander.openWithViewer })
      .click();
    const viewer = page.locator('.viewer');
    try {
      await viewer.getByText('two').waitFor();
      assert.strictEqual(
        await viewer.getByText('2', { exact: true }).count(),
        0,
      );
      assert.strictEqual(
        await page.locator('.viewer-path').textContent(),
        path.join(repository.root, 'changed.txt'),
      );
    } finally {
      await page.locator('.viewer .column-body').first().focus();
      await page.keyboard.press('Escape');
      await viewer.waitFor({ state: 'detached' });
    }
  });

  test('switches a file viewed as a commit has it to the file on disk from the menu of its versions, the newest commit standing for the file on disk while it is unchanged, its tab and its button naming the version shown', async () => {
    const [first, second] = await repository.resolve('HEAD~1', 'HEAD');
    const short = first?.slice(0, 7);
    const newest = second?.slice(0, 7) ?? '';
    await page.locator('.commit', { hasText: 'first' }).click();
    await page
      .locator('.row.file', { hasText: 'changed.txt' })
      .locator('.path-part')
      .last()
      .click({ button: 'right' });
    await page
      .locator('.context-menu.path-menu .menu-item', {
        hasText: strings.commander.openWithViewer,
      })
      .click();
    const viewer = page.locator('.viewer');
    const trigger = page.locator('.viewer-version .menu-button-trigger');
    const tabFolder = page.locator(
      '[role="tab"][aria-selected="true"] .tab-folder',
    );
    try {
      await viewer.getByText('two').waitFor();
      await trigger.waitFor();
      assert.deepStrictEqual(
        [await trigger.textContent(), await tabFolder.textContent()],
        [short, short],
      );
      await trigger.click();
      const items = await page
        .locator('.menu-item:not(:disabled)')
        .allTextContents();
      assert.deepStrictEqual(
        items.map((item) => [
          item.includes(newest),
          item.includes(short ?? ''),
        ]),
        [
          [true, false],
          [false, true],
        ],
      );
      await page.locator('.menu-item', { hasText: newest }).click();
      await viewer.getByText('2', { exact: true }).waitFor();
      await waitFor(
        async () =>
          (await trigger.textContent()) === newest &&
          (await tabFolder.count()) === 0,
        'the button to name the newest commit and the tab the file on disk',
      );
    } finally {
      await page.locator('.viewer .column-body').first().focus();
      await page.keyboard.press('Escape');
      await viewer.waitFor({ state: 'detached' });
    }
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
