import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { closeOrKill, launchApp } from './appLaunch';
import { showTab, tabs } from './tabReturns';
import { waitFor } from '../helpers/fixtures';
import { tempRepository } from '../helpers/repositories';
import { removeFolder, tempFolder } from '../helpers/tempFolders';

let folder: string;
let app: ElectronApplication;
let page: Page;

const shownTab = () =>
  tabs(page).evaluateAll((all) =>
    all.findIndex((tab) => tab.getAttribute('aria-selected') === 'true'),
  );

const appMenu = `nav button[title="${strings.tabs.settings}"]`;

const kinds = ['commander', 'commander', 'git', 'git', 'terminal'] as const;

const toolMenus = {
  commander: `.commander-pane button[title="${strings.commander.bookmarks}"]`,
  git: `button[title="${strings.commits.settings}"]`,
  terminal: undefined,
} as const;

async function openedThenNextTab(
  index: number,
  trigger: string,
): Promise<void> {
  await showTab(page, index);
  await page.waitForTimeout(500);
  const button = page.locator(trigger).first();
  await button.click();
  await page.locator('.menu .menu-item').first().waitFor();
  await page.locator('.menu .menu-item').first().focus();
  await page.keyboard.press('Control+Tab');
  const what = `${trigger} of the ${kinds[index]} tab ${index}`;
  await waitFor(
    async () => (await shownTab()) === index + 1,
    'the next tab shown',
  );
  await page.waitForTimeout(500);
  assert.strictEqual(await page.locator('.menu').count(), 0, what);
  await page.keyboard.press('Control+Shift+Tab');
  await waitFor(
    async () => (await shownTab()) === index,
    'the tab shown again',
  );
  await page.waitForTimeout(500);
  assert.strictEqual(await page.locator('.menu').count(), 0, what);
  assert.strictEqual(await button.getAttribute('aria-expanded'), 'false', what);
}

suite('Menus of a tab', () => {
  beforeAll(async () => {
    folder = tempFolder('tab-menus');
    const profile = path.join(folder, 'profile');
    const roots = ['first', 'second'].map((name) => path.join(folder, name));
    for (const root of [profile, ...roots]) {
      fs.mkdirSync(root, { recursive: true });
    }
    const repositories = [];
    for (const name of ['one', 'two']) {
      const repository = await tempRepository(path.join(folder, name));
      await repository.commit(name);
      repositories.push(repository.root);
    }
    const tabRoots = [...roots, ...repositories, roots[0]];
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: kinds.map((tool, index) => ({
          id: String(index + 1),
          tool,
          root: tabRoots[index],
        })),
        activeTab: '1',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ tools: { git: { autoFetch: false } } }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await page.locator('.commander-pane').first().waitFor();
  });

  afterAll(async () => {
    await closeOrKill(app);
    removeFolder(folder);
  });

  test('closes a menu of a tool, and the menu of the app, once another tab is shown from inside it, rather than leaving it open over that tab, and keeps it closed once the tab is shown again', async () => {
    for (const [index, kind] of kinds.entries()) {
      if (index + 1 < kinds.length) {
        const menu = toolMenus[kind];
        for (const trigger of menu === undefined
          ? [appMenu]
          : [menu, appMenu]) {
          await openedThenNextTab(index, trigger);
        }
      }
    }
  });
});
