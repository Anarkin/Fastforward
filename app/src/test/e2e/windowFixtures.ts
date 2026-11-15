import type { ElectronApplication, Page } from 'playwright-core';
import { waitFor } from '../helpers/fixtures';

export interface SavedBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function tabsIn(page: Page): Promise<number> {
  return page.locator('.tabs [role="tab"]').count();
}

export async function visiblePages(app: ElectronApplication): Promise<Page[]> {
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

export async function shownWindows(
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
