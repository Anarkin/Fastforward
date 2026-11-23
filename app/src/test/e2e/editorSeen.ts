import type { Page } from 'playwright-core';
import type { SeenRow } from '../../components/cells/page/seen';
import { waitFor } from '../helpers/fixtures';
import { cellsOf } from './cellsSeen';

export const editorCells = '.editor .editor-cells';

export interface EditorLineSeen {
  readonly number: number;
  readonly text: string;
  readonly rows: readonly SeenRow[];
  readonly kinds: Readonly<Record<string, string>>;
  readonly marks: readonly { readonly text: string; readonly name: string }[];
  readonly selected: readonly string[];
}

export const editorRowsSeen = (page: Page): Promise<readonly SeenRow[]> =>
  cellsOf(page, editorCells).rows();

export async function editorLinesSeen(page: Page): Promise<EditorLineSeen[]> {
  const lines = new Map<number, SeenRow[]>();
  for (const row of await editorRowsSeen(page)) {
    const number = Number(row.key.slice(0, row.key.indexOf(':')));
    lines.set(number, [...(lines.get(number) ?? []), row]);
  }
  return [...lines].map(([number, rows]) => {
    const kinds: Record<string, string> = {};
    for (const { text, kind } of rows.flatMap((row) => row.pieces)) {
      kinds[kind] = (kinds[kind] ?? '') + text;
    }
    return {
      number,
      text: rows[0]?.line ?? rows.map((row) => row.text).join(''),
      rows,
      kinds,
      marks: rows.flatMap((row) =>
        row.marks.map(({ from, to, name }) => ({
          text: row.text.slice(from, to),
          name,
        })),
      ),
      selected: rows.flatMap((row) =>
        (row.selections ?? []).map(({ from, to }) => row.text.slice(from, to)),
      ),
    };
  });
}

export async function untilEditorLine(
  page: Page,
  found: (line: EditorLineSeen) => boolean,
  what: string,
): Promise<EditorLineSeen> {
  let line: EditorLineSeen | undefined;
  await waitFor(async () => {
    line = (await editorLinesSeen(page)).find(found);
    return line !== undefined;
  }, what);
  if (line === undefined) {
    throw new Error(`The editor shows no ${what}`);
  }
  return line;
}

export const editorMarked = async (
  page: Page,
  named: 'match' | 'current' | 'occurrence',
): Promise<string[]> =>
  (await editorLinesSeen(page)).flatMap(({ marks }) =>
    marks.filter(({ name }) => name === named).map(({ text }) => text),
  );

export const editorSelected = async (page: Page): Promise<string[]> =>
  (await editorLinesSeen(page)).flatMap(({ selected }) => selected);

export async function editorRowPoint(
  page: Page,
  row: number,
  column = 0,
): Promise<{ readonly x: number; readonly y: number }> {
  let seen: SeenRow | undefined;
  await waitFor(async () => {
    const top = await page
      .locator('.editor .editor-scroller')
      .evaluate((scroller) => scroller.getBoundingClientRect().top);
    seen = (await editorRowsSeen(page)).filter((each) => each.top >= top - 0.5)[
      row
    ];
    return seen !== undefined;
  }, `row ${row} of the editor in sight`);
  if (seen === undefined) {
    throw new Error(`The editor shows no row ${row}`);
  }
  return {
    x: seen.left + (column - seen.column + 0.5) * seen.advance,
    y: seen.top + seen.height / 2,
  };
}
