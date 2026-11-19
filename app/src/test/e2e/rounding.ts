import type { Page } from 'playwright-core';
import { onTestFinished } from 'vitest';

export async function rounded(page: Page): Promise<void> {
  onTestFinished(async () => {
    await page.evaluate(() => {
      document.body.style.removeProperty('--radius');
    });
  });
  await page.evaluate(() => {
    document.body.style.setProperty('--radius', '6px');
  });
}
