import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { writeSettings } from './settingsWritten';
import { shownWindows } from './windowFixtures';

interface Seen {
  readonly playing: boolean;
  readonly opening: boolean;
  readonly iconHidden: boolean | undefined;
  readonly addHidden: boolean | undefined;
  readonly hash: string;
}

function seen(page: Page): Promise<Seen> {
  return page.evaluate(() => {
    const icon = document.querySelector('.tabs .title-bar-icon');
    const add = document.querySelector('.tabs .tab-add');
    const addStyle = add === null ? undefined : getComputedStyle(add);
    return {
      playing: document.documentElement.hasAttribute('data-opening'),
      opening: document.getElementById('opening') !== null,
      iconHidden:
        icon === null
          ? undefined
          : getComputedStyle(icon).visibility === 'hidden',
      addHidden:
        addStyle === undefined ? undefined : addStyle.pointerEvents === 'none',
      hash: location.hash,
    };
  });
}

async function playedThrough(page: Page): Promise<void> {
  await page
    .locator('#opening > canvas.opening-icon')
    .waitFor({ state: 'attached' });
  await page.locator('.tabs .title-bar-icon').waitFor({ state: 'attached' });
  const playing = await seen(page);
  assert.ok(
    !playing.opening ||
      (playing.playing &&
        playing.iconHidden === true &&
        playing.addHidden === true),
    JSON.stringify(playing),
  );
  await page.locator('#opening').waitFor({ state: 'detached' });
  await waitFor(
    async () => (await seen(page)).addHidden === false,
    'the + shown once the opening is done',
  );
  assert.deepStrictEqual(await seen(page), {
    playing: false,
    opening: false,
    iconHidden: false,
    addHidden: false,
    hash: '',
  });
  await waitFor(
    async () =>
      (await page
        .locator('.tabs .tab-add')
        .evaluate((add) => getComputedStyle(add).opacity)) === '1',
    'the + faded in whole',
  );
}

suite('App opening', () => {
  let folder: string;
  let profile: string;
  let app: ElectronApplication | undefined;

  const launched = (): ElectronApplication => {
    assert.ok(app);
    return app;
  };

  const newWindow = async (from: Page): Promise<Page> => {
    const before = new Set(launched().windows());
    await from.keyboard.press('ControlOrMeta+N');
    let opened: Page | undefined;
    await waitFor(() => {
      opened = launched()
        .windows()
        .find((page) => !before.has(page));
      return opened !== undefined;
    }, 'a new window');
    assert.ok(opened);
    return opened;
  };

  beforeAll(async () => {
    folder = tempFolder('opening');
    profile = path.join(folder, 'profile');
    fs.mkdirSync(profile, { recursive: true });
    app = await launchApp(profile, { opening: true });
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  test('plays the opening over the window the app opens, the icon of the title bar hidden until the logo lands on it, then takes it out of the page and its address', async () => {
    await playedThrough(await launched().firstWindow());
  });

  test('plays it again on a right click of the app icon, without opening the menu of the app', async () => {
    const [page] = await shownWindows(launched(), 1);
    assert.ok(page);
    const trigger = page.locator('.tabs > .menu-button .menu-button-trigger');
    await trigger.click({ button: 'right' });
    await playedThrough(page);
    assert.strictEqual(await trigger.getAttribute('aria-expanded'), 'false');
  });

  test('plays it in a window opened with Mod+N, and in none opened once the setting is off, nor in a page reloaded as the settings are saved', async () => {
    const [page] = await shownWindows(launched(), 1);
    assert.ok(page);
    await playedThrough(await newWindow(page));
    await writeSettings(page, profile, {
      windows: { openingAnimation: false },
    });
    await page.locator('.tabs .title-bar-icon').waitFor();
    assert.deepStrictEqual(await seen(page), {
      playing: false,
      opening: false,
      iconHidden: false,
      addHidden: false,
      hash: '',
    });
    const unopened = await newWindow(page);
    await unopened.locator('.tabs .title-bar-icon').waitFor();
    assert.deepStrictEqual(await seen(unopened), {
      playing: false,
      opening: false,
      iconHidden: false,
      addHidden: false,
      hash: '',
    });
  });
});
