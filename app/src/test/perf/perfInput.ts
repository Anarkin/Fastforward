import type { Locator, Page } from 'playwright-core';

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function centerOf(
  page: Page,
  region: Locator,
): Promise<{ readonly x: number; readonly y: number }> {
  const box = await region.boundingBox();
  if (box === null) {
    throw new Error('The region to scroll is not shown');
  }
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  return center;
}

export async function paced(
  count: number,
  gapMs: number,
  step: (index: number) => Promise<void>,
): Promise<void> {
  const start = performance.now();
  for (let index = 0; index < count; index++) {
    const wait = start + index * gapMs - performance.now();
    if (wait > 0) {
      await sleep(wait);
    }
    await step(index);
  }
}

export async function wheelNotches(
  page: Page,
  region: Locator,
  notches: number,
  gapMs = 40,
): Promise<void> {
  await centerOf(page, region);
  await paced(notches, gapMs, () => page.mouse.wheel(0, 100));
}

const mouseInput = 2;

export async function touchpadScroll(
  page: Page,
  region: Locator,
  pixels: number,
  pixelsPerSecond: number,
): Promise<void> {
  const { x, y } = await centerOf(page, region);
  await page.evaluate(
    ([atX, atY, by, speed, source]) =>
      new Promise<void>((resolve, reject) => {
        const chrome: unknown = Reflect.get(window, 'chrome');
        const benchmarking: unknown =
          typeof chrome === 'object' && chrome !== null
            ? Reflect.get(chrome, 'gpuBenchmarking')
            : undefined;
        const smoothScrollBy: unknown =
          typeof benchmarking === 'object' && benchmarking !== null
            ? Reflect.get(benchmarking, 'smoothScrollBy')
            : undefined;
        if (typeof smoothScrollBy !== 'function') {
          reject(
            new Error(
              'Scrolling as a touchpad needs the app started with --enable-gpu-benchmarking',
            ),
          );
          return;
        }
        Reflect.apply(smoothScrollBy, benchmarking, [
          by,
          resolve,
          atX,
          atY,
          source,
          'down',
          speed,
          true,
        ]);
      }),
    [x, y, pixels, pixelsPerSecond, mouseInput] as const,
  );
}

export function heldKey(
  page: Page,
  key: string,
  presses: number,
  gapMs = 33,
): Promise<void> {
  return paced(presses, gapMs, () => page.keyboard.press(key));
}

export async function dragged(
  page: Page,
  from: { readonly x: number; readonly y: number },
  by: { readonly x: number; readonly y: number },
  steps = Number(process.env.FASTFORWARD_PERF_STEPS ?? 150),
  gapMs = 8,
): Promise<void> {
  await paced(steps, gapMs, (index) =>
    page.mouse.move(
      from.x + (by.x * (index + 1)) / steps,
      from.y + (by.y * (index + 1)) / steps,
    ),
  );
  await paced(steps, gapMs, (index) =>
    page.mouse.move(
      from.x + (by.x * (steps - index - 1)) / steps,
      from.y + (by.y * (steps - index - 1)) / steps,
    ),
  );
}
