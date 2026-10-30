import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { onTestFinished, suite, test } from 'vitest';
import { strings } from '../shared/strings';
import {
  app,
  folder,
  page,
  repository,
  savedSetting,
  sharedApp,
  waitForCount,
  waitForFocus,
} from './appFixtures';
import { waitFor } from './fixtures';

async function removeWorktree(worktree: string, branch: string): Promise<void> {
  await repository
    .git('worktree', 'remove', '--force', worktree)
    .catch(async () => {
      await fs.promises.rm(worktree, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
      await repository.git('worktree', 'prune');
    });
  await repository.git('branch', '-q', '-D', branch);
}

const focused = () =>
  page.evaluate(() => document.activeElement?.textContent ?? '');

const active = (column: string) =>
  page.locator(`.columns[data-active-column="${column}"]`).waitFor();

suite('App', () => {
  sharedApp({ 'kept.txt': 'kept\n' });

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

  test('focuses the commit list, whose keys start from the checked-out commit', async () => {
    await page.reload();
    await page.locator('.commit', { hasText: 'second' }).waitFor();
    await waitForFocus(page.locator('.virtual-rows.list'), 'the commit list');
    await page.keyboard.press('ArrowDown');
    await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    await page.keyboard.press('End');
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
    await page.keyboard.press('Home');
    await page.locator('.commit.working-tree.empty.selected').waitFor();
    await page.locator('.columns.nothing-selected').waitFor();
  });

  test('selects the checked-out commit on H, revealing it, and its first parent on Ctrl+Down, or Cmd+Down on macOS, goes back and forward through the selected commits on Alt+Left and Alt+Right, and says on U that the checked-out branch has no upstream to show', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
    await page.keyboard.press('h');
    await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    await page.keyboard.press('ControlOrMeta+ArrowDown');
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
    await page.keyboard.press('Home');
    await page.locator('.commit.working-tree.empty.selected').waitFor();
    await page.keyboard.press('h');
    await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
    await page.keyboard.press('Alt+ArrowLeft');
    await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    await page.keyboard.press('Alt+ArrowRight');
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
    await page.keyboard.press('u');
    await page
      .locator('.notice.info', { hasText: 'main has no upstream' })
      .waitFor();
  });

  test('shows the shortcuts on F1 or ?, closing them on Esc or F1', async () => {
    const shortcuts = page.getByRole('dialog', { name: 'Shortcuts' });
    await page.keyboard.press('F1');
    await shortcuts.waitFor();
    await page.keyboard.press('Escape');
    await shortcuts.waitFor({ state: 'detached' });
    await page.keyboard.press('?');
    await shortcuts.waitFor();
    await page.keyboard.press('F1');
    await shortcuts.waitFor({ state: 'detached' });
  });

  test('shows About on Shift+F1, closing it on Esc or Shift+F1', async () => {
    const about = page.getByRole('dialog', { name: 'About' });
    await page.keyboard.press('Shift+F1');
    await about.waitFor();
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

  test('opens the commit search from the round button at the far right of the commit column', async () => {
    const commits = page.locator('.columns > .column').first();
    const button = commits.locator('.column-actions > .search-button');
    const popup = page.locator('.locations-popup');
    const [shown, header] = await Promise.all([
      button.boundingBox(),
      commits.locator('.column-title').boundingBox(),
    ]);
    assert.ok(shown && header);
    assert.ok(header.x + header.width - (shown.x + shown.width) <= 8);
    await button.click();
    await waitForFocus(page.locator('.locations-search'), 'the search field');
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
  });

  test('ends the search popup where its column ends, showing none of its list in the gap below', async () => {
    const commits = page.locator('.columns > .column').first();
    const popup = page.locator('.locations-popup');
    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(page.locator('.locations-search'), 'the search field');
    const [shown, column] = await Promise.all([
      popup.boundingBox(),
      commits.boundingBox(),
    ]);
    assert.ok(shown && column);
    assert.ok(
      Math.abs(shown.y + shown.height - (column.y + column.height)) < 1,
      `the popup ends at ${shown.y + shown.height}, the column at ${column.y + column.height}`,
    );
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
  });

  test('gives the keyboard back to the commit list once the search popup closes on Esc or a jump, by key or click', async () => {
    const list = page.locator('.virtual-rows.list');
    const field = page.locator('.locations-search');
    const popup = page.locator('.locations-popup');
    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(field, 'the search field');
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
    await waitForFocus(list, 'the commit list');
    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(field, 'the search field');
    await field.fill('second');
    await popup.locator('.commit', { hasText: 'second' }).waitFor();
    await page.keyboard.press('Enter');
    await popup.waitFor({ state: 'detached' });
    await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    await waitForFocus(list, 'the commit list');
    await page.keyboard.press('ArrowDown');
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(field, 'the search field');
    await field.fill('main');
    await popup.locator('.row.result[title="main"]').click();
    await popup.waitFor({ state: 'detached' });
    await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    await waitForFocus(list, 'the commit list');
    await page.keyboard.press('ArrowDown');
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
  });

  test('keeps the search popup open in the worktree switched to with it open, its field keeping the keyboard', async () => {
    const worktree = path.join(folder, 'other');
    const worktrees = page.locator('.worktrees .tab');
    const popup = page.locator('.locations-popup');
    const field = page.locator('.locations-search');
    await repository.git('worktree', 'add', '-q', '-b', 'other', worktree);
    onTestFinished(async () => {
      if ((await popup.count()) > 0) {
        await page.keyboard.press('Escape');
        await popup.waitFor({ state: 'detached' });
      }
      await page.keyboard.press('Control+PageUp');
      await page
        .locator('.commit .badge.branch.checked-out', { hasText: 'main' })
        .waitFor();
      await removeWorktree(worktree, 'other');
      await waitForCount(worktrees, 0, 'worktrees');
    });
    await waitForCount(worktrees, 2, 'worktrees');
    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(field, 'the search field');
    await page.keyboard.press('Control+PageDown');
    await page
      .locator('.commit .badge.branch.checked-out', { hasText: 'other' })
      .waitFor();
    assert.strictEqual(await popup.count(), 1);
    assert.ok(
      await field.evaluate((element) => element === document.activeElement),
    );
  });

  test('keeps the place a worktree was scrolled to when another is shown right after the scroll, rather than its top', async () => {
    const worktree = path.join(folder, 'scrolled');
    const worktrees = page.locator('.worktrees .tab');
    const main = page.locator('.worktrees .tab.active', { hasText: 'main' });
    const other = page.locator('.worktrees .tab.active', {
      hasText: 'scrolled',
    });
    const list = page.locator('.virtual-rows.list');
    const scrolledTo = 600;
    await repository.git('worktree', 'add', '-q', '-b', 'scrolled', worktree);
    onTestFinished(async () => {
      if ((await other.count()) > 0) {
        await page.keyboard.press('Control+PageUp');
        await main.waitFor();
      }
      await removeWorktree(worktree, 'scrolled');
      await waitForCount(worktrees, 0, 'worktrees');
    });
    await repository.importCommits(
      'refs/heads/scrolled',
      'scrolled',
      Array.from({ length: 40 }, (_, index) => ({
        message: `scrolled ${index}`,
      })),
    );
    await waitForCount(worktrees, 2, 'worktrees');
    await page.locator('.commit', { hasText: 'scrolled 39' }).waitFor();
    await list.evaluate(
      (element, top) =>
        new Promise((resolve) => {
          element.addEventListener('scroll', resolve, { once: true });
          element.scrollTop = top;
        }),
      scrolledTo,
    );
    await page.keyboard.press('Control+PageDown');
    await other.waitFor();
    await page.keyboard.press('Control+PageUp');
    await main.waitFor();
    await waitFor(
      async () =>
        Math.abs(
          (await list.evaluate((element) => element.scrollTop)) - scrolledTo,
        ) < 1,
      `the list to be scrolled to ${scrolledTo}`,
      5000,
    );
  });

  test('gives the keyboard back to the commit list once the Fetch button it is on is disabled while fetching', async () => {
    const stop = path.join(folder, 'stop-fetch').replaceAll('\\', '/');
    const fetchButton = page.locator('.pin-pair > .nav-button').first();
    await repository.git('remote', 'add', 'origin', 'ssh://stalled.invalid/x');
    await repository.git(
      'config',
      'core.sshCommand',
      `while [ ! -e '${stop}' ]; do sleep 0.2; done; false`,
    );
    try {
      await fetchButton.click();
      await page.locator('.pin-pair > .nav-button.running').waitFor();
      await waitForFocus(page.locator('.virtual-rows.list'), 'the commit list');
      await page.keyboard.press('ArrowDown');
      await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    } finally {
      fs.writeFileSync(stop, '');
      await page
        .locator('.pin-pair > .nav-button.running')
        .waitFor({ state: 'detached' });
      await repository.git('remote', 'remove', 'origin');
      await repository.git('config', '--unset', 'core.sshCommand');
      fs.rmSync(stop);
    }
  });

  test('filters the files from their round button, marking what it found and showing the diffs of only those, keeping the search for another commit, closing it on Esc and opening it again on Ctrl+F in the files', async () => {
    const files = page.locator('.columns > .column').nth(1);
    const names = () => files.locator('.row.file .path').allTextContents();
    await page.locator('.commit', { hasText: 'first' }).click();
    await files.locator('.row.file', { hasText: 'kept.txt' }).waitFor();
    await files.locator('.column-actions > .search-button').click();
    const field = files.locator('.search-input');
    await waitForFocus(field, 'the files search');
    await field.fill('txt ch');
    await waitFor(
      async () => (await names()).join() === 'changed.txt',
      'only changed.txt listed',
    );
    assert.deepStrictEqual(
      await files.locator('.tree-row .match').allTextContents(),
      ['ch', 'txt'],
    );
    await waitFor(
      async () =>
        (await page.locator('.file-header .path').allTextContents()).join() ===
        'changed.txt',
      'only the diff of changed.txt',
    );
    await page.locator('.commit', { hasText: 'second' }).click();
    await files.locator('.row.file', { hasText: 'changed.txt' }).waitFor();
    assert.strictEqual(await field.inputValue(), 'txt ch');
    await field.focus();
    await page.keyboard.press('Escape');
    await field.waitFor({ state: 'detached' });
    await waitForFocus(files.locator('[data-column-focus]'), 'the files list');
    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(files.locator('.search-input'), 'the files search');
    assert.strictEqual(await files.locator('.search-input').inputValue(), '');
    await page.keyboard.press('Escape');
    await files.locator('.search-input').waitFor({ state: 'detached' });
  });

  test('moves between the columns with the arrows and Tab, the keys working in the one active', async () => {
    await page.locator('.commit', { hasText: 'second' }).click();
    await page.locator('.row.group', { hasText: 'All Changes' }).click();
    await page
      .locator('.row.group.selected', { hasText: 'All Changes' })
      .waitFor();
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
    await page.locator('.commit', { hasText: 'second' }).click();
    await page.locator('.row.file', { hasText: 'changed.txt' }).waitFor();
    assert.strictEqual(
      await page.locator('.row.file', { hasText: 'kept.txt' }).count(),
      0,
    );
    await page.getByRole('button', { name: 'Show All Files' }).click();
    await page
      .locator('.row.file .path.unchanged', { hasText: 'kept.txt' })
      .waitFor();
    await waitFor(
      () => savedSetting('showAllFiles') === true,
      'the setting to be saved',
    );
  });
});
