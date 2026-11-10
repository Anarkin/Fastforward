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

function tabsIn(page: Page): Promise<number> {
  return page.locator('.tabs [role="tab"]').count();
}

async function selectedIn(page: Page): Promise<string> {
  const selected = await page
    .locator('.tabs [role="tab"]')
    .evaluateAll((tabs) =>
      tabs.map((tab) => tab.getAttribute('aria-selected')),
    );
  return selected.join();
}

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

async function visiblePages(app: ElectronApplication): Promise<Page[]> {
  const pages = app.windows();
  const visible = await Promise.all(
    pages.map(async (page) => {
      try {
        return await (
          await app.browserWindow(page)
        ).evaluate((window) => !window.isDestroyed() && window.isVisible());
      } catch {
        return false;
      }
    }),
  );
  return pages.filter((_, index) => visible[index]);
}

async function shownWindows(
  app: ElectronApplication,
  count: number,
): Promise<Page[]> {
  await waitFor(
    async () => (await visiblePages(app)).length === count,
    `${count} windows`,
  );
  const pages = await visiblePages(app);
  await Promise.all(pages.map((page) => page.locator('.tabs').waitFor()));
  return pages;
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
      hasText: strings.confirm.closeWindow,
    });
    await asked.waitFor();
    assert.strictEqual((await visiblePages(launched())).length, 2);
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
    await opened
      .locator('.empty-state', { hasText: strings.app.noTab })
      .waitFor();
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

async function grabTab(page: Page, index: number) {
  const box = await page.locator('.tabs [role="tab"]').nth(index).boundingBox();
  assert.ok(box);
  const at = { x: box.x + 20, y: box.y + box.height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x, at.y + 80, { steps: 5 });
  return at;
}

function recordSelected(page: Page): Promise<void> {
  return page.evaluate(() => {
    const selected: string[] = [];
    Object.assign(window, { selected });
    const note = () => {
      const now = [...document.querySelectorAll('.tabs [role="tab"]')]
        .map((tab) => tab.getAttribute('aria-selected'))
        .join();
      if (selected.at(-1) !== now) {
        selected.push(now);
      }
    };
    note();
    const strip = document.querySelector('.tab-strip');
    if (strip !== null) {
      new MutationObserver(note).observe(strip, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-selected'],
      });
    }
  });
}

