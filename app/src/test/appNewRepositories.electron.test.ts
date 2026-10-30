import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../shared/strings';
import { baseSettings, closeOrKill, launchApp } from './appFixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

suite('App making new repositories', () => {
  let folder: string;
  let repository: TempRepository;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('app-new-repositories');
    const profile = path.join(folder, 'profile');
    repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify(baseSettings),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await page.locator('.empty-state').waitFor();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  async function pickFolder(picked: string): Promise<void> {
    await app.evaluate(({ dialog }, chosen) => {
      dialog.showOpenDialog = () =>
        Promise.resolve({ canceled: false, filePaths: [chosen] });
    }, picked);
  }

  async function chooseFromGitMenu(label: string): Promise<void> {
    await page.locator('.tab-add').click();
    await page
      .locator('.context-menu .menu-item', { hasText: strings.tools.git })
      .click();
    await page.locator('.context-menu .menu-item', { hasText: label }).click();
  }

  test('asks before initing a repository inside another even with no tab open, then inits it and opens it in a tab', async () => {
    const inside = path.join(repository.root, 'nested');
    fs.mkdirSync(inside, { recursive: true });
    await pickFolder(inside);
    await chooseFromGitMenu(strings.tabs.init);
    const popup = page.locator('.confirm-popup');
    await popup
      .getByText(strings.confirm.initInside(inside, repository.root))
      .waitFor();
    assert.ok(!fs.existsSync(path.join(inside, '.git')));
    await popup
      .locator('.confirm-button', { hasText: strings.confirm.init })
      .click();
    await page.locator('.tabs .tab.active', { hasText: 'nested' }).waitFor();
    assert.ok(fs.statSync(path.join(inside, '.git')).isDirectory());
  });

  test('clones the repository whose URL is on the clipboard into the folder and name typed, showing it was asked for, and opens it in a tab', async () => {
    const url = pathToFileURL(repository.root).href;
    await app.evaluate(({ clipboard }, copied) => {
      clipboard.readText = () => Promise.resolve(copied);
    }, url);
    await chooseFromGitMenu(strings.tabs.clone);
    const popup = page.locator('.clone-popup');
    const [address, into, name] = [0, 1, 2].map((index) =>
      popup.locator('.clone-input').nth(index),
    );
    assert.strictEqual(await address.inputValue(), url);
    assert.strictEqual(await name.getAttribute('placeholder'), 'repo');
    await into.fill(folder);
    await popup
      .getByText(strings.clone.taken(path.join(folder, 'repo')))
      .waitFor();
    await name.fill('copy');
    await popup
      .getByText(strings.clone.into(path.join(folder, 'copy')))
      .waitFor();
    await name.press('Enter');
    await page.locator('.tabs .tab.active', { hasText: 'copy' }).waitFor();
    await popup.waitFor({ state: 'detached' });
    assert.ok(fs.existsSync(path.join(folder, 'copy', '.git')));
  });
});
