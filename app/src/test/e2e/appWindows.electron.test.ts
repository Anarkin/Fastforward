import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { closeOrKill, launchApp } from './appLaunch';
import { waitFor } from '../helpers/fixtures';
import { untilSettled } from './waits';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import {
  shownWindows,
  tabsIn,
  visiblePages,
  type SavedBounds,
} from './windowFixtures';
import { appIdsOf, windowHandles } from './windowAppIds';
import { writeSettings } from './settingsWritten';
import { taskbarBase } from '../../boot/taskbarIds';

function byPlace(a: SavedBounds, b: SavedBounds): number {
  return a.x - b.x || a.y - b.y;
}

const nearEnough = 64;

function near(a: SavedBounds, b: SavedBounds | undefined): boolean {
  return (
    b !== undefined &&
    [a.x - b.x, a.y - b.y, a.width - b.width, a.height - b.height].every(
      (difference) => Math.abs(difference) <= nearEnough,
    )
  );
}

function visibleBounds(app: ElectronApplication): Promise<SavedBounds[]> {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((window) => window.isVisible())
      .map((window) => window.getNormalBounds()),
  );
}

suite('App with several windows', () => {
  let folder: string;
  let profile: string;
  let app: ElectronApplication | undefined;

  const stateFile = () => path.join(profile, 'state.json');
  const saved = (): Record<string, unknown> => {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
      return typeof parsed === 'object' && parsed !== null ? { ...parsed } : {};
    } catch {
      return {};
    }
  };
  const savedIds = (key: string) => {
    const list = saved()[key];
    return Array.isArray(list)
      ? list.flatMap((item: unknown) =>
          typeof item === 'object' && item !== null && 'id' in item
            ? [item.id]
            : [],
        )
      : [];
  };
  const launched = (): ElectronApplication => {
    assert.ok(app);
    return app;
  };
  const windowsShown = (count: number): Promise<Page[]> =>
    shownWindows(launched(), count);

  beforeAll(async () => {
    folder = tempFolder('windows');
    profile = path.join(folder, 'profile');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      stateFile(),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'commander' },
          { id: '2', tool: 'commander' },
          { id: '3', tool: 'terminal' },
        ],
        windows: [
          { id: '1', tabs: ['1'], active: '1' },
          { id: '2', tabs: ['2', '3'], active: '2' },
        ],
        windowPlaces: {
          '1': {
            bounds: { x: 0, y: 40, width: 900, height: 600 },
            maximized: false,
          },
          '2': {
            bounds: { x: 40, y: 80, width: 900, height: 600 },
            maximized: false,
          },
        },
      }),
    );
    app = await launchApp(profile);
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  test('opens a window for each window saved, each showing its own tabs', async () => {
    const pages = await windowsShown(2);
    const counts = await Promise.all(pages.map(tabsIn));
    assert.deepStrictEqual(
      counts.toSorted((a, b) => a - b),
      [1, 2],
    );
  });

  test('asks before closing a window that holds a terminal, and closes it with its tabs once that is confirmed', async () => {
    const pages = await windowsShown(2);
    const counts = await Promise.all(pages.map(tabsIn));
    const second = pages[counts.indexOf(2)];
    assert.ok(second);
    await (
      await launched().browserWindow(second)
    ).evaluate((window) => window.close());
    const asked = second.locator('.confirm-popup', {
      hasText: strings.confirm.closeWindowTitle,
    });
    await asked.waitFor();
    assert.strictEqual((await visiblePages(launched())).length, 2);
    await asked
      .locator('.confirm-button:not(.default)')
      .last()
      .evaluate((button: HTMLElement) => button.click());
    await asked.waitFor({ state: 'detached' });
    const window = await launched().browserWindow(second);
    await window.evaluate((shown) => shown.minimize());
    await waitFor(
      () => window.evaluate((shown) => shown.isMinimized()),
      'the window to be minimized',
    );
    await window.evaluate((shown) => shown.close());
    await asked.waitFor();
    await waitFor(
      () => window.evaluate((shown) => !shown.isMinimized()),
      'the window asking to be shown again, as a question in a minimized window showed nothing',
    );
    await asked
      .locator('.confirm-button.default')
      .evaluate((button: HTMLElement) => button.click())
      .catch(() => undefined);
    await windowsShown(1);
    await waitFor(
      () =>
        JSON.stringify(savedIds('windows')) === JSON.stringify(['1']) &&
        JSON.stringify(savedIds('tabs')) === JSON.stringify(['1']),
      'the window and its tabs to be gone from the state',
    );
  });

  test('opens a new window with no tab beside the one in front on Mod+N', async () => {
    const [first] = await windowsShown(1);
    assert.ok(first);
    await first.keyboard.press('ControlOrMeta+N');
    const pages = await windowsShown(2);
    const opened = pages.find((page) => page !== first);
    assert.ok(opened);
    await opened.locator('.tabs').waitFor();
    await waitFor(
      async () => (await opened.locator('.tabs .tab').count()) === 0,
      'a window with no tab',
    );
    const bounds = await visibleBounds(launched());
    assert.strictEqual(
      new Set(bounds.map((each) => `${each.x},${each.y}`)).size,
      2,
    );
  });

  test('brings every window back after a restart where it was, or as near as the screen and the system let it be', async () => {
    await windowsShown(2);
    const placed = await visibleBounds(launched());
    await closeOrKill(launched());
    app = undefined;
    const places = saved().windowPlaces;
    assert.ok(typeof places === 'object' && places !== null);
    assert.deepStrictEqual(Object.keys(places).toSorted(), ['1', '2']);

    app = await launchApp(profile);
    await windowsShown(2);
    const restored = (await visibleBounds(launched())).toSorted(byPlace);
    const before = placed.toSorted(byPlace);
    assert.strictEqual(restored.length, before.length);
    restored.forEach((each, index) =>
      assert.ok(
        near(each, before[index]),
        JSON.stringify([each, before[index]]),
      ),
    );
  });

  test('moves a tab into another window from its menu, closing the window it leaves once it held no other tab', async () => {
    const pages = await windowsShown(2);
    const counts = await Promise.all(pages.map(tabsIn));
    const holding = pages[counts.indexOf(1)];
    const empty = pages[counts.indexOf(0)];
    assert.ok(holding && empty);
    await holding.locator('.tabs [role="tab"]').click({ button: 'right' });
    const menu = holding.locator('.context-menu');
    assert.ok(
      await menu
        .locator('.menu-item', { hasText: strings.tabs.moveToNewWindow })
        .isDisabled(),
    );
    await menu
      .locator('.menu-item', { hasText: strings.tabs.moveToWindow })
      .hover();
    await menu
      .locator('.menu-item', { hasText: strings.tabs.noTabWindow })
      .evaluate((item: HTMLElement) => item.click())
      .catch(() => undefined);
    await windowsShown(1);
    assert.strictEqual(await tabsIn(empty), 1);
  });
});

