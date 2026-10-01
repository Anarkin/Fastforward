import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  _electron,
  type ElectronApplication,
  type Page,
} from 'playwright-core';
import { defaultSettings, waitFor } from './fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

const appFolder = path.join(__dirname, '..', '..');

suite('App', function () {
  this.timeout(60_000);

  let folder: string;
  let profile: string;
  let repository: TempRepository;
  let app: ElectronApplication;
  let page: Page;

  suiteSetup(async () => {
    folder = tempFolder('app');
    profile = path.join(folder, 'profile');
    repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first', {
      'kept.txt': 'kept\n',
      'changed.txt': 'one\ntwo\nthree\n',
    });
    await repository.commit('second', { 'changed.txt': 'one\n2\nthree\n' });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'settings.json'),
      JSON.stringify({ tabs: [repository.root], activeTab: repository.root }),
    );
    app = await _electron.launch({
      args: [appFolder, `--user-data-dir=${profile}`],
      cwd: appFolder,
    });
    page = await app.firstWindow();
  });

  suiteTeardown(async () => {
    await app?.close();
    removeFolder(folder);
  });

  test('opens the saved tab, titling the window after its repository', async () => {
    await page.locator('.tab.active').waitFor();
    assert.strictEqual(
      await page.locator('.tab.active .tab-name').textContent(),
      'repo',
    );
    assert.strictEqual(await page.title(), `${repository.root} - Fastforward`);
  });

  test('focuses the commit list, whose keys start from the checked-out commit', async () => {
    const list = page.locator('.virtual-rows.list');
    await page.locator('.commit', { hasText: 'second' }).waitFor();
    assert.ok(
      await list.evaluate((element) => element === document.activeElement),
    );
    await page.keyboard.press('ArrowDown');
    await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    await page.keyboard.press('End');
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
    await page.keyboard.press('Home');
    await page.locator('.commit.working-tree.empty.selected').waitFor();
    await page.locator('.columns.nothing-selected').waitFor();
  });

  test('works a menu with the keys, giving the keyboard back when it closes', async () => {
    await page
      .locator('.commit', { hasText: 'first' })
      .click({ button: 'right' });
    const focused = () =>
      page.evaluate(() => document.activeElement?.textContent ?? '');
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
    assert.ok(
      await page
        .locator('.virtual-rows.list')
        .evaluate((element) => element === document.activeElement),
    );
  });

  test('colors the page from the settings', async () => {
    const { colors } = defaultSettings();
    const focus = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-focus')
        .trim(),
    );
    assert.ok([colors.light.focus, colors.dark.focus].includes(focus), focus);
  });

  test('lists the history and shows a commit entire, with its change', async () => {
    await page.locator('.commit', { hasText: 'second' }).click();
    await page.locator('.row.file', { hasText: 'changed.txt' }).click();
    await page.locator('.diff-line.added').first().waitFor();
    assert.deepStrictEqual(
      await page.locator('.diff-line .code').allTextContents(),
      ['one', 'two', '2', 'three'],
    );
    assert.ok(await page.locator('.diff-minimap').isVisible());
  });

  test('finds in the diff on Ctrl+F, stepping on Enter and clearing on Esc', async () => {
    await page.keyboard.press('Control+F');
    const field = page.locator('.diff-find-input');
    assert.ok(
      await field.evaluate((input) => input === document.activeElement),
    );
    await field.fill('T');
    const count = page.locator('.diff-find-count');
    await page.locator('.diff-find-count', { hasText: '1 of 2' }).waitFor();
    assert.deepStrictEqual(
      await page.locator('.diff-line .find-match').allTextContents(),
      ['t', 't'],
    );
    assert.strictEqual(
      await page
        .locator('.diff-line', { has: page.locator('.find-match.current') })
        .locator('.code')
        .textContent(),
      'two',
    );
    await field.press('Enter');
    await page.locator('.diff-find-count', { hasText: '2 of 2' }).waitFor();
    assert.strictEqual(await page.locator('.minimap-mark.match').count(), 2);
    assert.ok((await page.locator('.minimap-mark.added').count()) > 0);
    await page.locator('.row.group', { hasText: 'All Changes' }).click();
    await page.locator('.diff-find-count', { hasText: '1 of 2' }).waitFor();
    assert.ok(await page.locator('.diff-minimap').isVisible());
    assert.strictEqual(await page.locator('.minimap-mark.match').count(), 2);
    assert.strictEqual(await page.locator('.minimap-mark.added').count(), 0);
    await field.press('Escape');
    await count.waitFor({ state: 'detached' });
    assert.strictEqual(await page.locator('.find-match').count(), 0);
  });

  test('moves between the columns with the arrows and Tab, the keys working in the one active', async () => {
    const active = (column: string) =>
      page.locator(`.columns[data-active-column="${column}"]`).waitFor();
    await page.locator('.virtual-rows.list').focus();
    await active('commits');
    await page.keyboard.press('ArrowRight');
    await active('files');
    await page.keyboard.press('ArrowDown');
    const changedFile = page.locator('.row.file.selected', {
      hasText: 'changed.txt',
    });
    const allChanges = page.locator('.row.group.selected', {
      hasText: 'All Changes',
    });
    await changedFile.waitFor();
    await page.keyboard.press('Home');
    await allChanges.waitFor();
    await page.keyboard.press('End');
    await changedFile.waitFor();
    await page.keyboard.press('PageUp');
    await allChanges.waitFor();
    await page.keyboard.press('PageDown');
    await changedFile.waitFor();
    await page.keyboard.press('ArrowRight');
    await active('diff');
    await page.keyboard.press('ArrowLeft');
    await active('files');
    await page.keyboard.press('Shift+Tab');
    await active('commits');
    await page.keyboard.press('Tab');
    await active('files');
    await page.keyboard.press('j');
    await active('diff');
  });

  test('shows the unchanged files on the toggle, dimmed, and remembers it', async () => {
    assert.strictEqual(
      await page.locator('.row.file', { hasText: 'kept.txt' }).count(),
      0,
    );
    await page.getByRole('button', { name: 'Show All Files' }).click();
    await page
      .locator('.row.file .path.unchanged', { hasText: 'kept.txt' })
      .waitFor();
    const userSettings = path.join(profile, 'settings.user.json');
    await waitFor(() => {
      try {
        const settings: unknown = JSON.parse(
          fs.readFileSync(userSettings, 'utf8'),
        );
        return (
          typeof settings === 'object' &&
          settings !== null &&
          'showAllFiles' in settings &&
          settings.showAllFiles === true
        );
      } catch {
        return false;
      }
    }, 'the setting to be saved');
  });

  test('moved the old settings file into the state, keeping it aside', () => {
    assert.ok(fs.existsSync(path.join(profile, 'settings.old.json')));
    assert.ok(!fs.existsSync(path.join(profile, 'settings.json')));
    const state: unknown = JSON.parse(
      fs.readFileSync(path.join(profile, 'state.json'), 'utf8'),
    );
    assert.deepStrictEqual(
      typeof state === 'object' && state !== null && 'tabs' in state
        ? state.tabs
        : undefined,
      [repository.root],
    );
  });

  test('applies settings edited by hand while it runs, and says what is wrong with them', async () => {
    const file = path.join(profile, 'settings.user.json');
    const focus = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-focus')
          .trim(),
      );
    fs.writeFileSync(
      file,
      JSON.stringify({
        showAllFiles: true,
        colors: { light: { focus: '#123456' }, dark: { focus: '#123456' } },
      }),
    );
    await page.waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-focus')
          .trim() === '#123456',
    );
    assert.strictEqual(await focus(), '#123456');
    fs.writeFileSync(file, '{ "showAllFiles": tru');
    await page
      .locator('.notice.error', { hasText: 'not valid JSON' })
      .waitFor();
    fs.writeFileSync(file, JSON.stringify({ showAllFiles: true }));
    await page.waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-focus')
          .trim() !== '#123456',
    );
  });

  test('refreshes by itself when the working tree changes', async () => {
    fs.writeFileSync(path.join(repository.root, 'new.txt'), 'new\n');
    await page
      .locator('.working-tree', { hasText: '1 uncommitted change' })
      .waitFor();
  });
});
