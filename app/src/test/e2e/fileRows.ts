import type { Page } from 'playwright-core';
import type { SeenFile } from '../../tools/git/page/fileHits';
import { waitFor } from '../helpers/fixtures';

export const filesSeen = (page: Page): Promise<SeenFile[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('.files-layer')].flatMap((layer) =>
      layer instanceof HTMLElement && layer.checkVisibility()
        ? [...(layer.seenFiles?.() ?? [])]
        : [],
    ),
  );

interface Wanted {
  readonly kind?: SeenFile['kind'];
  readonly selected?: boolean;
  readonly dimmed?: boolean;
  readonly at?: number;
}

const named = (row: SeenFile, name: string | RegExp) =>
  typeof name === 'string' ? row.name.includes(name) : name.test(row.name);

const fits = (row: SeenFile, name: string | RegExp, wanted: Wanted) =>
  named(row, name) &&
  (wanted.kind === undefined || row.kind === wanted.kind) &&
  (wanted.selected === undefined || row.selected === wanted.selected) &&
  (wanted.dimmed === undefined || row.dimmed === wanted.dimmed);

async function fileSeen(
  page: Page,
  name: string | RegExp,
  wanted: Wanted = {},
  scrolling = false,
  timeout = 30_000,
): Promise<SeenFile> {
  let found: SeenFile | undefined;
  await waitFor(
    async () => {
      found = (await filesSeen(page)).filter((row) => fits(row, name, wanted))[
        wanted.at ?? 0
      ];
      if (found === undefined && scrolling) {
        await page.evaluate(() => {
          const layer = [...document.querySelectorAll('.files-layer')].find(
            (each) => each instanceof HTMLElement && each.checkVisibility(),
          );
          const list = layer?.closest('.virtual-rows');
          if (list instanceof HTMLElement) {
            list.scrollTop =
              list.scrollTop + list.clientHeight >= list.scrollHeight - 1
                ? 0
                : list.scrollTop + list.clientHeight / 2;
          }
        });
      }
      return found !== undefined;
    },
    `the files to draw ${String(name)}${wanted.selected === true ? ' selected' : ''}`,
    timeout,
  );
  if (found === undefined) {
    throw new Error(`No file ${String(name)} drawn`);
  }
  return found;
}

type Button = 'left' | 'right';

export function fileRow(
  page: Page,
  name: string | RegExp,
  wanted: Wanted = {},
) {
  const row = {
    waitFor: async (): Promise<void> => {
      await fileSeen(page, name, wanted);
    },
    first: () => row,
    nth: (at: number) => fileRow(page, name, { ...wanted, at }),
    count: async (): Promise<number> =>
      (await filesSeen(page)).filter((seen) => fits(seen, name, wanted)).length,
    click: async ({
      button = 'left',
    }: { readonly button?: Button } = {}): Promise<void> => {
      const seen = await fileSeen(page, name, wanted, true);
      await page.mouse.click(seen.nameLeft + 4, seen.top + seen.height / 2, {
        button,
      });
    },
    clickPart: async (
      at: number,
      { button = 'left' }: { readonly button?: Button } = {},
    ): Promise<void> => {
      const seen = await fileSeen(page, name, wanted, true);
      const part = seen.parts.at(at);
      if (part === undefined) {
        throw new Error(`No part ${at} of ${String(name)} drawn`);
      }
      await page.mouse.click(
        part.left + part.width / 2,
        seen.top + seen.height / 2,
        { button },
      );
    },
  };
  return row;
}
