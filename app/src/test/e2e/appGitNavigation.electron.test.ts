import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { onTestFinished, suite, test } from 'vitest';
import {
  app,
  folder,
  openChangedFile,
  page,
  repository,
  savedSetting,
  sharedApp,
} from './appFixtures';
import { cellOf, untilDiffLine } from './diffSeen';
import { waitForCount, waitForFocus } from './waits';
import { waitFor } from '../helpers/fixtures';
import { commitBubble, commitRow, commitsSeen } from './commitRows';
import { fileRow, filesSeen } from './fileRows';

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

const active = (column: string) =>
  page.locator(`.columns[data-active-column="${column}"]`).waitFor();

const fileNames = async () =>
  (await filesSeen(page))
    .filter((row) => row.kind === 'file')
    .map((row) => row.name);

suite('App', () => {
  sharedApp({ 'kept.txt': 'kept\n' });

  test('focuses the commit list, whose keys start from the checked-out commit', async () => {
    await page.reload();
    await commitRow(page, 'second').waitFor();
    await waitForFocus(page.locator('.virtual-rows.list'), 'the commit list');
    await page.keyboard.press('ArrowDown');
    await commitRow(page, 'second', { selected: true }).waitFor();
    await page.keyboard.press('End');
    await commitRow(page, 'first', { selected: true }).waitFor();
    await page.keyboard.press('Home');
    await commitRow(page, 'No uncommitted changes', {
      selected: true,
    }).waitFor();
    await page.locator('.columns.nothing-selected').waitFor();
  });

  test('selects the checked-out commit on H, revealing it, and its first parent on Ctrl+Down, or Cmd+Down on macOS, goes back and forward through the selected commits on Alt+Left and Alt+Right, and says on U that the checked-out branch has no upstream to show', async () => {
    await commitRow(page, 'first').click();
    await commitRow(page, 'first', { selected: true }).waitFor();
    await page.keyboard.press('h');
    await commitRow(page, 'second', { selected: true }).waitFor();
    await page.keyboard.press('ControlOrMeta+ArrowDown');
    await commitRow(page, 'first', { selected: true }).waitFor();
    await page.keyboard.press('Home');
    await commitRow(page, 'No uncommitted changes', {
      selected: true,
    }).waitFor();
    await page.keyboard.press('h');
    await commitRow(page, 'second', { selected: true }).waitFor();
    await commitRow(page, 'first').click();
    await commitRow(page, 'first', { selected: true }).waitFor();
    await page.keyboard.press('Alt+ArrowLeft');
    await commitRow(page, 'second', { selected: true }).waitFor();
    await page.keyboard.press('Alt+ArrowRight');
    await commitRow(page, 'first', { selected: true }).waitFor();
    await page.keyboard.press('u');
    await page
      .locator('.notice.info', { hasText: 'main has no upstream' })
      .waitFor();
  });

  test('filters the commit list on Ctrl+F to the commits whose message matches, with neither the working tree nor the graph, counting the commit selected among them, stepping to the next found, and gives the whole list back on Escape at the commit selected', async () => {
    await commitRow(page, 'first').click();
    await page.keyboard.press('ControlOrMeta+F');
    const commits = page.locator('.columns > .column').first();
    const field = commits.locator('.floating-search .search-box-input');
    await waitForFocus(field, 'the filter of the commits');
    await page.keyboard.type('second');
    await waitFor(
      async () =>
        (await commitsSeen(page)).map((row) => row.subject).join() === 'second',
      'the commits filtered down to the second',
    );
    assert.strictEqual(
      await commits
        .locator('.graph-layer')
        .evaluate((layer) =>
          layer instanceof HTMLElement ? layer.seenShapes?.().length : -1,
        ),
      0,
    );
    await commits
      .locator('.floating-search .search-count', { hasText: '0 of 1' })
      .waitFor();
    await commits
      .locator('.floating-search .search-steps .nav-button')
      .last()
      .click();
    await commitRow(page, 'second', { selected: true }).waitFor();
    await commits
      .locator('.floating-search .search-count', { hasText: '1 of 1' })
      .waitFor();
    await field.focus();
    await page.keyboard.press('Escape');
    await field.waitFor({ state: 'detached' });
    await commitRow(page, 'No uncommitted changes').waitFor();
    await commitRow(page, 'second', { selected: true }).waitFor();
    await commitRow(page, 'first').waitFor();
  });

  test('filters the commit list to the commit a hash typed starts, and closes the filter on Escape in the list too', async () => {
    const [first = ''] = await repository.resolve('HEAD~1');
    await page.locator('.virtual-rows.list').first().focus();
    await page.keyboard.press('ControlOrMeta+F');
    const commits = page.locator('.columns > .column').first();
    const field = commits.locator('.floating-search .search-box-input');
    await waitForFocus(field, 'the filter of the commits');
    await page.keyboard.type(first.slice(0, 8));
    await waitFor(
      async () =>
        (await commitsSeen(page)).map((row) => row.subject).join() === 'first',
      'the commits filtered down to the first',
    );
    await page.locator('.virtual-rows.list').first().focus();
    await page.keyboard.press('Escape');
    await field.waitFor({ state: 'detached' });
    await commitRow(page, 'second').waitFor();
  });

  test('opens on Ctrl+D a menu of the bookmarks at its top, then the branches, the remote branches, the tags and the stashes, each a submenu whose filter takes the keys as it opens, the branches nested in folders by their slashes, finding one by its whole name, and selects the commit of the one picked', async () => {
    await repository.git('branch', 'topic/menu', 'HEAD~1');
    onTestFinished(async () => {
      await repository.git('branch', '-D', 'topic/menu');
    });
    await commitRow(page, 'second').click();
    await commitBubble(page, 'topic/menu', { kind: 'branch' }).waitFor();
    await page.keyboard.press('ControlOrMeta+D');
    const menu = page.locator('.context-menu');
    await menu.waitFor();
    await menu
      .locator(':scope > .menu-entry > .menu-item', {
        hasText: 'Local branches',
      })
      .hover();
    const branches = menu.locator('.submenu.filtered-menu');
    const field = branches.locator('.search-box-input');
    await waitForFocus(field, 'the filter of the branches');
    await branches
      .locator(':scope > .menu-entry > .menu-item', { hasText: 'topic' })
      .hover();
    await branches
      .locator('.submenu .menu-item', { hasText: /^\s*menu\s*$/ })
      .waitFor();
    await field.click();
    await page.keyboard.type('topic me');
    await branches
      .locator(':scope > .menu-entry > .menu-item', { hasText: 'topic/menu' })
      .waitFor();
    await page.keyboard.press('Enter');
    await menu.waitFor({ state: 'detached' });
    await commitRow(page, 'first', { selected: true }).waitFor();
  });

  test('keeps the place a worktree was scrolled to when another is shown right after the scroll, rather than its top', async () => {
    const worktree = path.join(folder, 'scrolled');
    const worktrees = page.locator('.worktrees .tab');
    const main = page.locator('.worktrees .tab.active', { hasText: 'main' });
    const other = page.locator('.worktrees .tab.active', {
      hasText: 'scrolled',
    });
    const list = page.locator('.virtual-rows.list');
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
    await commitRow(page, 'scrolled 39').waitFor();
    const scrolledTo = await list.evaluate(
      (element, top) =>
        new Promise<number>((resolve) => {
          element.addEventListener(
            'scroll',
            () => requestAnimationFrame(() => resolve(element.scrollTop)),
            { once: true },
          );
          element.scrollTop = top;
        }),
      600,
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
      await commitRow(page, 'second', { selected: true }).waitFor();
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

  test('filters the files on Ctrl+F in them, marking what it found and showing the diffs of only those, keeping the search for another commit, closing it on Esc and opening it again on Ctrl+F in the files', async () => {
    const files = page.locator('.columns > .column').nth(1);
    await commitRow(page, 'first').click();
    await fileRow(page, 'kept.txt', { kind: 'file' }).waitFor();
    await files.locator('[data-column-focus]').first().focus();
    await page.keyboard.press('ControlOrMeta+F');
    const field = files.locator('.search-box-input');
    await waitForFocus(field, 'the files search');
    await field.fill('txt ch');
    await waitFor(
      async () => (await fileNames()).join() === 'changed.txt',
      'only changed.txt listed',
    );
    assert.deepStrictEqual(
      (await filesSeen(page)).flatMap((row) => row.found),
      ['ch', 'txt'],
    );
    await waitFor(
      async () =>
        (await page.locator('.file-header .path').allTextContents()).join() ===
        'changed.txt',
      'only the diff of changed.txt',
    );
    await commitRow(page, 'second').click();
    await fileRow(page, 'changed.txt', { kind: 'file' }).waitFor();
    assert.strictEqual(await field.inputValue(), 'txt ch');
    await field.focus();
    await page.keyboard.press('Escape');
    await field.waitFor({ state: 'detached' });
    await waitForFocus(files.locator('[data-column-focus]'), 'the files list');
    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(files.locator('.search-box-input'), 'the files search');
    assert.strictEqual(
      await files.locator('.search-box-input').inputValue(),
      '',
    );
    await page.keyboard.press('Escape');
    await files.locator('.search-box-input').waitFor({ state: 'detached' });
  });

  test('moves between the columns with the arrows and Tab, the keys working in the one active', async () => {
    await commitRow(page, 'second').click();
    await fileRow(page, 'All Changes', { kind: 'header' }).click();
    await fileRow(page, 'All Changes', {
      kind: 'header',
      selected: true,
    }).waitFor();
    await page.locator('.virtual-rows.list').focus();
    await active('commits');
    await page.keyboard.press('ArrowRight');
    await active('files');
    await page.keyboard.press('ArrowDown');
    const changedFile = fileRow(page, 'changed.txt', {
      kind: 'file',
      selected: true,
    });
    const allChanges = fileRow(page, 'All Changes', {
      kind: 'header',
      selected: true,
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

  test('draws the text selected in the diff in the blue of the column with the keyboard, though its cells were drawn while the files had it, and in the gray of a column without it once the files have it again', async () => {
    await openChangedFile();
    await active('files');
    const line = await untilDiffLine(
      page,
      ({ change, text }) => change === undefined && text === 'three',
      'the line three',
    );
    const [row] = line.rows;
    assert.ok(row);
    const word = cellOf(row, 1);
    await page.mouse.dblclick(word.x, word.y);
    await active('diff');
    const window = await app.browserWindow(page);
    const selected = {
      x: Math.ceil(row.left),
      y: Math.ceil(row.top),
      width: Math.floor(row.advance * 'three'.length),
      height: Math.floor(row.height),
    };
    const spread = async () => {
      const color = await window.evaluate(async (shown, area) => {
        const bitmap = (await shown.webContents.capturePage(area)).toBitmap();
        const counts = new Map<string, number>();
        for (let at = 0; at < bitmap.length; at += 4) {
          const key = [...bitmap.subarray(at, at + 3)].join(',');
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const [most] = [...counts].toSorted((a, b) => b[1] - a[1]);
        return most === undefined ? [] : most[0].split(',').map(Number);
      }, selected);
      return Math.max(...color) - Math.min(...color);
    };
    await waitFor(async () => (await spread()) > 40, 'the selection in blue');
    await page.keyboard.press('ArrowLeft');
    await active('files');
    await waitFor(async () => (await spread()) <= 3, 'the selection in gray');
  });

  test('counts under the commit list the commits of the history shown, in the font of the app', async () => {
    const commits = page.locator('.columns > .column').first();
    const total = Number(
      (await repository.git('rev-list', '--count', '--all')).trim(),
    );
    await waitFor(
      async () =>
        (await commits.locator('.column-status').textContent()) ===
        `${total.toLocaleString()} commits`,
      'the commits counted',
    );
    assert.strictEqual(
      await commits.locator('.column-status.monospace').count(),
      0,
    );
  });

  test('counts under the files those a commit changed, and those its filter keeps of them while it narrows them', async () => {
    const files = page.locator('.columns > .column').nth(1);
    const status = () => files.locator('.column-status').textContent();
    await commitRow(page, 'first').click();
    await fileRow(page, 'kept.txt', { kind: 'file' }).waitFor();
    await waitFor(
      async () => (await status()) === '2 files changed',
      'the files changed counted',
    );
    await files.locator('[data-column-focus]').first().focus();
    await page.keyboard.press('ControlOrMeta+F');
    const field = files.locator('.search-box-input');
    await waitForFocus(field, 'the files search');
    await field.fill('kept');
    await waitFor(
      async () => (await status()) === '1 of 2 files',
      'the files kept counted',
    );
    await page.keyboard.press('Escape');
    await field.waitFor({ state: 'detached' });
    await waitFor(
      async () => (await status()) === '2 files changed',
      'every file changed counted again',
    );
  });

  test('counts under the diff the lines added and removed in the file shown, or in every file shown, in monospace', async () => {
    const diff = page.locator('.columns > .column').nth(2);
    const status = () => diff.locator('.column-status.monospace').textContent();
    await commitRow(page, 'second').click();
    await fileRow(page, 'changed.txt', { kind: 'file' }).click();
    await waitFor(
      async () => (await status()) === '+1 −1',
      'the lines counted',
    );
    await commitRow(page, 'first').click();
    await fileRow(page, 'kept.txt', { kind: 'file' }).waitFor();
    await fileRow(page, 'All Changes', { kind: 'header' }).click();
    await fileRow(page, 'All Changes', {
      kind: 'header',
      selected: true,
    }).waitFor();
    await waitFor(
      async () => (await status()) === '+4 −0',
      'the lines of every file counted',
    );
  });

  test('shows the unchanged files on the toggle, dimmed, and remembers it', async () => {
    await commitRow(page, 'second').click();
    await fileRow(page, 'changed.txt', { kind: 'file' }).waitFor();
    assert.strictEqual(
      await fileRow(page, 'kept.txt', { kind: 'file' }).count(),
      0,
    );
    await page.getByRole('button', { name: 'Show All Files' }).click();
    await fileRow(page, 'kept.txt', { kind: 'file', dimmed: true }).waitFor();
    await waitFor(
      () => savedSetting('git', 'showAllFiles') === true,
      'the setting to be saved',
    );
  });
});
