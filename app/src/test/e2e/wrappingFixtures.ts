import * as path from 'node:path';
import * as esbuild from 'esbuild';
import type { JSHandle, Locator } from 'playwright-core';
import type * as lineBreaksModule from '../../lib/page/lineBreaks';
import type * as cellTableModule from '../../lib/page/cellTable';
import type * as textWidthsModule from '../../lib/page/textWidths';
import type * as wordWrapModule from '../../lib/page/wordWrap';
import { page } from './appFixtures';

export async function drawnCodeRow(): Promise<number> {
  return page
    .locator('.diff-line')
    .first()
    .evaluate((line) => parseFloat(getComputedStyle(line).lineHeight));
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

export function browserStarts(line: Locator) {
  return line.evaluate((element) => {
    const code = element.querySelector<HTMLElement>('.code');
    if (!code) {
      throw new Error('No code');
    }
    const range = document.createRange();
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const starts: number[] = [];
    let lastTop = Number.NaN;
    let offset = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node instanceof Text)) {
        continue;
      }
      for (let at = 0; at < node.length; at++) {
        const unit = node.data.charCodeAt(at);
        if (unit >= 0xdc00 && unit <= 0xdfff) {
          continue;
        }
        range.setStart(node, at);
        range.setEnd(
          node,
          Math.min(
            node.length,
            unit >= 0xd800 && unit <= 0xdbff ? at + 2 : at + 1,
          ),
        );
        const rect = range.getBoundingClientRect();
        if (
          rect.height > 0 &&
          !(Math.abs(rect.top - lastTop) < rect.height / 2)
        ) {
          starts.push(offset + at);
          lastTop = rect.top;
        }
      }
      offset += node.length;
    }
    const style = getComputedStyle(code);
    const sample = document.createElement('span');
    sample.style.font = style.font;
    sample.style.letterSpacing = style.letterSpacing;
    sample.style.whiteSpace = 'pre';
    sample.textContent = '0'.repeat(100);
    document.body.append(sample);
    const char = sample.getBoundingClientRect().width / 100;
    sample.remove();
    const rowWidths = starts.slice(0, 3).map((start, row) => {
      const walked = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
      const end = starts[row + 1] ?? (code.textContent ?? '').length;
      let passed = 0;
      const rows = document.createRange();
      for (let node = walked.nextNode(); node; node = walked.nextNode()) {
        if (!(node instanceof Text)) {
          continue;
        }
        if (start >= passed && start <= passed + node.length) {
          rows.setStart(node, start - passed);
        }
        if (end >= passed && end <= passed + node.length) {
          rows.setEnd(node, end - passed);
          break;
        }
        passed += node.length;
      }
      return rows.getBoundingClientRect().width;
    });
    return {
      measured: {
        scale: devicePixelRatio,
        font: style.fontFamily,
        rowWidths,
      },
      text: code.textContent ?? '',
      starts,
      boxed: [...code.querySelectorAll('.cell')].map(
        (cell) => cell.textContent ?? '',
      ),
      width:
        code.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        parseFloat(style.textIndent),
      char,
    };
  });
}

export const firsts = (rows: readonly { first: string }[]) =>
  rows.map((row) => row.first);

export const lineHeights = () =>
  page
    .locator('.diff-view .virtual-row .diff-line')
    .evaluateAll((lines) =>
      lines.map(
        (line) => Math.round(line.getBoundingClientRect().height * 10) / 10,
      ),
    );

export function wrappedRows(
  line: Locator,
): Promise<{ last: string; follows: boolean }[]> {
  return line.evaluate((element) => {
    const code = element.querySelector('.code');
    if (!code) {
      throw new Error('No code');
    }
    const text = code.textContent ?? '';
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    if (!(node instanceof Text) || node.length !== text.length) {
      throw new Error('Not one text node');
    }
    const range = document.createRange();
    const ends = new Map<number, { right: number; last: string }>();
    for (let offset = 0; offset < text.length; offset++) {
      range.setStart(node, offset);
      range.setEnd(node, offset + 1);
      const rect = range.getBoundingClientRect();
      ends.set(Math.round(rect.top), {
        right: rect.right,
        last: text[offset],
      });
    }
    const marks = Array.from(
      element.querySelectorAll('.wrap-break'),
      (mark) => mark.getBoundingClientRect().left,
    );
    return [...ends.values()].slice(0, -1).map(({ right, last }, index) => ({
      last,
      follows: Math.abs((marks[index] ?? Infinity) - right) < 1,
    }));
  });
}

