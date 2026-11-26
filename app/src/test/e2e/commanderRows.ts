import type { Locator, Page } from 'playwright-core';
import type { SeenLine } from '../../tools/commander/page/lineRecords';
import { waitFor } from '../helpers/fixtures';

export interface ShownRow {
  readonly name: string;
  readonly extension: string;
  readonly size: string;
  readonly date: string;
  readonly drawn: string;
  readonly classes: readonly string[];
}

export interface Pressing {
  readonly button?: 'left' | 'right' | 'middle';
  readonly clickCount?: number;
  readonly modifiers?: readonly string[];
  readonly at?: { readonly x: number; readonly y?: number };
}

export const linesShown = (pane: Locator): Promise<SeenLine[]> =>
  pane.evaluate((side) => {
    const layer = side.querySelector('.commander-layer');
    return layer instanceof HTMLElement && layer.seenLines !== undefined
      ? [...layer.seenLines()]
      : [];
  });

const folderOf = (line: SeenLine) => line.classes.includes('commander-folder');

const lineText = (line: SeenLine): string =>
  [
    folderOf(line) ? `[${line.name}]` : line.name,
    line.extension,
    line.size,
    line.date,
  ].join(' ');

export const rowsShown = async (pane: Locator): Promise<ShownRow[]> =>
  (await linesShown(pane)).map((line) => ({
    name: line.name,
    extension: line.extension,
    size: line.size,
    date: line.date,
    drawn: folderOf(line) ? `[${line.name}]` : line.name,
    classes: line.classes,
  }));

export const fileName = ({ name, extension }: ShownRow): string =>
  [name, extension].filter(Boolean).join('.');

export type LineMatch = string | RegExp | { readonly key: string };

const matches = (line: SeenLine, match: LineMatch) =>
  typeof match === 'string'
    ? lineText(line).includes(match)
    : match instanceof RegExp
      ? match.test(lineText(line))
      : line.key === match.key;

export async function lineOf(
  pane: Locator,
  match: LineMatch,
): Promise<SeenLine> {
  let found: SeenLine | undefined;
  await waitFor(
    async () => {
      found = (await linesShown(pane)).find((line) => matches(line, match));
      return found !== undefined;
    },
    `a line of ${JSON.stringify(match instanceof RegExp ? String(match) : match)} drawn`,
  );
  if (found === undefined) {
    throw new Error(
      `No line of ${JSON.stringify(match instanceof RegExp ? String(match) : match)}`,
    );
  }
  return found;
}

export const linesCount = async (
  pane: Locator,
  match?: string | RegExp,
): Promise<number> =>
  (await linesShown(pane)).filter(
    (line) => match === undefined || matches(line, match),
  ).length;

export const untilLines = (pane: Locator): Promise<void> =>
  waitFor(
    async () => (await linesShown(pane)).length > 0,
    'the lines of a side drawn',
  );

export const selectedLine = async (
  pane: Locator,
): Promise<SeenLine | undefined> =>
  (await linesShown(pane)).find((line) => line.classes.includes('selected'));

export const selectedText = async (pane: Locator): Promise<string> => {
  const line = await selectedLine(pane);
  return line === undefined ? '' : lineText(line);
};

const pointOf = (
  line: SeenLine,
  at: Pressing['at'] = { x: line.nameLeft + 8 },
) => ({
  x: line.left + at.x,
  y: line.top + (at.y ?? line.height / 2),
});

export async function hoverLine(
  page: Page,
  pane: Locator,
  match: LineMatch,
  at?: Pressing['at'],
): Promise<void> {
  const { x, y } = pointOf(await lineOf(pane, match), at);
  await page.mouse.move(x, y);
}

export async function clickLine(
  page: Page,
  pane: Locator,
  match: LineMatch,
  { button = 'left', clickCount = 1, modifiers = [], at }: Pressing = {},
): Promise<void> {
  const { x, y } = pointOf(await lineOf(pane, match), at);
  await page.mouse.move(x, y);
  for (const key of modifiers) {
    await page.keyboard.down(key);
  }
  await page.mouse.click(x, y, { button, clickCount });
  for (const key of modifiers.toReversed()) {
    await page.keyboard.up(key);
  }
}

const onBoxOf = (line: SeenLine) => ({
  x: line.checkLeft + line.checkSize / 2,
});

export async function clickBox(
  page: Page,
  pane: Locator,
  match: LineMatch,
): Promise<void> {
  const line = await lineOf(pane, match);
  await clickLine(page, pane, match, { at: onBoxOf(line) });
}

export async function pointedLine(
  page: Page,
  pane: Locator,
  match: LineMatch,
): Promise<Locator> {
  const line = await lineOf(pane, match);
  await hoverLine(page, pane, match);
  const pointed = pane.locator(
    `.commander-pointed[data-key=${JSON.stringify(line.key)}]`,
  );
  await pointed.waitFor();
  return pointed;
}
