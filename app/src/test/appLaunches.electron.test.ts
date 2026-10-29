import * as assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Locator, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../shared/strings';
import {
  appArguments,
  appFolder,
  baseSettings,
  closeOrKill,
  firstLongLine,
  launchApp,
  longLines,
  savedTabs,
  waitForFocus,
  within,
} from './appFixtures';
import { defaultSettings, waitFor } from './fixtures';
import { removeFolder, tempFolder, tempRepository } from './repositories';

async function scrollsOnWheelOver(
  page: Page,
  list: Locator,
  band: Locator,
): Promise<void> {
  await list.evaluate((element) => {
    element.scrollTop = 200;
  });
  const box = await band.boundingBox();
  assert.ok(box, 'nothing stuck atop the list');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 100);
  await waitFor(
    async () => (await list.evaluate((element) => element.scrollTop)) > 200,
    'the list to scroll',
  );
}

suite('App with lists longer than their columns', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('long-lists');
    const profile = path.join(folder, 'profile');
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first', {
      ...Object.fromEntries(
        Array.from({ length: 60 }, (_, index) => [
          `src/file${index}.txt`,
          `${index}\n`,
        ]),
      ),
      'long.txt': `${longLines.join('\n')}\n`,
    });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify(savedTabs([repository.root], repository.root)),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify(baseSettings),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'file0.txt' }).waitFor();
    await page
      .locator('.column')
      .nth(1)
      .locator('.virtual-rows')
      .evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    await page.locator('.diff-line', { hasText: firstLongLine }).waitFor();
  });

  afterAll(async () => {
    await app?.close();
    removeFolder(folder);
  });

  test('scrolls on the wheel over the folders pinned atop the files and the file header stuck atop the diff, which stays in place sideways, showing the scrollbar of the files over them', async () => {
    const files = page.locator('.column').nth(1).locator('.virtual-rows');
    const pinned = page.locator('.pinned-rows');
    await scrollsOnWheelOver(page, files, pinned);
    await pinned.hover();
    assert.strictEqual(
      await page.locator('.overlay-scrollbar.vertical.shown').count(),
      1,
    );

    const diff = page.locator('.diff-view .virtual-rows');
    const stuck = page.locator('.diff-stuck-header');
    await scrollsOnWheelOver(page, diff, stuck);
    await diff.evaluate((element) => {
      element.scrollLeft = 300;
    });
    await waitFor(
      async () => (await diff.evaluate((element) => element.scrollLeft)) > 0,
      'the diff to scroll sideways',
    );
    const header = await stuck.locator('.file-header').boundingBox();
    const view = await page.locator('.diff-view').boundingBox();
    assert.ok(header && view, 'the header or the diff has no box');
    assert.strictEqual(header.x, view.x);
  });

  test('keeps the scrollbar the pointer rests on where it is while another list scrolls, as the diff on the keys', async () => {
    const bar = page.locator('.overlay-scrollbar.vertical');
    await page.locator('.column').nth(1).locator('.virtual-rows').hover();
    await bar.hover();
    const shown = await bar.boundingBox();
    const diff = page.locator('.diff-view .virtual-rows');
    const top = await diff.evaluate((element) => element.scrollTop);
    await diff.focus();
    await page.keyboard.press('PageDown');
    await waitFor(
      async () => (await diff.evaluate((element) => element.scrollTop)) > top,
      'the diff to scroll',
    );
    await page.evaluate(
      () =>
        new Promise((drawn) =>
          requestAnimationFrame(() => requestAnimationFrame(drawn)),
        ),
    );
    assert.ok(await bar.evaluate((element) => element.matches('.shown')));
    assert.deepStrictEqual(await bar.boundingBox(), shown);
  });
});