export function laidOutCode(line: Locator) {
  return line.evaluate((element) => {
    const code = element.querySelector<HTMLElement>('.code');
    if (!code) {
      throw new Error('No code');
    }
    const rows = new Map<
      number,
      { first: string; start: number; last: string; right: number }
    >();
    const range = document.createRange();
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node instanceof Text)) {
        continue;
      }
      for (let offset = 0; offset < node.length; offset++) {
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        const rect = range.getBoundingClientRect();
        const character = node.data[offset];
        const top = Math.round(rect.top);
        const row = rows.get(top) ?? {
          first: character,
          start: NaN,
          last: character,
          right: rect.right,
        };
        if (Number.isNaN(row.start) && character !== ' ') {
          row.start = rect.left;
        }
        rows.set(top, { ...row, last: character, right: rect.right });
      }
    }
    const style = getComputedStyle(code);
    const sample = document.createElement('span');
    sample.style.font = style.font;
    sample.style.letterSpacing = style.letterSpacing;
    sample.style.whiteSpace = 'pre';
    sample.textContent = '0'.repeat(100);
    document.body.append(sample);
    const char = sample.getBoundingClientRect().width / 100;
    sample.remove();
    return {
      text: code.textContent ?? '',
      rows: [...rows.values()],
      marks: Array.from(
        element.querySelectorAll('.wrap-break'),
        (mark) => mark.getBoundingClientRect().left,
      ),
      width:
        code.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        parseFloat(style.textIndent),
      char,
    };
  });
}

export const pressWrap = () => page.keyboard.press('w');

export const matchInView = () =>
  page.evaluate(() => {
    const list = document.querySelector('.diff-view .virtual-rows');
    const marks = [
      ...document.querySelectorAll('.diff-view mark.find-match.current'),
    ];
    if (!list || marks.length === 0) {
      return false;
    }
    const { top, bottom } = list.getBoundingClientRect();
    return marks.every((mark) => {
      const box = mark.getBoundingClientRect();
      return box.top >= top && box.bottom <= bottom;
    });
  });

export const clickView = (name: string) => () =>
  page.getByRole('button', { name }).click();

export async function marksFollowRows(line: Locator): Promise<boolean> {
  const rows = await wrappedRows(line);
  return (
    rows.length > 1 && rows.every((row) => row.last === '-' && row.follows)
  );
}

export function drawnBlocks(line: Locator) {
  return line.evaluate((element) => {
    const code = element.querySelector<HTMLElement>('.code');
    const blocks = code?.querySelector<HTMLElement>('.code-blocks');
    const list = element.closest('.virtual-rows');
    if (!code || !blocks || !list) {
      throw new Error('No blocks of rows');
    }
    const top = blocks.getBoundingClientRect().top;
    const rowHeight = parseFloat(getComputedStyle(blocks).lineHeight);
    const rowAt = (y: number) => Math.round((y - top) / rowHeight);
    const range = document.createRange();
    const runs = [...blocks.querySelectorAll('.code-run')].map((run) => {
      const rows: [number, number][] = [];
      let offset = 0;
      const walker = document.createTreeWalker(run, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!(node instanceof Text)) {
          continue;
        }
        for (let at = 0; at < node.length; at++) {
          range.setStart(node, at);
          range.setEnd(node, at + 1);
          const row = rowAt(range.getBoundingClientRect().top);
          if (rows.at(-1)?.[1] !== row) {
            rows.push([offset + at, row]);
          }
        }
        offset += node.length;
      }
      return { text: run.textContent ?? '', rows };
    });
    const shown = list.getBoundingClientRect();
    const style = getComputedStyle(code);
    const sample = document.createElement('span');
    sample.style.font = style.font;
    sample.style.letterSpacing = style.letterSpacing;
    sample.style.whiteSpace = 'pre';
    sample.textContent = '0'.repeat(100);
    document.body.append(sample);
    const char = sample.getBoundingClientRect().width / 100;
    sample.remove();
    return {
      runs,
      marks: [...element.querySelectorAll('.wrap-break')].map((mark) =>
        rowAt(mark.getBoundingClientRect().top),
      ),
      inSight: [
        Math.floor((shown.top - top) / rowHeight),
        Math.ceil((shown.bottom - top) / rowHeight) - 1,
      ],
      width:
        code.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight),
      char,
    };
  });
}
