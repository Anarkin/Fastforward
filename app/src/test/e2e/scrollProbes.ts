import type { Locator, Page } from 'playwright-core';
import { waitFor } from '../helpers/fixtures';

export async function scrollPlaces(
  page: Page,
  list: Locator,
  scroll: () => Promise<void>,
): Promise<number[]> {
  await list.evaluate((element) => {
    const places: number[] = [];
    Reflect.set(window, 'scrollPlaces', places);
    Reflect.set(window, 'scrollRested', false);
    const record = () => {
      places.push(element.scrollTop);
      const resting = places.slice(-12);
      if (
        places.some((place) => place !== places[0]) &&
        resting.length === 12 &&
        resting.every((place) => place === resting[0])
      ) {
        Reflect.set(window, 'scrollRested', true);
        return;
      }
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
  await scroll();
  await waitFor(
    () => page.evaluate(() => Reflect.get(window, 'scrollRested') === true),
    'the list to come to rest',
  );
  return page.evaluate(() => {
    const places: unknown = Reflect.get(window, 'scrollPlaces');
    return Array.isArray(places) ? places.map(Number) : [];
  });
}

function boxSides(text: string): readonly number[] {
  const [top = 0, right = top, bottom = top, left = right] = text
    .trim()
    .split(/\s+/)
    .map(parseFloat);
  return [top, right, bottom, left];
}

function atEdge(inset = 0): boolean {
  return Math.abs(inset) < 0.01;
}

export function clippedCorner(clipPath: string): number {
  const shape = /^inset\(([^)]*?)(?: round ([^)]*))?\)$/.exec(clipPath);
  if (shape === null) {
    return 0;
  }
  const [, right, bottom] = boxSides(shape[1] ?? '');
  const [, , corner = 0] = boxSides(shape[2] ?? '0px');
  return atEdge(right) && atEdge(bottom) ? corner : 0;
}