suite('App window saved at 125%', () => {
  test.runIf(process.platform === 'win32')(
    'opens a window at the size it was saved at, never larger, as Windows grew a window saved 1400 by 800 to 1406 by 804 at 125%, and so on at every start, and smaller only by what fitting it down to whole cells of the terminal takes, less than two cells as a fraction of a pixel moves the room around the screen at 125%',
    async () => {
      const folder = tempFolder('window-size');
      const profile = path.join(folder, 'profile');
      const saved = { x: 40, y: 30, width: 1300, height: 740 };
      fs.mkdirSync(profile, { recursive: true });
      fs.writeFileSync(
        path.join(profile, 'state.json'),
        JSON.stringify({
          tabs: [{ id: '1', tool: 'commander' }],
          windows: [{ id: '1', tabs: ['1'], active: '1' }],
          windowPlaces: { '1': { bounds: saved, maximized: false } },
        }),
      );
      const app = await launchApp(profile, { scale: 1.25 });
      try {
        const page = await app.firstWindow();
        await waitFor(
          async () => (await visibleBounds(app)).length === 1,
          'the window to show',
        );
        const [opened] = await untilSettled(
          () => visibleBounds(app),
          'the window to be fitted',
        );
        const cell = await page.evaluate(() => {
          const box = document
            .querySelector('.cell-grid-cell')
            ?.getBoundingClientRect();
          return { width: box?.width ?? 0, height: box?.height ?? 0 };
        });
        assert.ok(opened);
        const smaller = {
          width: saved.width - opened.width,
          height: saved.height - opened.height,
        };
        assert.deepStrictEqual(
          {
            x: opened.x,
            y: opened.y,
            width: smaller.width >= 0 && smaller.width < 2 * cell.width + 1,
            height: smaller.height >= 0 && smaller.height < 2 * cell.height + 1,
          },
          { x: saved.x, y: saved.y, width: true, height: true },
        );
      } finally {
        await closeOrKill(app);
        removeFolder(folder);
      }
    },
  );
});

