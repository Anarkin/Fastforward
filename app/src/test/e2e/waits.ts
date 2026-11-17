import type { Locator, Page } from 'playwright-core';
import { waitFor } from '../helpers/fixtures';

export const onceDrawn = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const withoutFrames = setTimeout(resolve, 250);
        requestAnimationFrame(() => {
          clearTimeout(withoutFrames);
          setTimeout(resolve);
        });
      }),
  );

export async function untilSettled<T>(
  read: () => Promise<T>,
  what: string,
  {
    quiet = 400,
    accepted = () => true,
    timeout,
  }: {
    readonly quiet?: number;
    readonly accepted?: (value: T) => boolean | Promise<boolean>;
    readonly timeout?: number;
  } = {},
): Promise<T> {
  let last = await read();
  let lastRead = JSON.stringify(last);
  let since = Date.now();
  let readsAlike = 1;
  await waitFor(
    async () => {
      const now = await read();
      const nowRead = JSON.stringify(now);
      if (nowRead === lastRead) {
        readsAlike += 1;
      } else {
        last = now;
        lastRead = nowRead;
        since = Date.now();
        readsAlike = 1;
      }
      return (
        Date.now() - since >= quiet && readsAlike >= 3 && (await accepted(now))
      );
    },
    what,
    timeout,
  );
  return last;
}

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
