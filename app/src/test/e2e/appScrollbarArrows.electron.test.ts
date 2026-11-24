import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from 'playwright-core';
import { suite, test } from 'vitest';
import { closeOrKill, launchApp } from './appLaunch';
import { untilSettled } from './waits';
import { removeFolder, tempFolder } from '../helpers/tempFolders';

interface Arrow {
  readonly widths: readonly number[];
  readonly middles: readonly number[];
}

function arrowsIn(
  page: Page,
  shot: Buffer,
  button: number,
  across: boolean,
): Promise<Arrow[]> {
  return page.evaluate(
    async ({ data, size, sideways }) => {
      const bytes = Uint8Array.from(atob(data), (each) => each.charCodeAt(0));
      const image = await createImageBitmap(
        new Blob([bytes], { type: 'image/png' }),
      );
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext('2d');
      context?.drawImage(image, 0, 0);
      const pixels = context?.getImageData(0, 0, image.width, image.height);
      const width = image.width;
      const height = image.height;
      const along = sideways ? width : height;
      const thick = sideways ? height : width;
      const at = (step: number, side: number) => {
        const x = sideways ? step : side;
        const y = sideways ? side : step;
        const index = (y * width + x) * 4;
        return [0, 1, 2].map((channel) => pixels?.data[index + channel] ?? 0);
      };
      return [
        [0, size],
        [along - size, along],
      ].map(([from, to]) => {
        const ground = at(from + 1, 1);
        const widths: number[] = [];
        const middles = new Set<number>();
        for (let step = from; step < to; step++) {
          const inked: number[] = [];
          for (let side = 0; side < thick; side++) {
            const differs = at(step, side).reduce(
              (sum, value, channel) =>
                sum + Math.abs(value - (ground[channel] ?? 0)),
              0,
            );
            if (differs > 150) {
              inked.push(side);
            }
          }
          if (inked.length > 0) {
            const first = inked[0] ?? 0;
            const last = inked.at(-1) ?? 0;
            widths.push(last - first + 1);
            middles.add((first + last) / 2);
          }
        }
        return { widths, middles: [...middles] };
      });
    },
    { data: shot.toString('base64'), size: button, sideways: across },
  );
}

const grown = (rows: number) =>
  Array.from({ length: rows }, (_, row) => 2 * (row + 1));

suite('Scrollbar arrows', () => {
  for (const scale of [1, 1.25, 1.5, 1.75]) {
    test(`draws each arrow of a scrollbar at ${scale * 100}% as a triangle of whole device pixels, each row two wider than the one before it from a tip of two, on one middle, alike in all four directions, as it was drawn on fractions of a device pixel and came out lopsided at some scales`, async () => {
      const folder = tempFolder('scrollbar-arrows');
      const profile = path.join(folder, 'profile');
      fs.mkdirSync(profile, { recursive: true });
      const file = path.join(folder, 'wide.txt');
      fs.writeFileSync(
        file,
        Array.from(
          { length: 300 },
          (_, at) => `line ${at} ${'word '.repeat(80)}`,
        ).join('\n'),
      );
      fs.writeFileSync(
        path.join(profile, 'state.json'),
        JSON.stringify({
          tabs: [{ id: '1', tool: 'editor', root: file }],
          activeTab: '1',
        }),
      );
      fs.writeFileSync(
        path.join(profile, 'settings.user.json'),
        JSON.stringify({ text: { wordWrap: false } }),
      );
      const app = await launchApp(profile, {
        scale,
      });
      try {
        const page = await app.firstWindow();
        const scroller = page.locator('.editor .editor-scroller');
        const bar = page.locator(
          '.editor .editor-surface > .scroll-proxy-frame .scroll-proxy',
        );
        await page
          .locator('.editor .editor-cells[data-rows]:has(canvas)')
          .waitFor();
        await scroller.evaluate((element) => {
          element.scrollTop = 200;
          element.scrollLeft = 100;
        });
        await page.mouse.move(2, 2);
        const size = await scroller.evaluate((element) =>
          parseFloat(getComputedStyle(element, '::-webkit-scrollbar').width),
        );
        const button = Math.round(size * scale);
        const down = () =>
          scroller.evaluate((element, wide) => {
            const box = element.getBoundingClientRect();
            return {
              x: box.right - wide,
              y: box.top,
              width: wide,
              height: box.height,
            };
          }, size);
        const across = () =>
          bar.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return {
              x: box.left,
              y: box.top,
              width: box.width,
              height: box.height,
            };
          });
        const shotOf = async (clipOf: typeof down) => {
          const settled = await untilSettled(async () => {
            const clip = await clipOf();
            const shot = await page.screenshot({ clip });
            return `${JSON.stringify(clip)} ${shot.toString('base64')}`;
          }, 'the scrollbar to settle where it stands');
          return Buffer.from(settled.slice(settled.indexOf(' ') + 1), 'base64');
        };
        const arrows = [
          ...(await arrowsIn(page, await shotOf(down), button, false)),
          ...(await arrowsIn(page, await shotOf(across), button, true)),
        ];
        const rows = arrows[0]?.widths.length ?? 0;
        assert.ok(rows >= 3, JSON.stringify(arrows));
        assert.deepStrictEqual(
          arrows.map(({ widths, middles }) => ({
            widths,
            middles: middles.length,
          })),
          [true, false, true, false].map((pointsBack) => ({
            widths: pointsBack ? grown(rows) : grown(rows).toReversed(),
            middles: 1,
          })),
        );
      } finally {
        await closeOrKill(app);
        removeFolder(folder);
      }
    });
  }
});
