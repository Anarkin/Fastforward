import type { Page } from 'playwright-core';
import type { SeenRow } from '../../components/cells/page/seen';
import { waitFor } from '../helpers/fixtures';

export interface DiffRowSeen extends SeenRow {
  readonly side: number;
  readonly at: number;
}

export interface DiffLineSeen {
  readonly side: number;
  readonly text: string;
  readonly tint: string | undefined;
  readonly change: 'added' | 'removed' | undefined;
  readonly numbers: readonly (string | undefined)[];
  readonly top: number;
  readonly rows: readonly DiffRowSeen[];
  readonly marks: readonly {
    readonly text: string;
    readonly name: 'match' | 'current' | 'occurrence';
  }[];
  readonly kinds: readonly (readonly [text: string, kind: string])[];
  readonly selected: string;
  readonly words: readonly string[];
}

export const diffSides = '.diff-view .diff-cells';

export const diffRowsSeen = (page: Page, within = ''): Promise<DiffRowSeen[]> =>
  page.evaluate(
    (sides) =>
      [...document.querySelectorAll(sides)].flatMap((host, side) =>
        host instanceof HTMLElement && host.querySelector('canvas') !== null
          ? (host.seenRows?.() ?? []).map((row, at) => ({ ...row, side, at }))
          : [],
      ),
    `${within} ${diffSides}`,
  );

const lineOf = (key: string) => key.slice(0, key.indexOf(':'));

export async function diffLinesSeen(
  page: Page,
  within = '',
): Promise<DiffLineSeen[]> {
  const lines: DiffLineSeen[] = [];
  let last: { key: string; side: number; rows: DiffRowSeen[] } | undefined;
  const ended = () => {
    if (last === undefined) {
      return;
    }
    const { rows, side } = last;
    const [first] = rows;
    lines.push({
      side,
      text: first?.line ?? '',
      tint: first?.tint,
      change: first?.tint?.startsWith('added')
        ? 'added'
        : first?.tint?.startsWith('removed')
          ? 'removed'
          : undefined,
      numbers: first?.numbers ?? [],
      top: first?.top ?? 0,
      rows,
      marks: rows.flatMap(({ text, marks }) =>
        marks.map(({ from, to, name }) => ({
          text: text.slice(from, to),
          name,
        })),
      ),
      kinds: rows.flatMap(({ pieces }) =>
        pieces.map(({ text, kind }): readonly [string, string] => [text, kind]),
      ),
      selected: rows
        .map(({ text, selected }) =>
          selected === undefined ? '' : text.slice(selected.from, selected.to),
        )
        .join(''),
      words: rows.flatMap(({ text, words = [] }) =>
        words.map(({ from, to }) => text.slice(from, to)),
      ),
    });
  };
  for (const row of await diffRowsSeen(page, within)) {
    const key = lineOf(row.key);
    if (last?.key === key && last.side === row.side) {
      last.rows.push(row);
    } else {
      ended();
      last = { key, side: row.side, rows: [row] };
    }
  }
  ended();
  return lines;
}

export const diffTexts = async (
  page: Page,
  changed?: 'added' | 'removed',
  within = '',
): Promise<string[]> =>
  (await diffLinesSeen(page, within))
    .filter(({ change }) => changed === undefined || change === changed)
    .map(({ text }) => text);

export const diffPlaces = (
  page: Page,
  { side, at }: DiffRowSeen,
  within = '',
): Promise<readonly (readonly [at: number, column: number])[]> =>
  page
    .locator(`${within} ${diffSides}`)
    .nth(side)
    .evaluate(
      (host, row) =>
        host instanceof HTMLElement ? [...(host.seenPlaces?.(row) ?? [])] : [],
      at,
    );

export const diffFinds = async (page: Page, within = ''): Promise<string[]> =>
  (await diffLinesSeen(page, within)).flatMap(({ marks }) =>
    marks.filter(({ name }) => name !== 'occurrence').map(({ text }) => text),
  );

export const diffRowHeight = async (page: Page): Promise<number> =>
  (await diffRowsSeen(page))[0]?.height ?? 0;

export const diffListTop = (page: Page, within = ''): Promise<number> =>
  page
    .locator(`${within} .diff-view .virtual-rows`)
    .first()
    .evaluate((list) => list.getBoundingClientRect().top);

export const diffMarked = async (
  page: Page,
  named: 'match' | 'current' | 'occurrence',
  within = '',
): Promise<string[]> =>
  (await diffLinesSeen(page, within)).flatMap(({ marks }) =>
    marks.filter(({ name }) => name === named).map(({ text }) => text),
  );

export async function untilDiffLine(
  page: Page,
  found: (line: DiffLineSeen) => boolean,
  what: string,
  within = '',
): Promise<DiffLineSeen> {
  let line: DiffLineSeen | undefined;
  await waitFor(async () => {
    line = (await diffLinesSeen(page, within)).find(found);
    return line !== undefined;
  }, what);
  if (line === undefined) {
    throw new Error(`The diff shows no ${what}`);
  }
  return line;
}

export const cellOf = (
  row: SeenRow,
  column: number,
): { readonly x: number; readonly y: number } => ({
  x: row.left + (column - row.column + 0.5) * row.advance,
  y: row.top + row.height / 2,
});
