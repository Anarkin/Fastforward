import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { closeOrKill, launchApp } from './appLaunch';
import {
  clickBox,
  clickLine,
  fileName,
  lineOf,
  linesShown,
  rowsShown,
} from './commanderRows';
import { barOf, barParts } from './scrollbarsShown';
import { untilSettled } from './waits';
import { waitFor } from '../helpers/fixtures';
import { removeFolder, tempFolder } from '../helpers/tempFolders';

const many = 400;

const manyName = (at: number) => `file-${String(at).padStart(3, '0')}.ts`;

const narrow = {
  dateFormat: 'HH:mm',
  tools: { commander: { columns: { extension: 2, size: 3, date: 5 } } },
};

const shortest = 9;

const narrower = 4;

for (const scale of [1, 1.25, 1.5]) {
  suite(`App commander rows at ${scale * 100}%`, () => {
    let folder: string;
    let profile: string;
    let opened: string;
    let app: ElectronApplication;
    let page: Page;

    const right = () => page.locator('.commander-pane').nth(1);
    const shown = () => rowsShown(right());

    beforeAll(async () => {
      folder = tempFolder('app-commander-lines');
      profile = path.join(folder, 'profile');
      opened = path.join(folder, 'opened');
      fs.mkdirSync(path.join(opened, 'docs'), { recursive: true });
      for (const name of ['plain.md', 'cellé.md']) {
        fs.writeFileSync(path.join(opened, name), '12345');
      }
      for (let at = 0; at < many; at++) {
        fs.writeFileSync(path.join(opened, manyName(at)), 'x'.repeat(at));
      }
      fs.mkdirSync(profile, { recursive: true });
      fs.writeFileSync(
        path.join(profile, 'state.json'),
        JSON.stringify({
          tabs: [{ id: '1', tool: 'commander', root: opened }],
          activeTab: '1',
        }),
      );
      fs.writeFileSync(
        path.join(profile, 'settings.user.json'),
        JSON.stringify({ scrolling: { smooth: false }, ...narrow }),
      );
      app = await launchApp(profile, {
        scale,
      });
      page = await app.firstWindow();
      await lineOf(right(), 'plain');
    });

    afterAll(async () => {
      if (app !== undefined) {
        await closeOrKill(app);
      }
      removeFolder(folder);
    });

    test('draws a name that no longer fits its column cut short with an ellipsis as the side grows narrower, and whole again once the side is as wide as before, whatever the width of the window, its columns set narrow and the name as long as the side has room for', async () => {
      const resizer = page.locator('.resizer').first();
      const handle = await resizer.boundingBox();
      assert.ok(handle !== null);
      const from = {
        x: handle.x + handle.width / 2,
        y: handle.y + handle.height / 2,
      };
      const line = await lineOf(right(), 'plain');
      const advance = await right().evaluate((side) => {
        const ruler = side.querySelector('.commander-ruler');
        return ruler === null
          ? 0
          : parseFloat(getComputedStyle(ruler).columnGap) / 2;
      });
      const fits = Math.floor(
        (line.extensionLeft - line.nameLeft) / advance - 2 + 0.001,
      );
      assert.ok(fits >= shortest, `room for names of ${fits} characters`);
      const fitting = 'f'.repeat(fits - 1);
      fs.writeFileSync(path.join(opened, `${fitting}.md`), '12345');
      const drawnOf = async () => (await lineOf(right(), fitting)).drawn;
      await waitFor(
        async () => (await drawnOf()) === fitting,
        'the long name drawn whole',
      );
      const by = Math.round(narrower * advance);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + by, from.y, { steps: 8 });
      await page.mouse.up();
      await waitFor(
        async () => (await drawnOf()).endsWith('…'),
        'the long name to be cut short',
      );
      await page.mouse.move(from.x + by, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x, from.y, { steps: 8 });
      await page.mouse.up();
      await waitFor(
        async () => (await drawnOf()) === fitting,
        'the long name to be drawn whole again',
      );
    });

    test('draws the generic icon of a folder and of a file as a picture as large as 16 pixels are on the screen, in the muted color of the text, with no element of its own', async () => {
      const drawn = await page.evaluate(async () => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--muted-foreground)';
        document.body.append(probe);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context === null) {
          throw new Error('no canvas');
        }
        canvas.width = 1;
        canvas.height = 1;
        context.fillStyle = getComputedStyle(probe).color;
        context.fillRect(0, 0, 1, 1);
        const muted = [...context.getImageData(0, 0, 1, 1).data];
        probe.remove();
        const pictured = async (name: string) => {
          const image = new Image();
          image.src = getComputedStyle(document.documentElement)
            .getPropertyValue(`--${name}-icon`)
            .trim()
            .replace(/^url\("/, '')
            .replace(/"\)$/, '');
          await image.decode();
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0);
          const { data } = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          );
          let strongest = 0;
          for (let at = 0; at < data.length; at += 4) {
            if ((data[at + 3] ?? 0) > (data[strongest + 3] ?? 0)) {
              strongest = at;
            }
          }
          return {
            wide: image.naturalWidth,
            high: image.naturalHeight,
            ink: Array.from(data.slice(strongest, strongest + 4)),
          };
        };
        return {
          ratio: devicePixelRatio,
          muted,
          folder: await pictured('folder'),
          file: await pictured('file'),
          elements: document.querySelectorAll(
            '.commander-pane .virtual-row, img.system-icon, .column-body .commander-icon',
          ).length,
        };
      });
      assert.strictEqual(drawn.ratio, scale);
      for (const picture of [drawn.folder, drawn.file]) {
        assert.deepStrictEqual(
          [picture.wide, picture.high],
          [Math.round(16 * scale), Math.round(16 * scale)],
        );
        assert.ok(
          picture.ink.every(
            (channel, at) => Math.abs(channel - (drawn.muted[at] ?? 0)) <= 3,
          ),
          `${picture.ink.join()} is not the muted color ${drawn.muted.join()}`,
        );
      }
      assert.strictEqual(drawn.elements, 0);
      assert.strictEqual((await lineOf(right(), '[docs]')).icon, 'generic');
    });

    test('draws each row a list dragged by its scrollbar comes to with its own name, color, mark, selection and icon, none of them those of a file drawn before at that place', async () => {
      const list = '.commander-pane:not(.inactive) .virtual-rows';
      await clickLine(page, right(), 'plain');
      await clickBox(page, right(), 'cellé');
      const settled = () =>
        untilSettled(
          async () => JSON.stringify(await linesShown(right())),
          'the rows to settle',
          { quiet: 400 },
        );
      await settled();
      const first = await shown();
      assert.deepStrictEqual(
        first
          .filter(({ classes }) => classes.includes('marked'))
          .map(({ name }) => name),
        ['cellé'],
      );

      const { box } = await barOf(page, list, 'vertical');
      const { thumb, start, end } = await barParts(page, box, 'vertical');
      assert.ok(thumb);
      const grip = {
        x: thumb.left + thumb.width / 2,
        y: thumb.top + Math.min(thumb.height / 2, 12),
      };
      const down = box.height - start.height - end.height - thumb.height + 40;
      await page.mouse.move(grip.x, grip.y);
      await page.mouse.down();
      await page.mouse.move(grip.x, grip.y + down);
      await waitFor(
        async () =>
          (await shown()).some((row) => fileName(row) === manyName(many - 1)),
        'the last file to be shown',
      );
      await page.mouse.up();
      await page.mouse.move(0, 0);
      await settled();

      const later = await linesShown(right());
      assert.ok(later.length > 10);
      const colors = new Set<string>();
      for (const line of later) {
        assert.match(line.name, /^file-\d{3}$/, line.name);
        assert.strictEqual(line.extension, 'ts', line.name);
        assert.deepStrictEqual(
          ['marked', 'selected', 'commander-folder', 'up', 'pointed'].filter(
            (each) => line.classes.includes(each),
          ),
          [],
          line.name,
        );
        assert.strictEqual(line.check, 'none', line.name);
        colors.add(line.ink);
      }
      assert.strictEqual(colors.size, 1, [...colors].join());

      const lowered = (await barParts(page, box, 'vertical')).thumb;
      assert.ok(lowered);
      await page.mouse.move(grip.x, lowered.top + lowered.height / 2);
      await page.mouse.down();
      await page.mouse.move(grip.x, box.top - 40);
      await page.mouse.up();
      await waitFor(
        async () => (await shown()).some(({ name }) => name === 'plain'),
        'the first files to be shown again',
      );
      const back = await shown();
      assert.deepStrictEqual(
        {
          marked: back
            .filter(({ classes }) => classes.includes('marked'))
            .map(({ name }) => name),
          selected: back
            .filter(({ classes }) => classes.includes('selected'))
            .map(({ name }) => name),
          folders: back
            .filter(({ classes }) => classes.includes('commander-folder'))
            .map(({ drawn }) => drawn),
          order: back.slice(0, 3).map(({ drawn }) => drawn),
        },
        {
          marked: ['cellé'],
          selected: ['plain'],
          folders: ['[..]', '[docs]'],
          order: ['[..]', '[docs]', back[2]?.drawn],
        },
      );
    });
  });
}
