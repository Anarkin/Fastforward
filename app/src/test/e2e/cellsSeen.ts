import type { Page } from 'playwright-core';
import type { SeenRow } from '../../tools/viewer/page/cellsSeen';

export const seenRows = (page: Page): Promise<readonly SeenRow[]> =>
  page
    .locator('.cell-rows')
    .first()
    .evaluate((host) =>
      host instanceof HTMLElement ? (host.seenRows?.() ?? []) : [],
    );
