import * as assert from 'node:assert';
import type { Locator, Page } from 'playwright-core';
import { waitFor } from '../helpers/fixtures';
import { longestFrame } from './scrollingPlaces';

export async function scrollPlaces(
  page: Page,
  list: Locator,
  scroll: () => Promise<void>,
): Promise<number[]> {
  await list.evaluate((element) => {
    const places: number[] = [];
    const times: number[] = [];
    Reflect.set(window, 'scrollPlaces', places);
    Reflect.set(window, 'scrollTimes', times);
    Reflect.set(window, 'scrollRested', false);
    let moved = performance.now();
    const record = () => {
      if (element.scrollTop !== places.at(-1)) {
        moved = performance.now();
      }
      places.push(element.scrollTop);
      times.push(performance.now());
      if (
        places.some((place) => place !== places[0]) &&
        performance.now() - moved > 300
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

export async function scrollStalled(page: Page): Promise<boolean> {
  const { places, times } = await page.evaluate(() => {
    const placed: unknown = Reflect.get(window, 'scrollPlaces');
    const timed: unknown = Reflect.get(window, 'scrollTimes');
    return {
      places: Array.isArray(placed) ? placed.map(Number) : [],
      times: Array.isArray(timed) ? timed.map(Number) : [],
    };
  });
  const lastMove = places.findLastIndex(
    (place, at) => at > 0 && place !== places[at - 1],
  );
  return times
    .slice(1, lastMove + 1)
    .some((time, at) => time - (times[at] ?? time) > longestFrame);
}

function settledTop(list: Locator): Promise<number | undefined> {
  return list.evaluate(
    (element) =>
      new Promise<number | undefined>((settled) => {
        const top = element.scrollTop;
        setTimeout(
          () => settled(element.scrollTop === top ? top : undefined),
          250,
        );
      }),
  );
}

function rowBelowCover(list: Locator, rows: string): Promise<boolean> {
  return list.evaluate((element, selector) => {
    const covered =
      Number.parseFloat(getComputedStyle(element).scrollPaddingTop) || 0;
    const top =
      element.getBoundingClientRect().top +
      (Number.parseFloat(getComputedStyle(element).borderTopWidth) || 0);
    return [...element.querySelectorAll(selector)].some(
      (row) => Math.abs(row.getBoundingClientRect().top - top - covered) < 0.01,
    );
  }, rows);
}

function rowsOffPixels(list: Locator, rows: string): Promise<string[]> {
  return list.evaluate((element, selector) => {
    const ratio = devicePixelRatio;
    const top =
      element.getBoundingClientRect().top +
      (Number.parseFloat(getComputedStyle(element).borderTopWidth) || 0) -
      element.scrollTop;
    const covered =
      Number.parseFloat(getComputedStyle(element).scrollPaddingTop) || 0;
    return [...element.querySelectorAll(selector)].flatMap((row) => {
      const stop = (row.getBoundingClientRect().top - top - covered) * ratio;
      return Math.abs(stop - Math.round(stop)) < 0.01
        ? []
        : [`${row.textContent?.slice(0, 40) ?? ''} at ${stop / ratio}px`];
    });
  }, rows);
}

export async function wheelsByWholeRows(
  page: Page,
  list: Locator,
  rows: string,
): Promise<void> {
  await list.evaluate((element) => {
    element.scrollTop = 0;
  });
  assert.deepStrictEqual(
    await rowsOffPixels(list, rows),
    [],
    'every row a whole number of device pixels below the cover, so each stop lands its row on the same pixel',
  );
  const box = await list.boundingBox();
  assert.ok(box, 'the list has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (const delta of [100, 100, -100]) {
    const before = await list.evaluate((element) => element.scrollTop);
    await page.mouse.wheel(0, delta);
    await waitFor(
      async () =>
        (await settledTop(list)) !== before &&
        (await rowBelowCover(list, rows)),
      `a row starting below what covers the top of the list after the wheel turned by ${delta}`,
    );
  }
  const left = () =>
    list.evaluate(
      (element) =>
        element.scrollHeight - element.clientHeight - element.scrollTop,
    );
  for (let notch = 0; notch < 1000 && (await left()) >= 1; notch++) {
    await page.mouse.wheel(0, 100);
  }
  await waitFor(
    async () =>
      (await settledTop(list)) !== undefined &&
      (await rowBelowCover(list, rows)),
    'a row starting below what covers the top of the list at its end',
  );
  assert.ok((await left()) < 1, `the list ends ${await left()} pixels below`);
}
