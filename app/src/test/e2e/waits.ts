import type { Locator } from 'playwright-core';
import { waitFor } from '../helpers/fixtures';

export function waitForCount(
  locator: Locator,
  count: number,
  what: string,
): Promise<void> {
  return waitFor(
    async () => (await locator.count()) === count,
    `${count} ${what}`,
  );
}

export function waitForFocus(locator: Locator, what: string): Promise<void> {
  return waitFor(
    () => locator.evaluate((element) => element === document.activeElement),
    `${what} to be focused`,
  );
}