suite('App with several tabs', () => {
  test('moves a tab dragged past the middle of the next one while it is still dragged, keeping it under the pointer, opening it, and keeps that order once dropped', async () => {
    const folder = tempFolder('dragging-tabs');
    const profile = path.join(folder, 'profile');
    const roots: string[] = [];
    for (const name of ['first', 'second', 'third']) {
      const repository = await tempRepository(path.join(folder, name));
      await repository.commit(name);
      roots.push(repository.root);
    }
    fs.mkdirSync(profile, { recursive: true });
    const state = path.join(profile, 'state.json');
    fs.writeFileSync(state, JSON.stringify(savedTabs(roots, roots[1])));
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ tools: { git: { autoFetch: false } } }),
    );
    const app = await launchApp(profile);
    try {
      const page = await app.firstWindow();
      await page.locator('.commit', { hasText: 'second' }).waitFor();
      const names = () =>
        page.locator('.tabs .tab .tab-name').allTextContents();
      const dragged = page.locator('.tabs .tab', { hasText: 'first' });
      const start = await dragged.boundingBox();
      const next = await page
        .locator('.tabs .tab', { hasText: 'second' })
        .boundingBox();
      assert.ok(start && next);
      const pitch = next.x - start.x;
      const grab = 20;
      const y = start.y + start.height / 2;
      await page.mouse.move(start.x + grab, y);
      await page.mouse.down();
      await page.mouse.move(start.x + grab + pitch / 2 - 8, y, { steps: 8 });
      assert.deepStrictEqual(await names(), ['first', 'second', 'third']);
      const pointer = start.x + grab + pitch / 2 + 8;
      await page.mouse.move(pointer, y, { steps: 4 });
      assert.deepStrictEqual(await names(), ['second', 'first', 'third']);
      const held = await dragged.boundingBox();
      assert.ok(held);
      assert.ok(Math.abs(held.x - (pointer - grab)) < 1, String(held.x));
      await page.locator('.commit', { hasText: 'first' }).waitFor();
      await page.mouse.up();
      assert.deepStrictEqual(await names(), ['second', 'first', 'third']);
      await waitFor(() => {
        const saved: unknown = JSON.parse(fs.readFileSync(state, 'utf8'));
        const tabs: unknown = Reflect.get(Object(saved), 'tabs');
        return (
          Array.isArray(tabs) &&
          JSON.stringify(
            tabs.map((tab: unknown) => Reflect.get(Object(tab), 'root')),
          ) === JSON.stringify([roots[1], roots[0], roots[2]])
        );
      }, 'the order to be saved');
      assert.match((await dragged.getAttribute('class')) ?? '', /\bactive\b/);
    } finally {
      await closeOrKill(app);
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
          'Git Manager',
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
      const gone = await within(
        app.evaluate(({ BrowserWindow }) => {
          const contents = BrowserWindow.getAllWindows()[0].webContents;
          const went = new Promise<{ reason: string; exitCode: number }>(
            (resolve) =>
              contents.once('render-process-gone', (_event, details) =>
                resolve(details),
              ),
          );
          process.kill(contents.getOSProcessId(), 'SIGKILL');
          return went;
        }),
        'the page to go',
      );
      await waitFor(
        () =>
          fs
            .readFileSync(log, 'utf8')
            .includes(strings.log.pageGone(gone.reason, gone.exitCode)),
        'the page going to be logged',
      );
      const windowShowsTheHistoryAgain = () =>
        app.evaluate(async ({ BrowserWindow }) => {
          const contents = BrowserWindow.getAllWindows()[0].webContents;
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

const windowsNotedIn = (file: string) =>
  [
    "const { app } = require('electron');",
    "const { appendFileSync } = require('node:fs');",
    `const note = (what) => appendFileSync(${JSON.stringify(file)}, what + '\\n');`,
    "app.on('browser-window-created', (_event, window) => {",
    "  note(window.isVisible() ? 'shown' : 'created');",
    "  window.on('show', () => note('shown'));",
    '});',
  ].join('\n');

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

suite('App without git', () => {
  test('says it needs git, showing no window, whether its alert keeps it running or it quits by itself, with git kept off its PATH but the tools GTK runs to load the icon of the alert left on it, as Ubuntu 26.04 aborts without them', async () => {
    const folder = tempFolder('no-git');
    const profile = path.join(folder, 'profile');
    const log = path.join(profile, 'logs', 'Fastforward.log');
    const windows = path.join(folder, 'windows.txt');
    const noting = path.join(folder, 'noteWindows.cjs');
    fs.writeFileSync(noting, windowsNotedIn(windows));
    linkFromPath(toolsGtkRunsToLoadIcons, folder);
    const app = await launchApp(profile, {
      before: ['-r', noting],
      env: {
        ...process.env,
        PATH: folder,
        Path: folder,
        SHELL: path.join(folder, 'no-shell'),
        ELECTRON_ENABLE_STACK_DUMPING: 'true',
      },
    });
    const child = app.process();
    const exited = once(child, 'exit');
    let printed = '';
    for (const output of [child.stdout, child.stderr]) {
      output?.on('data', (chunk: Buffer) => {
        printed += chunk.toString();
      });
    }
    try {
      await waitFor(() => {
        try {
          return fs.readFileSync(log, 'utf8').includes('Install git');
        } catch {
          return false;
        }
      }, 'the missing git to be logged');
      const gitAlertHoldsTheMainProcess = process.platform === 'darwin';
      if (!gitAlertHoldsTheMainProcess) {
        await Promise.race([
          app.firstWindow().then(async (page) => {
            await page.waitForLoadState('load');
            await new Promise((resolve) => setTimeout(resolve, 500));
          }),
          exited,
        ]).catch(async (error: unknown) => {
          await within(exited, 'the app to quit').catch(() => {
            throw error;
          });
        });
      }
      assert.strictEqual(fs.readFileSync(windows, 'utf8'), 'created\n');
      if (child.exitCode !== null || child.signalCode !== null) {
        assert.deepStrictEqual(
          [child.exitCode, child.signalCode],
          [0, null],
          `The app quit with ${String(child.exitCode ?? child.signalCode)}, printing:\n${printed}`,
        );
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await exited;
      }
      await app.close();
      removeFolder(folder);
    }
  });
});

async function quitWithoutChromium(
  app: ElectronApplication,
  folder: string,
): Promise<void> {
  const quit = path.join(folder, 'quit');
  await app.evaluate(({ app: electronApp }, marker) => {
    electronApp.once('quit', () =>
      process.getBuiltinModule('node:fs').writeFileSync(marker, ''),
    );
    electronApp.quit();
  }, quit);
  await waitFor(() => fs.existsSync(quit), 'the app to quit');
}

function holdsStartLock(profile: string): boolean {
  return ['lockfile', 'SingletonLock'].some(
    (name) =>
      fs.lstatSync(path.join(profile, name), { throwIfNoEntry: false }) !==
      undefined,
  );
}

suite('App quitting', () => {
  test("stops the git it still runs, which would outlive it, by the end of its own quitting rather than Chromium's, which takes tens of seconds to end its processes on a busy machine", async () => {
    const folder = tempFolder('quitting');
    const profile = path.join(folder, 'profile');
    const alive = path.join(folder, 'alive').replaceAll('\\', '/');
    const stop = path.join(folder, 'stop').replaceAll('\\', '/');
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first');
    await repository.git('remote', 'add', 'origin', 'ssh://stalled.invalid/x');
    await repository.git(
      'config',
      'core.sshCommand',
      `i=0; while [ ! -e '${stop}' ]; do i=$((i + 1)); echo $i > '${alive}'; sleep 0.2; done; false`,
    );
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify(savedTabs([repository.root], repository.root)),
    );
    const app = await launchApp(profile);
    try {
      const page = await app.firstWindow();
      await page.locator('.commit', { hasText: 'first' }).waitFor();
      await page.getByTitle(strings.navigation.fetch, { exact: true }).click();
      await waitFor(() => fs.existsSync(alive), 'git to fetch');
      await quitWithoutChromium(app, folder);
      const counted = fs.readFileSync(alive, 'utf8');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      assert.strictEqual(fs.readFileSync(alive, 'utf8'), counted);
    } finally {
      fs.writeFileSync(stop, '');
      await closeOrKill(app);
      removeFolder(folder);
    }
  });

  test("stops a round of background fetches, starting no other fetch and not saying the one it stopped failed, by the end of its own quitting rather than Chromium's", async () => {
    const folder = tempFolder('quitting-round');
    const profile = path.join(folder, 'profile');
    const stop = path.join(folder, 'stop').replaceAll('\\', '/');
    const alive = (name: string) =>
      path.join(folder, `${name}-alive`).replaceAll('\\', '/');
    const roots: string[] = [];
    for (const name of ['first', 'second']) {
      const repository = await tempRepository(path.join(folder, name));
      await repository.commit(name);
      await repository.git(
        'remote',
        'add',
        'origin',
        'ssh://stalled.invalid/x',
      );
      await repository.git(
        'config',
        'core.sshCommand',
        `while [ ! -e '${stop}' ]; do echo > '${alive(name)}'; sleep 0.2; done; false`,
      );
      roots.push(repository.root);
    }
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify(savedTabs(roots, roots[0])),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ tools: { git: { autoFetch: false } } }),
    );
    const app = await launchApp(profile);
    try {
      const page = await app.firstWindow();
      await page.locator('.commit', { hasText: 'first' }).waitFor();
      await page
        .getByTitle(
          strings.navigation.fetchEvery(
            defaultSettings().tools.git.autoFetchMinutes,
          ),
        )
        .click();
      await waitFor(() => fs.existsSync(alive('first')), 'git to fetch');
      await quitWithoutChromium(app, folder);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      assert.ok(!fs.existsSync(alive('second')));
      assert.doesNotMatch(
        fs.readFileSync(path.join(profile, 'logs', 'Fastforward.log'), 'utf8'),
        new RegExp(strings.log.fetchFailed),
      );
    } finally {
      fs.writeFileSync(stop, '');
      await closeOrKill(app);
      removeFolder(folder);
    }
  });

  test('starts again while it waits for a checkout to end as it quits', async () => {
    const folder = tempFolder('quitting-checkout');
    const profile = path.join(folder, 'profile');
    const hooks = path.join(folder, 'hooks');
    const alive = path.join(folder, 'alive').replaceAll('\\', '/');
    const stop = path.join(folder, 'stop').replaceAll('\\', '/');
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first');
    await repository.commit('second');
    await repository.git('branch', 'other', 'HEAD~1');
    fs.mkdirSync(hooks);
    fs.writeFileSync(
      path.join(hooks, 'post-checkout'),
      `#!/bin/sh\nwhile [ ! -e '${stop}' ]; do echo > '${alive}'; sleep 0.2; done\n`,
      { mode: 0o755 },
    );
    await repository.git('config', 'core.hooksPath', hooks);
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify(savedTabs([repository.root], repository.root)),
    );
    const app = await launchApp(profile);
    let again: ElectronApplication | undefined;
    try {
      const page = await app.firstWindow();
      await page
        .locator('.commit .badge.branch', { hasText: 'other' })
        .click({ button: 'right' });
      await page
        .locator('.context-menu .menu-item', {
          hasText: strings.commits.checkout,
        })
        .click();
      await waitFor(() => fs.existsSync(alive), 'the checkout to run');
      assert.ok(holdsStartLock(profile));
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].close(),
      );
      await waitFor(
        () => !holdsStartLock(profile),
        'the app to let another start',
      );
      again = await launchApp(profile);
      const shown = await again.firstWindow();
      await shown.locator('.commit', { hasText: 'second' }).waitFor();
    } finally {
      fs.writeFileSync(stop, '');
      if (again) {
        await closeOrKill(again);
      }
      await closeOrKill(app);
      removeFolder(folder);
    }
  });
});
