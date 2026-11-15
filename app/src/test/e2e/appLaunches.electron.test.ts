import * as assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from 'playwright-core';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { plainOf } from '../../lib/shared/sentences';
import { needsGit } from '../../tools/git/main/gitLocator';
import {
  appArguments,
  appFolder,
  closeOrKill,
  launchApp,
  savedTabs,
  within,
} from './appLaunch';
import { waitForFocus } from './waits';
import { waitFor } from '../helpers/fixtures';
import { tempRepository } from '../helpers/repositories';
import { removeFolder, tempFolder } from '../helpers/tempFolders';

const syntaxWorkers = (page: Page) =>
  page.workers().filter((worker) => worker.url().endsWith('/syntaxWorker.js'))
    .length;

suite('App with a git tab behind a commander tab', () => {
  test('starts the worker coloring code once a git tab or a file viewed is shown, before there is code to color, so its highlighter is made while the diff or file is read, but not for the commander alone', async () => {
    const folder = tempFolder('syntax-worker');
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first', { 'notes.unknown': 'plain\n' });
    const launched = async (name: string) => {
      const profile = path.join(folder, name);
      fs.mkdirSync(profile, { recursive: true });
      fs.writeFileSync(
        path.join(profile, 'state.json'),
        JSON.stringify({
          tabs: [
            { id: '1', tool: 'commander', root: repository.root },
            { id: '2', tool: 'git', root: repository.root },
          ],
          activeTab: '1',
        }),
      );
      const app = await launchApp(profile);
      const page = await app.firstWindow();
      const notes = page
        .locator('.commander-pane')
        .nth(1)
        .locator('.commander-row', { hasText: 'notes' });
      await notes.waitFor();
      assert.strictEqual(syntaxWorkers(page), 0);
      return { app, page, notes };
    };
    try {
      const git = await launched('git');
      try {
        await git.page.locator('.tabs .tab').nth(1).click();
        await git.page.locator('.commit', { hasText: 'first' }).waitFor();
        await waitFor(() => syntaxWorkers(git.page) === 1, 'the syntax worker');
      } finally {
        await closeOrKill(git.app);
      }
      const viewer = await launched('viewer');
      try {
        await viewer.notes.click();
        await viewer.page.keyboard.press('F3');
        await viewer.page.locator('.viewer').waitFor();
        await waitFor(
          () => syntaxWorkers(viewer.page) === 1,
          'the syntax worker',
        );
      } finally {
        await closeOrKill(viewer.app);
      }
    } finally {
      removeFolder(folder);
    }
  });
});

suite('App started from a terminal', () => {
  test('asks which tool opens the folder it is started with, opening its repository on Enter, then that of a folder another start hands it, showing each rather than the tab left active', async () => {
    const folder = tempFolder('command-line');
    const profile = path.join(folder, 'profile');
    const roots: string[] = [];
    for (const name of ['first', 'second', 'third']) {
      const repository = await tempRepository(path.join(folder, name));
      await repository.commit(name);
      roots.push(repository.root);
    }
    const [first, second, third] = roots;
    const inner = path.join(second, 'inner');
    fs.mkdirSync(inner);
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify(savedTabs([first], first)),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ tools: { git: { autoFetch: false } } }),
    );
    const app = await launchApp(profile, { after: ['--', inner] });
    try {
      const page = await app.firstWindow();
      const names = () =>
        page.locator('.tabs .tab .tab-name').allTextContents();
      const openWithGit = async () => {
        const popup = page.locator('.open-with-popup');
        await popup.waitFor();
        await waitForFocus(
          popup.locator('.open-with-tool', { hasText: strings.tools.git }),
          'Git',
        );
        await page.keyboard.press('Enter');
        await popup.waitFor({ state: 'detached' });
      };
      await openWithGit();
      await page.locator('.commit', { hasText: 'second' }).waitFor();
      assert.deepStrictEqual(await names(), ['first', 'second']);
      const electron = await app.evaluate(() => process.execPath);
      const sandbox = process.platform === 'linux' ? ['--no-sandbox'] : [];
      const handedOff = spawnSync(
        electron,
        [...sandbox, ...appArguments(profile, '--', third)],
        { cwd: appFolder, timeout: 30_000 },
      );
      assert.strictEqual(handedOff.status, 0, String(handedOff.stderr));
      await openWithGit();
      await page.locator('.commit', { hasText: 'third' }).waitFor();
      assert.deepStrictEqual(await names(), ['first', 'second', 'third']);
      assert.match(
        (await page
          .locator('.tabs .tab', { hasText: 'third' })
          .getAttribute('class')) ?? '',
        /\bactive\b/,
      );
    } finally {
      await closeOrKill(app);
      removeFolder(folder);
    }
  });
});