suite('App windows on the taskbar', () => {
  test.runIf(process.platform === 'win32')(
    "gives each window a button of its own on the taskbar, the first under the app's ID so a pinned Fastforward holds it, groups them all under it once `windows.taskbarButtonPerWindow` is off, and parts them again once it is on, at once as the settings are saved",
    async () => {
      const folder = tempFolder('taskbar');
      const profile = path.join(folder, 'profile');
      fs.mkdirSync(profile, { recursive: true });
      fs.writeFileSync(
        path.join(profile, 'state.json'),
        JSON.stringify({
          tabs: [
            { id: '1', tool: 'commander' },
            { id: '2', tool: 'commander' },
          ],
          windows: [
            { id: '1', tabs: ['1'], active: '1' },
            { id: '2', tabs: ['2'], active: '2' },
          ],
        }),
      );
      const app = await launchApp(profile);
      const base = taskbarBase(true);
      const ids = async () =>
        appIdsOf(await windowHandles(app)).toSorted((one, other) =>
          String(one).localeCompare(String(other)),
        );
      try {
        const [page] = await shownWindows(app, 2);
        assert.ok(page);
        const parted = [base, `${base}.window.2`];
        await waitFor(
          async () => (await ids()).join() === parted.join(),
          'a button for each window',
        );
        await writeSettings(page, profile, {
          windows: { taskbarButtonPerWindow: false },
        });
        await waitFor(
          async () => (await ids()).join() === [base, base].join(),
          'one button for both windows',
        );
        await writeSettings(page, profile, {
          windows: { taskbarButtonPerWindow: true },
        });
        await waitFor(
          async () => (await ids()).join() === parted.join(),
          'a button for each window again',
        );
      } finally {
        await closeOrKill(app);
        removeFolder(folder);
      }
    },
  );

  test.runIf(process.platform === 'win32')(
    'badges the button of a window whose tabs are all of one tool with the icon of the tool, 16 pixels at any scale, as the taskbar takes a badge as 16 pixels and scales it itself, and none of a window of several tools, nor any while the windows share one button',
    async () => {
      const folder = tempFolder('badge');
      const profile = path.join(folder, 'profile');
      fs.mkdirSync(profile, { recursive: true });
      fs.writeFileSync(
        path.join(profile, 'state.json'),
        JSON.stringify({
          tabs: [
            { id: '1', tool: 'commander' },
            { id: '2', tool: 'commander' },
            { id: '3', tool: 'terminal' },
          ],
          windows: [
            { id: '1', tabs: ['1'], active: '1' },
            { id: '2', tabs: ['2', '3'], active: '2' },
          ],
        }),
      );
      const app = await launchApp(profile);
      try {
        const [page] = await shownWindows(app, 2);
        assert.ok(page);
        await app.evaluate(({ BrowserWindow }) => {
          const badges = new Map<number, string>();
          Reflect.set(globalThis, 'badges', badges);
          for (const window of BrowserWindow.getAllWindows()) {
            const badge = window.setOverlayIcon.bind(window);
            window.setOverlayIcon = (overlay, description) => {
              badges.set(
                window.id,
                overlay === null
                  ? 'none'
                  : `${JSON.stringify(overlay.getSize())} ${overlay.isEmpty() ? 'empty' : 'drawn'} ${description}`,
              );
              badge(overlay, description);
            };
          }
        });
        const badges = async () =>
          (
            await app.evaluate(() => {
              const shown: unknown = Reflect.get(globalThis, 'badges');
              return shown instanceof Map
                ? [...shown.values()].map(String)
                : [];
            })
          ).toSorted();
        await writeSettings(page, profile, {
          windows: { taskbarButtonPerWindow: false },
        });
        await waitFor(
          async () => (await badges()).join() === ['none', 'none'].join(),
          'no badge while the windows share one button',
        );
        await writeSettings(page, profile, {
          windows: { taskbarButtonPerWindow: true },
        });
        const commander = `{"width":16,"height":16} drawn ${strings.tools.commander}`;
        await waitFor(
          async () =>
            (await badges()).join() === [commander, 'none'].toSorted().join(),
          'the badge of the commander on the window of commander tabs alone',
        );
      } finally {
        await closeOrKill(app);
        removeFolder(folder);
      }
    },
  );
});
