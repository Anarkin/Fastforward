import type { Page } from 'playwright-core';
import type { SeenGlyph, SeenRow } from '../../components/cells/page/seen';
import { waitFor } from '../helpers/fixtures';

export const viewerRows =
  '.viewer-rows :is(.cell-rows[data-rows]:has(canvas), .viewer-row)';

export const seenRows = (page: Page): Promise<readonly SeenRow[]> =>
  page.evaluate(() => {
    const host = document.querySelector('.viewer-rows .cell-rows');
    return host instanceof HTMLElement && host.querySelector('canvas') !== null
      ? (host.seenRows?.() ?? [])
      : [];
  });

export const viewerTexts = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const host = document.querySelector('.viewer-rows .cell-rows');
    return host instanceof HTMLElement &&
      host.seenRows !== undefined &&
      host.querySelector('canvas') !== null
      ? host.seenRows().map(({ text }) => text)
      : [...document.querySelectorAll('.viewer-rows .viewer-row')].map(
          (row) => row.textContent ?? '',
        );
  });

export const viewerMarks = (page: Page): Promise<[string, boolean][]> =>
  page.evaluate(() => {
    const host = document.querySelector('.viewer-rows .cell-rows');
    return host instanceof HTMLElement &&
      host.seenRows !== undefined &&
      host.querySelector('canvas') !== null
      ? host
          .seenRows()
          .flatMap(({ text, marks }) =>
            marks
              .filter(({ name }) => name !== 'occurrence')
              .map(({ from, to, name }): [string, boolean] => [
                text.slice(from, to),
                name === 'current',
              ]),
          )
      : [...document.querySelectorAll('.viewer-rows .find-match')].map(
          (mark): [string, boolean] => [
            mark.textContent ?? '',
            mark.classList.contains('current'),
          ],
        );
  });

export const seenMarked = async (
  page: Page,
  named: 'match' | 'current' | 'occurrence',
): Promise<string[]> =>
  (await seenRows(page)).flatMap(({ text, marks }) =>
    marks
      .filter(({ name }) => name === named)
      .map(({ from, to }) => text.slice(from, to)),
  );

export const seenSelected = async (page: Page): Promise<string[]> =>
  (await seenRows(page)).flatMap(({ text, selected }) =>
    selected === undefined ? [] : [text.slice(selected.from, selected.to)],
  );

export async function cellPoint(
  page: Page,
  row: number,
  column: number,
  across = 0.5,
): Promise<{ readonly x: number; readonly y: number }> {
  const seen = (await seenRows(page))[row];
  if (seen === undefined) {
    throw new Error(`The viewer draws no row ${row}`);
  }
  return {
    x: seen.left + (column - seen.column + across) * seen.advance,
    y: seen.top + seen.height / 2,
  };
}

export async function dragOver(
  page: Page,
  from: readonly [row: number, column: number],
  to: readonly [row: number, column: number],
): Promise<void> {
  const start = await cellPoint(page, ...from, 0.2);
  const end = await cellPoint(page, ...to, 0.2);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
}

export const keepCopied = (page: Page): Promise<void> =>
  page.evaluate(() => {
    Reflect.deleteProperty(window, 'copied');
    window.addEventListener(
      'copy',
      (event) =>
        Reflect.set(
          window,
          'copied',
          event.clipboardData?.getData('text/plain'),
        ),
      { once: true },
    );
  });

export const copied = (page: Page): Promise<unknown> =>
  page.evaluate((): unknown => Reflect.get(window, 'copied'));

export const viewerShows = (
  page: Page,
  text: string,
  { exact = false }: { readonly exact?: boolean } = {},
): Promise<void> =>
  waitFor(
    async () =>
      (await viewerTexts(page)).some((row) =>
        exact ? row === text : row.includes(text),
      ),
    `the viewer to show ${text}`,
  );

export const seenGlyphs = (
  page: Page,
  cluster: string,
): Promise<readonly SeenGlyph[]> =>
  page.evaluate((drawn) => {
    const host = document.querySelector('.viewer-rows .cell-rows');
    return host instanceof HTMLElement ? (host.seenGlyphs?.(drawn) ?? []) : [];
  }, cluster);

export const seenDots = (page: Page): Promise<readonly SeenGlyph[]> =>
  page.evaluate(() => {
    const host = document.querySelector('.viewer-rows .cell-rows');
    return host instanceof HTMLElement ? (host.seenDots?.() ?? []) : [];
  });

export async function rightOfCell(page: Page, column: number): Promise<number> {
  const [first] = await seenRows(page);
  return first === undefined
    ? Number.NaN
    : first.left + (column + 1 - first.column) * first.advance;
}

export interface CellsOf {
  readonly rows: () => Promise<readonly SeenRow[]>;
  readonly glyphs: (cluster: string) => Promise<readonly SeenGlyph[]>;
  readonly dots: () => Promise<readonly SeenGlyph[]>;
  readonly point: (
    row: number,
    column: number,
  ) => Promise<{ readonly x: number; readonly y: number }>;
}

export function cellsOf(page: Page, host: string): CellsOf {
  const rows = (): Promise<readonly SeenRow[]> =>
    page.evaluate((selector) => {
      const found = document.querySelector(selector);
      return found instanceof HTMLElement &&
        found.querySelector('canvas') !== null
        ? (found.seenRows?.() ?? [])
        : [];
    }, host);
  return {
    rows,
    glyphs: (cluster) =>
      page.evaluate(
        ([selector, drawn]) => {
          const found = document.querySelector(selector);
          return found instanceof HTMLElement
            ? (found.seenGlyphs?.(drawn) ?? [])
            : [];
        },
        [host, cluster] as const,
      ),
    dots: () =>
      page.evaluate((selector) => {
        const found = document.querySelector(selector);
        return found instanceof HTMLElement ? (found.seenDots?.() ?? []) : [];
      }, host),
    point: async (row, column) => {
      const seen = (await rows())[row];
      if (seen === undefined) {
        throw new Error(`${host} draws no row ${row}`);
      }
      return {
        x: seen.left + (column - seen.column + 0.5) * seen.advance,
        y: seen.top + seen.height / 2,
      };
    },
  };
}