suite('App whose page is gone', () => {
  test('loads the page again once its process is gone, such as killed or out of memory, saying so in the log, as the window stayed blank', async () => {
    const folder = tempFolder('page-gone');
    const profile = path.join(folder, 'profile');
    const log = path.join(profile, 'logs', 'Fastforward.log');
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify(savedTabs([repository.root], repository.root)),
    );
    const app = await launchApp(profile);
    try {
      const page = await app.firstWindow();
      await page.locator('.commit', { hasText: 'first' }).waitFor();
      const killed = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .toSorted((a, b) => a.id - b.id)[0]
          .webContents.getOSProcessId(),
      );
      const gone = await within(
        app.evaluate(({ BrowserWindow }, pid) => {
          const contents = BrowserWindow.getAllWindows().toSorted(
            (a, b) => a.id - b.id,
          )[0].webContents;
          const went = new Promise<{ reason: string; exitCode: number }>(
            (resolve) =>
              contents.once('render-process-gone', (_event, details) =>
                resolve(details),
              ),
          );
          process.kill(pid, 'SIGKILL');
          return went;
        }, killed),
        'the page to go',
        30_000,
      ).catch(async (error: unknown) => {
        const left = await app.evaluate(({ BrowserWindow }, pid) => {
          let running = true;
          try {
            process.kill(pid, 0);
          } catch {
            running = false;
          }
          return {
            running,
            crashed: BrowserWindow.getAllWindows()
              .toSorted((a, b) => a.id - b.id)[0]
              .webContents.isCrashed(),
          };
        }, killed);
        throw new Error(
          `The page did not go: its process ${killed} ${left.running ? 'still runs' : 'is gone'}, and Electron ${left.crashed ? 'sees' : 'does not see'} it crashed`,
          { cause: error },
        );
      });
      await waitFor(
        () =>
          fs
            .readFileSync(log, 'utf8')
            .includes(strings.log.pageGone(gone.reason, gone.exitCode)),
        'the page going to be logged',
      );
      const windowShowsTheHistoryAgain = () =>
        app.evaluate(async ({ BrowserWindow }) => {
          const contents = BrowserWindow.getAllWindows().toSorted(
            (a, b) => a.id - b.id,
          )[0].webContents;
          if (contents.isCrashed() || contents.isLoading()) {
            return false;
          }
          const shown: unknown = await Promise.race([
            contents.executeJavaScript(
              "[...document.querySelectorAll('.commit')].some((row) => row.textContent.includes('first'))",
            ),
            new Promise((resolve) => setTimeout(() => resolve(false), 1000)),
          ]);
          return shown === true;
        });
      await waitFor(
        windowShowsTheHistoryAgain,
        'the page to show the history again',
      );
    } finally {
      await closeOrKill(app);
      removeFolder(folder);
    }
  });
});

const toolsGtkRunsToLoadIcons = ['bwrap'];

function linkFromPath(names: readonly string[], folder: string): void {
  const folders = (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean);
  for (const name of names) {
    const found = folders
      .map((inside) => path.join(inside, name))
      .find((file) => fs.existsSync(file));
    if (found !== undefined) {
      fs.symlinkSync(found, path.join(folder, name));
    }
  }
}

function fakeRepositoryAt(folder: string): void {
  const git = path.join(folder, '.git');
  for (const inside of ['objects', 'refs']) {
    fs.mkdirSync(path.join(git, inside), { recursive: true });
  }
  fs.writeFileSync(path.join(git, 'HEAD'), 'ref: refs/heads/main\n');
  fs.writeFileSync(path.join(folder, 'notes.txt'), 'notes\n');
}

suite('App without git', () => {
  test('starts, saying in the log that the git tool needs git, and opens a repository asked for in the commander, saying why in a notice, the commander showing no git icon or item, with git kept off its PATH but the tools GTK runs to load icons left on it, as Ubuntu 26.04 aborts without them', async () => {
    const folder = tempFolder('no-git');
    const profile = path.join(folder, 'profile');
    const log = path.join(profile, 'logs', 'Fastforward.log');
    const repository = path.join(folder, 'repository');
    fakeRepositoryAt(repository);
    linkFromPath(toolsGtkRunsToLoadIcons, folder);
    const app = await launchApp(profile, {
      after: ['--', repository],
      env: {
        ...process.env,
        PATH: folder,
        Path: folder,
        SHELL: path.join(folder, 'no-shell'),
      },
    });
    try {
      const page = await app.firstWindow();
      const popup = page.locator('.open-with-popup');
      await popup.waitFor();
      await waitForFocus(
        popup.locator('.open-with-tool', { hasText: strings.tools.commander }),
        'Commander',
      );
      await page
        .locator('.notice.error', {
          hasText: plainOf(needsGit({ kind: 'missing' })),
        })
        .waitFor();
      await page.keyboard.press('Enter');
      await popup.waitFor({ state: 'detached' });
      const right = page.locator('.commander-pane').nth(1);
      await right.locator('.commander-row', { hasText: 'notes' }).click();
      await page.keyboard.press('Backspace');
      const repositoryRow = right.locator('.commander-row', {
        hasText: 'repository',
      });
      await repositoryRow.click({ button: 'right' });
      const menu = page.locator('.context-menu');
      await menu.waitFor();
      const items = await menu.locator('.menu-item').allTextContents();
      assert.ok(items.includes(strings.commander.newTerminalHere));
      assert.deepStrictEqual(
        items.filter((item) =>
          [
            strings.commander.openInGit,
            strings.commander.cloneHere,
            strings.commander.initHere,
          ].includes(item),
        ),
        [],
      );
      assert.strictEqual(
        await repositoryRow.locator('.commander-mark').count(),
        0,
      );
      await waitFor(
        () =>
          fs
            .readFileSync(log, 'utf8')
            .includes(plainOf(needsGit({ kind: 'missing' }))),
        'the missing git to be logged',
      );
    } finally {
      await closeOrKill(app);
      removeFolder(folder);
    }
  });
});