suite('App with tabs dragged between windows', () => {
  let folder: string;
  let app: ElectronApplication | undefined;

  const launched = (): ElectronApplication => {
    assert.ok(app);
    return app;
  };
  const contentOf = async (page: Page): Promise<SavedBounds> =>
    (await launched().browserWindow(page)).evaluate((window) =>
      window.getContentBounds(),
    );
  const byTabs = async (count: number): Promise<Page> => {
    const pages = await visiblePages(launched());
    const counts = await Promise.all(pages.map(tabsIn));
    const page = pages[counts.indexOf(count)];
    assert.ok(page, `a window with ${count} tabs`);
    return page;
  };
  const inFront = async (page: Page) => {
    const window = await launched().browserWindow(page);
    await launched().evaluate((electron) =>
      electron.app.focus({ steal: true }),
    );
    await window.evaluate((shown) => shown.focus());
    await waitFor(
      () => window.evaluate((shown) => shown.isFocused()),
      'the window to be in front',
    );
  };
  const explained = async (
    waiting: Promise<void>,
    at: { readonly x: number; readonly y: number },
    pages: Readonly<Record<string, Page>>,
  ) => {
    try {
      await waiting;
    } catch (error) {
      const windows = await launched().evaluate(({ BrowserWindow }) => {
        const focused = BrowserWindow.getFocusedWindow();
        return BrowserWindow.getAllWindows().map((window) => ({
          id: window.id,
          bounds: window.getBounds(),
          visible: window.isVisible(),
          opacity: window.getOpacity(),
          focused: window === focused,
          onTop: window.isAlwaysOnTop(),
        }));
      });
      const shown = await Promise.all(
        Object.entries(pages).map(async ([name, page]) => ({
          name,
          bounds: await contentOf(page),
          tabs: await tabsIn(page),
          selected: await page.evaluate(() =>
            'selected' in window ? window.selected : undefined,
          ),
        })),
      );
      throw new Error(
        `${error instanceof Error ? error.message : String(error)} ${JSON.stringify({ at, windows, shown })}`,
        { cause: error },
      );
    }
  };
  const sparesReady = () =>
    waitFor(
      async () =>
        (await launched().evaluate(
          ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
        )) > (await visiblePages(launched())).length,
      'a window kept ready for a tab torn off',
    );

  beforeAll(async () => {
    folder = tempFolder('dragged-tabs');
    const profile = path.join(folder, 'profile');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: ['1', '2', '3', '4'].map((id) => ({ id, tool: 'commander' })),
        windows: [
          { id: '1', tabs: ['1', '2', '3'], active: '1' },
          { id: '2', tabs: ['4'], active: '4' },
        ],
        windowPlaces: {
          '1': {
            bounds: { x: 0, y: 0, width: 1280, height: 720 },
            maximized: false,
          },
          '2': {
            bounds: { x: 160, y: 240, width: 1280, height: 720 },
            maximized: false,
          },
        },
      }),
    );
    app = await launchApp(profile);
    await shownWindows(app, 2);
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  test('tears a tab off its window into the row of tabs of another, which shows it before it is dropped, and drops it there', async () => {
    await sparesReady();
    const source = await byTabs(3);
    const target = await byTabs(1);
    await inFront(target);
    await recordSelected(target);
    await grabTab(source, 1);
    const sourceContent = await contentOf(source);
    const targetContent = await contentOf(target);
    const row = await target.locator('.tabs .tab-list').boundingBox();
    assert.ok(row);
    const at = {
      x: targetContent.x + row.x + row.width - 60,
      y: targetContent.y + row.y + row.height / 2,
    };
    await source.mouse.move(at.x - sourceContent.x, at.y - sourceContent.y, {
      steps: 10,
    });
    await explained(
      waitFor(
        async () => (await selectedIn(target)) === 'false,true',
        'the tab to show in the other window before it is dropped',
      ),
      at,
      { source, target },
    );
    await source.mouse.up();
    await waitFor(
      async () => (await tabsIn(target)) === 2 && (await tabsIn(source)) === 2,
      'the tab to be in the other window',
    );
    await shownWindows(launched(), 2);
  });

  test('tears a tab off into a window of its own when it is dropped over no row of tabs', async () => {
    await sparesReady();
    const source = await byTabs(2);
    const at = await grabTab(source, 1);
    await source.mouse.move(at.x + 200, at.y + 300, { steps: 10 });
    await source.mouse.up();
    const pages = await shownWindows(launched(), 3);
    const counts = await Promise.all(pages.map(tabsIn));
    assert.deepStrictEqual(
      counts.toSorted((a, b) => a - b),
      [1, 1, 2],
    );
  });

  test('puts a tab torn off back where it was on Escape', async () => {
    await sparesReady();
    const source = await byTabs(2);
    const names = await source
      .locator('.tabs [role="tab"] .tab-name')
      .allTextContents();
    await grabTab(source, 0);
    await source.mouse.move(400, 400, { steps: 5 });
    await source.keyboard.press('Escape');
    await source.mouse.up();
    await waitFor(
      async () =>
        JSON.stringify(
          await source
            .locator('.tabs [role="tab"] .tab-name')
            .allTextContents(),
        ) === JSON.stringify(names),
      'the tab to be back',
    );
    await shownWindows(launched(), 3);
  });

  test('takes a tab dragged over the row of tabs of another window out of it from the place it was shown there, rather than from the place it was put', async () => {
    await sparesReady();
    const source = await byTabs(2);
    const target = await byTabs(1);
    await inFront(target);
    await target.evaluate(() => {
      const strip = document.querySelector('.tab-strip');
      const leaving: number[] = [];
      Object.assign(window, { leaving });
      if (strip !== null) {
        new MutationObserver(() =>
          [...strip.children].forEach((child, index) => {
            if (child.classList.contains('closing')) {
              leaving.push(index);
            }
          }),
        ).observe(strip, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class'],
        });
      }
    });
    await recordSelected(target);
    await grabTab(source, 1);
    const sourceContent = await contentOf(source);
    const targetContent = await contentOf(target);
    const first = await target
      .locator('.tabs [role="tab"]')
      .first()
      .boundingBox();
    assert.ok(first);
    const over = {
      x: targetContent.x + first.x + 20 - sourceContent.x,
      y: targetContent.y + first.y + first.height / 2 - sourceContent.y,
    };
    await source.mouse.move(over.x, over.y, { steps: 10 });
    await explained(
      waitFor(
        async () => (await selectedIn(target)) === 'true,false',
        'the tab to show first in the other window',
      ),
      { x: over.x + sourceContent.x, y: over.y + sourceContent.y },
      { source, target },
    );
    await source.mouse.move(over.x, over.y + 300, { steps: 5 });
    await waitFor(
      async () => (await tabsIn(target)) === 1,
      'the tab to leave the other window',
    );
    const leaving = await target.evaluate(() =>
      'leaving' in window && Array.isArray(window.leaving)
        ? window.leaving.filter((index) => typeof index === 'number')
        : [],
    );
    assert.deepStrictEqual([...new Set(leaving)], [0]);
    await source.keyboard.press('Escape');
    await source.mouse.up();
    await waitFor(
      async () => (await tabsIn(source)) === 2,
      'the tab to be back where it was',
    );
    await shownWindows(launched(), 3);
  });
});
