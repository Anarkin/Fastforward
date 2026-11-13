import * as assert from 'node:assert';
import type { BrowserWindow } from 'electron';
import { suite, test } from 'vitest';
import { manyFolder } from './perfData';
import { launchedForPerf, measure, paced, perfData } from './perfFixtures';

suite('Frames of the window and its tabs', () => {
  const { repository, files } = perfData();
  const perf = launchedForPerf(
    {
      state: {
        tabs: [
          { id: '1', tool: 'git', root: repository },
          { id: '2', tool: 'commander', root: files },
          { id: '3', tool: 'git', root: repository },
        ],
        activeTab: '1',
      },
      settings: { scrolling: { smooth: true } },
    },
    (page) => page.locator('.commit').nth(30).waitFor(),
  );

  test('switching between a git and a commander tab with Ctrl+Tab', async () => {
    const { page } = perf();
    await page.locator('.tabs [role="tab"]').nth(1).click();
    await page
      .locator('.commander-row', { hasText: manyFolder })
      .first()
      .waitFor();
    await page.locator('.tabs [role="tab"]').nth(0).click();
    await page.locator('.commit').nth(30).waitFor();
    const result = await measure(perf(), 'tabs: switch with Ctrl+Tab', () =>
      paced(12, 250, () => page.keyboard.press('Control+Tab')),
    );
    assert.ok(result.frames.updates > 0);
  });

  test('resizing the window', async () => {
    const { app, page } = perf();
    await page.locator('.tabs [role="tab"]').nth(0).click();
    const window = await app.browserWindow(page);
    const result = await measure(perf(), 'window: resize', () =>
      window.evaluate(async (browserWindow: BrowserWindow) => {
        const bounds = browserWindow.getBounds();
        for (let step = 0; step < 90; step++) {
          browserWindow.setBounds({
            ...bounds,
            width:
              bounds.width - Math.round(300 * Math.abs(Math.sin(step / 15))),
          });
          await new Promise((resolve) => setTimeout(resolve, 16));
        }
        browserWindow.setBounds(bounds);
      }),
    );
    assert.ok(result.frames.updates > 0);
  });
});
