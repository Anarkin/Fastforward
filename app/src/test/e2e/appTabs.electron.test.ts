import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { closeOrKill, launchApp, savedTabs } from './appLaunch';
import { waitFor } from '../helpers/fixtures';
import { untilSettled } from './waits';
import { tempRepository } from '../helpers/repositories';
import { removeFolder, tempFolder } from '../helpers/tempFolders';

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

suite('App with a row of tabs', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('row-of-tabs');
    const profile = path.join(folder, 'profile');
    const roots = Array.from({ length: 12 }, (_, index) => {
      const root = path.join(folder, `folder${index}`);
      fs.mkdirSync(root, { recursive: true });
      return root;
    });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: roots.map((root, index) => ({
          id: String(index + 1),
          tool: 'commander',
          root,
        })),
        activeTab: '1',
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await page.locator('.tabs [role="tab"]').nth(11).waitFor();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  async function openedTab(): Promise<{
    strips: string[];
    strip: { left: number; right: number };
    tab: { left: number; right: number };
  }> {
    await page.evaluate(() => {
      const strip = document.querySelector('.tab-strip');
      const strips: string[] = [];
      Reflect.set(window, 'strips', strips);
      const record = () => {
        strips.push(strip?.className ?? '');
        if (strips.length < 60) {
          requestAnimationFrame(record);
        }
      };
      requestAnimationFrame(record);
    });
    await page.locator('.tab-add').click();
    await page
      .locator('.menu-item', { hasText: strings.tools.commander })
      .click();
    await waitFor(
      () =>
        page.evaluate(() => {
          const strips: unknown = Reflect.get(window, 'strips');
          return (
            Array.isArray(strips) &&
            strips.length >= 60 &&
            document.querySelector('.tab.opening') === null
          );
        }),
      'the opened tab to grow',
    );
    return page.evaluate(() => {
      const strip = document.querySelector('.tab-strip');
      const tab = document.querySelector('.tabs .tab.active');
      const inside = strip?.getBoundingClientRect();
      const padding = strip
        ? parseFloat(getComputedStyle(strip).paddingLeft)
        : 0;
      const box = tab?.getBoundingClientRect();
      const strips: unknown = Reflect.get(window, 'strips');
      return {
        strips: Array.isArray(strips) ? strips.map(String) : [],
        strip: {
          left: (inside?.left ?? 0) + padding,
          right: (inside?.right ?? 0) - padding,
        },
        tab: { left: box?.left ?? 0, right: box?.right ?? 0 },
      };
    });
  }

  test('grows a tab opened into a full row without the row taking the tabs for too many and back, which shifted them all while it grew', async () => {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .toSorted((a, b) => a.id - b.id)[0]
        ?.setContentSize(1000, 600);
    });
    const { strips } = await openedTab();
    assert.deepStrictEqual([...new Set(strips)], ['tab-strip']);
  });

  test('keeps a tab opened into a row of too many in view as it grows, rather than only where it started, at no width', async () => {
    const overflowing = page.locator('.tab-strip.overflowing');
    for (let opened = 0; (await overflowing.count()) === 0; opened++) {
      assert.ok(opened < 40, 'the row to take the tabs for too many');
      await openedTab();
    }
    await page.locator('.tabs [role="tab"]').first().click();
    const { strip, tab } = await openedTab();
    assert.ok(
      tab.left >= strip.left - 1 && tab.right <= strip.right + 1,
      JSON.stringify({ strip, tab }),
    );
  });
});

suite('App with a row of tabs too full for their names', () => {
  test('keeps every tab where it is as another is opened, every tab as narrow as the open one may be, as the open one kept the room of its close button where the others gave theirs up and moved them all as it changed', async () => {
    const folder = tempFolder('squeezed-tabs');
    const profile = path.join(folder, 'profile');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: Array.from({ length: 18 }, (_, index) => ({
          id: String(index + 1),
          tool: 'commander',
          root: folder,
        })),
        activeTab: '1',
      }),
    );
    const app = await launchApp(profile);
    try {
      const page = await app.firstWindow();
      const tabs = page.locator('.tabs .tab');
      await tabs.nth(17).waitFor();
      const boxes = () =>
        tabs.evaluateAll((all) =>
          all.map((tab) => {
            const { left, right } = tab.getBoundingClientRect();
            return [Math.round(left * 4) / 4, Math.round(right * 4) / 4];
          }),
        );
      const before = await untilSettled(boxes, 'the squeezed tabs to settle');
      await tabs.nth(4).click();
      await waitFor(
        async () =>
          (await tabs.nth(4).getAttribute('class'))?.includes('active') ===
          true,
        'the fifth tab to open',
      );
      assert.deepStrictEqual(
        await untilSettled(boxes, 'the tabs to settle again'),
        before,
      );
    } finally {
      await closeOrKill(app);
      removeFolder(folder);
    }
  });
});
