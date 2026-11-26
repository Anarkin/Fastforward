import type { Page } from 'playwright-core';
import { waitFor } from '../helpers/fixtures';

export interface RowShown {
  readonly text: string;
  readonly left: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export const rowsShown = (page: Page, rows: string): Promise<RowShown[]> =>
  page.locator(rows).evaluateAll((elements) =>
    elements.flatMap((element) => {
      const commits =
        element instanceof HTMLElement ? element.seenCommits?.() : undefined;
      if (commits !== undefined) {
        return commits.map((commit) => ({
          text: commit.subject ?? '',
          left: commit.left,
          top: commit.top,
          bottom: commit.top + commit.height,
          width: commit.width,
          height: commit.height,
        }));
      }
      const files =
        element instanceof HTMLElement ? element.seenFiles?.() : undefined;
      if (files !== undefined) {
        return files
          .filter((file) => !file.pinned)
          .map((file) => ({
            text: file.name,
            left: file.left,
            top: file.top,
            bottom: file.top + file.height,
            width: file.width,
            height: file.height,
          }));
      }
      const tiles =
        element instanceof HTMLElement ? element.seenTiles?.() : undefined;
      if (tiles !== undefined) {
        return tiles
          .filter((tile, at) => tiles[at - 1]?.top !== tile.top)
          .map((tile) => ({
            text: tile.key,
            left: tile.left,
            top: tile.top,
            bottom: tile.top + tile.height,
            width: tile.width,
            height: tile.height,
          }));
      }
      const lines =
        element instanceof HTMLElement ? element.seenLines?.() : undefined;
      if (lines !== undefined) {
        return lines.map((line) => ({
          text: line.key,
          left: line.left,
          top: line.top,
          bottom: line.top + line.height,
          width: line.width,
          height: line.height,
        }));
      }
      const seen =
        element instanceof HTMLElement ? element.seenRows?.() : undefined;
      const box = element.getBoundingClientRect();
      if (seen !== undefined && element.querySelector('canvas') === null) {
        return [];
      }
      if (seen !== undefined) {
        return seen.map(({ text, line, scrolled, left, top, height }) => ({
          text: scrolled > 0 ? (line ?? text) : text,
          left,
          top,
          bottom: top + height,
          width: box.right - left,
          height,
        }));
      }
      const { left, top, bottom, width, height } = box;
      return [{ text: element.textContent, left, top, bottom, width, height }];
    }),
  );

export const untilRowsShown = (
  page: Page,
  rows: string,
  least: number,
): Promise<void> =>
  waitFor(
    async () => (await rowsShown(page, rows)).length >= least,
    `${least} rows of ${rows}`,
  );
