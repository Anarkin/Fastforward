import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from 'playwright-core';
import { suite, test } from 'vitest';
import { baseSettings, closeOrKill, launchApp } from './appLaunch';
import { waitFor } from '../helpers/fixtures';
import { removeFolder, tempFolder } from '../helpers/repositories';

const dark = (page: Page) =>
  page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);

const turned = (page: Page, toDark: boolean) =>
  dark(page).then(
    (isDark) => isDark === toDark,
    () => false,
  );

suite('App with a theme', () => {
  test('follows the system by default, turns to the other theme at once when the settings file is saved with it, and starts in it from then on', async () => {
    const folder = tempFolder('themes');
    const profile = path.join(folder, 'profile');
    fs.mkdirSync(profile, { recursive: true });
    const settingsFile = path.join(profile, 'settings.user.json');
    fs.writeFileSync(settingsFile, JSON.stringify(baseSettings));
    let app = await launchApp(profile);
    try {
      let page = await app.firstWindow();
      await page.emulateMedia({ colorScheme: null });
      await page.locator('.tabs > .menu-button > button').waitFor();
      const [source, systemDark] = await app.evaluate(({ nativeTheme }) => [
        nativeTheme.themeSource,
        nativeTheme.shouldUseDarkColors,
      ]);
      assert.deepStrictEqual(
        [source, await dark(page)],
        ['system', systemDark],
      );
      fs.writeFileSync(
        settingsFile,
        JSON.stringify({
          ...baseSettings,
          theme: systemDark ? 'light' : 'dark',
        }),
      );
      await waitFor(
        () => turned(page, !systemDark),
        'the window to turn to the other theme',
      );
      await closeOrKill(app);
      app = await launchApp(profile);
      page = await app.firstWindow();
      await page.emulateMedia({ colorScheme: null });
      await page.locator('.tabs > .menu-button > button').waitFor();
      assert.strictEqual(await dark(page), !systemDark);
    } finally {
      await closeOrKill(app);
      removeFolder(folder);
    }
  });
});
