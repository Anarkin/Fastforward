import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { tempRepository, type TempRepository } from '../helpers/repositories';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { baseSettings, closeOrKill, launchApp } from './appLaunch';
import {
  comesBackAsLeft,
  scrolledAround,
  settledLooks,
  showTab,
  tabs,
} from './tabReturns';
import { waitForCount, waitForFocus } from './waits';

const lines = (count: number, line: (index: number) => string) =>
  Array.from({ length: count }, (_, index) => line(index)).join('\n');

const longText = lines(300, (index) =>
  index % 30 === 7
    ? `${index} adam ${'wide '.repeat(40)}`
    : `${index} ${'line '.repeat(index % 20)}`,
);

const otherTool = 2;
const otherRepository = 1;

suite('App git tabs shown again', () => {
  let folder: string;
  let repository: TempRepository;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('app-git-returns');
    const profile = path.join(folder, 'profile');
    repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first', {
      'long.txt': longText,
      ...Object.fromEntries(
        Array.from({ length: 30 }, (_, index) => [
          `folder ${index % 3}/file ${index}.txt`,
          `${index}\n`,
        ]),
      ),
    });
    await repository.commit('second', {
      'long.txt': longText.replaceAll('line line', 'row row'),
      ...Object.fromEntries(
        Array.from({ length: 30 }, (_, index) => [
          `folder ${index % 3}/file ${index}.txt`,
          `${index} changed\n`,
        ]),
      ),
    });
    await repository.git(
      'worktree',
      'add',
      '-q',
      '-b',
      'other',
      path.join(folder, 'other'),
    );
    const another = await tempRepository(path.join(folder, 'another'));
    await another.commit('elsewhere', { 'one.txt': 'one\n' });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      `${JSON.stringify(baseSettings)}\n`,
    );
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'git', root: repository.root },
          { id: '2', tool: 'git', root: another.root },
          { id: '3', tool: 'commander', root: folder },
        ],
        activeTab: '1',
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await waitFor(async () => (await tabs(page).count()) === 3, 'every tab');
    await waitForCount(page.locator('.worktrees .tab'), 2, 'worktrees');
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  const worktreeComesBack = async (what: string) => {
    const left = await settledLooks(page);
    await page.keyboard.press('Control+PageDown');
    await page
      .locator('.worktrees .tab.active', { hasText: 'other' })
      .waitFor();
    await settledLooks(page);
    await page.keyboard.press('Control+PageUp');
    await page.locator('.worktrees .tab.active', { hasText: 'main' }).waitFor();
    assert.deepStrictEqual(
      await settledLooks(page),
      left,
      `${what} comes back as it was left from another worktree`,
    );
  };

  const comesBackFromEverywhere = async (what: string) => {
    await comesBackAsLeft(page, otherTool, `${what} left for another tool`);
    await comesBackAsLeft(
      page,
      otherRepository,
      `${what} left for another repository`,
    );
    await worktreeComesBack(what);
  };

  test('brings back the commit search open with what was typed in it and its caret', async () => {
    await showTab(page, 0);
    await page.locator('.virtual-rows.list').focus();
    await page.keyboard.press('ControlOrMeta+F');
    const field = page.locator('.locations-popup .search-box-input');
    await waitForFocus(field, 'the commit search');
    await page.keyboard.type('second');
    await page
      .locator('.locations-popup .commit', { hasText: 'second' })
      .waitFor();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await comesBackFromEverywhere('The commit search');
    await page.keyboard.press('Escape');
    await page.locator('.locations-popup').waitFor({ state: 'detached' });
  });

  test('brings back the diff of a file with its find open on the match it was on, the caret in its box, and the diff scrolled down and across', async () => {
    await showTab(page, 0);
    await page.locator('.commit', { hasText: 'second' }).click();
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    const diff = page.locator('.diff-view .virtual-rows');
    await diff
      .locator('.diff-line.added', { hasText: 'row row' })
      .first()
      .waitFor();
    await diff.focus();
    await page.keyboard.press('ControlOrMeta+F');
    const field = page
      .locator('.diff-view')
      .locator('xpath=ancestor::section[contains(@class, "column")]')
      .locator('.search-bar input');
    await waitForFocus(field, 'the find of the diff');
    await page.keyboard.type('adam');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowLeft');
    await waitFor(
      async () =>
        (await page
          .locator('.diff-view')
          .locator('xpath=ancestor::section[contains(@class, "column")]')
          .locator('.search-count')
          .textContent()) === '3 of 10',
      'the third match found',
    );
    await diff.evaluate((element) => {
      element.scrollTop = element.scrollHeight / 3;
      element.scrollLeft = 40;
    });
    await field.focus();
    await comesBackFromEverywhere('The diff searched and scrolled');
  });

  test('brings back the files filtered with folders folded as they were, in the search and out of it, the keyboard where it was, and a message pinned', async () => {
    await showTab(page, 0);
    const files = page.locator('.columns > .column').nth(1);
    await files.locator('.row.folder', { hasText: 'folder 0' }).click();
    await files.locator('.row.file', { hasText: 'file 4.txt' }).click();
    await page.keyboard.press('ControlOrMeta+F');
    const filter = files.locator('.search-bar input');
    await waitForFocus(filter, 'the filter of the files');
    await page.keyboard.type('file 1');
    await files.locator('.row.file', { hasText: 'file 19.txt' }).waitFor();
    await files.locator('.row.folder', { hasText: 'folder 2' }).click();
    await filter.focus();
    await page.keyboard.press('ArrowLeft');
    await page
      .locator('.commit .subject', { hasText: 'first' })
      .click({ modifiers: ['Alt'] });
    const pinned = page.locator('.message-peek.pinned');
    await pinned.waitFor();
    await filter.focus();
    await comesBackFromEverywhere('The files filtered and folded');
    assert.strictEqual(await pinned.count(), 1, 'the message still pinned');
  });

  test('brings back every scroller of the tab where it was scrolled to', async () => {
    await showTab(page, 0);
    await settledLooks(page);
    await scrolledAround(page);
    await comesBackFromEverywhere('The tab scrolled around');
  });

  test('brings back the commit column hidden only in the tab it was hidden in', async () => {
    await showTab(page, 0);
    await page.locator('.virtual-rows.list').focus();
    await page.keyboard.press('c');
    await page.locator('.columns.commits-hidden').waitFor();
    await comesBackFromEverywhere('The commit column hidden');
    await showTab(page, otherRepository);
    await page.locator('.columns:not(.commits-hidden)').waitFor();
    await showTab(page, 0);
    await page.locator('.columns.commits-hidden').waitFor();
    await page.keyboard.press('c');
    await page.locator('.columns:not(.commits-hidden)').waitFor();
  });
});
