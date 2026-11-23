import {
  diffLinesSeen,
  diffRowHeight,
  diffRowsSeen,
  untilDiffLine,
} from './diffSeen';
import * as path from 'node:path';
import * as esbuild from 'esbuild';
import type { JSHandle } from 'playwright-core';
import type * as lineBreaksModule from '../../lib/page/lineBreaks';
import type * as cellTableModule from '../../lib/page/cellTable';
import type * as textWidthsModule from '../../lib/page/textWidths';
import type * as wordWrapModule from '../../lib/page/wordWrap';
import { page } from './appFixtures';

export async function drawnCodeRow(): Promise<number> {
  await untilDiffLine(page, () => true, 'a line of the diff');
  return diffRowHeight(page);
}

export async function codeRow(lineHeight: number): Promise<number> {
  const ratio = await page.evaluate(() => devicePixelRatio);
  return Math.round(12 * lineHeight * ratio) / ratio;
}

export function near(actual: number | undefined, expected: number): boolean {
  return actual !== undefined && Math.abs(actual - expected) < 0.01;
}

export type PageWrapping = Pick<typeof lineBreaksModule, 'lineBreaks'> &
  Pick<typeof textWidthsModule, 'cellWidthsOf'> &
  Pick<typeof cellTableModule, 'terminalCells'> &
  Pick<typeof wordWrapModule, 'wrapIndent' | 'wrapStarts'>;

export async function wrappingInPage(): Promise<JSHandle<PageWrapping>> {
  const built = await esbuild.build({
    stdin: {
      contents: [
        "export { lineBreaks } from './lineBreaks';",
        "export { cellWidthsOf } from './textWidths';",
        "export { terminalCells } from './cellTable';",
        "export { wrapIndent, wrapStarts } from './wordWrap';",
      ].join('\n'),
      resolveDir: path.join(__dirname, '..', '..', 'lib', 'page'),
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    globalName: 'wrappingOfTheApp',
    write: false,
  });
  return page.evaluateHandle<PageWrapping>(
    `${built.outputFiles[0].text};wrappingOfTheApp`,
  );
}

export const lineHeights = async () =>
  (await diffLinesSeen(page)).map(
    ({ rows }) => Math.round(rows.length * (rows[0]?.height ?? 0) * 10) / 10,
  );

export const wrapColumnsShown = (side = 0) =>
  page
    .locator('.diff-view .wrap-probe:has(.number) .code')
    .nth(side)
    .evaluate((code) => {
      const style = getComputedStyle(code);
      const sample = code.querySelector('.wrap-sample');
      return {
        width:
          code.getBoundingClientRect().width -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
        char: (sample?.getBoundingClientRect().width ?? 0) / 1000,
      };
    });

export const pressWrap = () => page.keyboard.press('w');

export async function matchInView(): Promise<boolean> {
  const { top, bottom } = await page
    .locator('.diff-view .virtual-rows')
    .first()
    .evaluate((list) => {
      const box = list.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    });
  const marked = (await diffRowsSeen(page)).filter(({ marks }) =>
    marks.some(({ name }) => name === 'current'),
  );
  return (
    marked.length > 0 &&
    marked.every((row) => row.top >= top && row.top + row.height <= bottom)
  );
}

export const clickView = (name: string) => () =>
  page.getByRole('button', { name }).click();
