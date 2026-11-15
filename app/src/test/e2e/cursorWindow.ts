import * as assert from 'node:assert';
import type { ElectronApplication, Page } from 'playwright-core';
import { waitFor } from '../helpers/fixtures';

export async function fitWindow(
  app: ElectronApplication,
  id: number,
): Promise<void> {
  const most = { width: 1360, height: 800 };
  const wanted = await app.evaluate(
    ({ BrowserWindow, screen }, [window, largest]) => {
      const shown = BrowserWindow.fromId(window);
      if (shown === null) {
        throw new Error('The window of the page is gone.');
      }
      const outer = shown.getBounds();
      const inner = shown.getContentBounds();
      const { workArea } = screen.getDisplayMatching(outer);
      const room = {
        width: workArea.width - outer.width + inner.width,
        height: workArea.height - outer.height + inner.height,
      };
      const size = {
        width: Math.min(largest.width, Math.floor(room.width / 8) * 8),
        height: Math.min(largest.height, Math.floor(room.height / 8) * 8),
      };
      shown.setPosition(workArea.x, workArea.y);
      shown.setContentSize(size.width, size.height);
      shown.focus();
      return size;
    },
    [id, most] as const,
  );
  const seen = () =>
    app.evaluate(({ BrowserWindow, screen }, window) => {
      const shown = BrowserWindow.fromId(window);
      const display = shown && screen.getDisplayMatching(shown.getBounds());
      return {
        content: shown?.getContentBounds(),
        workArea: display?.workArea,
        scale: display?.scaleFactor ?? 1,
      };
    }, id);
  let last = '';
  let since = Date.now();
  await waitFor(async () => {
    const { content } = await seen();
    const now = JSON.stringify([content?.width, content?.height]);
    if (now !== last) {
      last = now;
      since = Date.now();
    }
    return (
      now === JSON.stringify([wanted.width, wanted.height]) ||
      Date.now() - since > 1000
    );
  }, `the window to take ${wanted.width} by ${wanted.height}, or the size the system settles it in`).catch(
    async (error: unknown) => {
      throw new Error(`${String(error)}: ${JSON.stringify(await seen())}`);
    },
  );
  const { content, scale } = await seen();
  assert.ok(
    content !== undefined &&
      Number.isInteger(content.width * scale) &&
      Number.isInteger(content.height * scale),
    `The window settled at ${JSON.stringify(content)}, which is no size of whole device pixels at ${scale}, so its shots would be resampled`,
  );
}

export async function windowOfPage(
  app: ElectronApplication,
  page: Page,
): Promise<number> {
  await page.evaluate(() => {
    window.name = 'cursor-test';
  });
  return app.evaluate(async ({ BrowserWindow }) => {
    for (const each of BrowserWindow.getAllWindows()) {
      if (
        (await each.webContents.executeJavaScript('window.name')) ===
        'cursor-test'
      ) {
        return each.id;
      }
    }
    throw new Error('No window of the page');
  });
}

export async function focusColor(page: Page): Promise<number[]> {
  const color = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-focus)';
    document.body.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  });
  return (color.match(/\d+/g) ?? [])
    .slice(0, 3)
    .map(Number)
    .toSorted((a, b) => a - b);
}
