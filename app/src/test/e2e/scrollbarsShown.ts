import type { ElectronApplication, Page } from 'playwright-core';
import { waitFor } from '../helpers/fixtures';

export type Axis = 'vertical' | 'horizontal';

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function barBoxIn(scroller: Element, axis: string): Box {
  const { left, top, width, height } = scroller.getBoundingClientRect();
  const style = getComputedStyle(scroller);
  return axis === 'vertical'
    ? {
        left: left + scroller.clientLeft + scroller.clientWidth,
        top: top + scroller.clientTop,
        width:
          width -
          scroller.clientLeft -
          scroller.clientWidth -
          (parseFloat(style.borderRightWidth) || 0),
        height: scroller.clientHeight,
      }
    : {
        left: left + scroller.clientLeft,
        top: top + scroller.clientTop + scroller.clientHeight,
        width: scroller.clientWidth,
        height:
          height -
          scroller.clientTop -
          scroller.clientHeight -
          (parseFloat(style.borderBottomWidth) || 0),
      };
}

export async function barOf(
  page: Page,
  selector: string,
  axis: Axis,
): Promise<{ readonly box: Box }> {
  const scroller = page.locator(selector).first();
  await scroller.waitFor();
  return { box: await scroller.evaluate(barBoxIn, axis) };
}

interface Parts {
  readonly start: Box;
  readonly end: Box;
  readonly thumb: Box | undefined;
}

function coverParts(axis: string): (Parts & { readonly cover: Box }) | null {
  const cover = document.querySelector(`.scrollbar-cover.${axis}.shown`);
  if (cover === null) {
    return null;
  }
  const part = (name: string): Box | undefined => {
    const element =
      name === 'cover'
        ? cover
        : cover.querySelector<HTMLElement>(`.scrollbar-${name}`);
    if (
      element === null ||
      (element instanceof HTMLElement && element.hidden)
    ) {
      return undefined;
    }
    const { left, top, width, height } = element.getBoundingClientRect();
    return { left, top, width, height };
  };
  const whole = part('cover');
  const start = part('start');
  const end = part('end');
  return whole && start && end
    ? { cover: whole, start, end, thumb: part('thumb') }
    : null;
}

export async function barParts(
  page: Page,
  box: Box,
  axis: Axis,
): Promise<Parts> {
  const at = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  let found: Parts | undefined;
  let last: unknown;
  let nudge = 0;
  await waitFor(async () => {
    nudge = 1 - nudge;
    await page.mouse.move(at.x + nudge, at.y + nudge);
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => setTimeout(resolve));
        }),
    );
    const parts = await page.evaluate(coverParts, axis);
    last = parts;
    if (
      parts === null ||
      parts.thumb === undefined ||
      Math.abs(parts.cover.left - box.left) > 1 ||
      Math.abs(parts.cover.top - box.top) > 1
    ) {
      return false;
    }
    found = parts;
    return true;
  }, `the ${axis} scrollbar to take the pointer`).catch(() => undefined);
  if (found === undefined) {
    last = await page.evaluate(
      ({ x, y }) => {
        const under = document.elementFromPoint(x, y);
        return `${String(under?.tagName)}.${String(under?.className)} in ${String(under?.parentElement?.className)}; covers ${[...document.querySelectorAll('.scrollbar-cover')].map((cover) => cover.className).join(', ')}`;
      },
      { x: box.left + box.width / 2, y: box.top + box.height / 2 },
    );
    throw new Error(
      `The ${axis} scrollbar at ${JSON.stringify(box)} took no pointer: ${JSON.stringify(last)}`,
    );
  }
  return found;
}

export async function paintedAt(
  app: ElectronApplication,
  page: Page,
  points: readonly { readonly x: number; readonly y: number }[],
): Promise<string[]> {
  const shot = await page.screenshot();
  const wide = await page.evaluate(() => window.innerWidth);
  return app.evaluate(
    ({ nativeImage }, { png, at, across }) => {
      const image = nativeImage.createFromBuffer(Buffer.from(png, 'base64'));
      const { width } = image.getSize();
      const scale = width / across;
      const bitmap = image.toBitmap();
      return at.map(({ x, y }) => {
        const from =
          (Math.round(y * scale) * width + Math.round(x * scale)) * 4;
        return [bitmap[from + 2], bitmap[from + 1], bitmap[from]]
          .map((part) => (part ?? 0).toString(16).padStart(2, '0'))
          .join('');
      });
    },
    { png: shot.toString('base64'), at: [...points], across: wide },
  );
}
