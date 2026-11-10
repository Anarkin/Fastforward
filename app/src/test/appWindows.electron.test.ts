import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../shared/strings';
import { closeOrKill, launchApp } from './appFixtures';
import { waitFor } from './fixtures';
import { removeFolder, tempFolder } from './repositories';

interface SavedBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function isBounds(value: unknown): value is SavedBounds {
  return (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    typeof value.x === 'number' &&
    'y' in value &&
    typeof value.y === 'number' &&
    'width' in value &&
    typeof value.width === 'number' &&
    'height' in value &&
    typeof value.height === 'number'
  );
}

function tabsIn(page: Page): Promise<number> {
  return page.locator('.tabs [role="tab"]').count();
}

function byPlace(a: SavedBounds, b: SavedBounds): number {
  return a.x - b.x || a.y - b.y;
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
  const windowsShown = async (count: number): Promise<Page[]> => {
    await waitFor(
      () => launched().windows().length === count,
      `${count} windows`,
    );
    const pages = launched().windows();
    await Promise.all(pages.map((page) => page.locator('.tabs').waitFor()));
    return pages;
  };

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
      hasText: strings.confirm.closeWindow,
    });
    await asked.waitFor();
    assert.strictEqual(launched().windows().length, 2);
    await asked
      .locator('.confirm-button.default')
      .evaluate((button: HTMLElement) => button.click());
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
    await opened
      .locator('.empty-state', { hasText: strings.app.noTab })
      .waitFor();
    const bounds = await launched().evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) => window.getNormalBounds()),
    );
    assert.strictEqual(new Set(bounds.map((each) => each.x)).size, 2);
  });

  test('brings every window back after a restart, where it was', async () => {
    await windowsShown(2);
    await closeOrKill(launched());
    app = undefined;
    const places = saved().windowPlaces;
    assert.ok(typeof places === 'object' && places !== null);
    const placed = Object.values(places).flatMap((place: unknown) =>
      typeof place === 'object' &&
      place !== null &&
      'bounds' in place &&
      isBounds(place.bounds)
        ? [place.bounds]
        : [],
    );
    assert.deepStrictEqual(Object.keys(places).toSorted(), ['1', '2']);

    app = await launchApp(profile);
    await windowsShown(2);
    const bounds = await launched().evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) => window.getNormalBounds()),
    );
    assert.deepStrictEqual(bounds.toSorted(byPlace), placed.toSorted(byPlace));
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
      .evaluate((item: HTMLElement) => item.click());
    await windowsShown(1);
    assert.strictEqual(await tabsIn(empty), 1);
  });
});
