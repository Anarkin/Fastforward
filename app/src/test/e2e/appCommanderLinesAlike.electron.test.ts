import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Locator, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { closeOrKill, launchApp } from './appLaunch';
import { boxOfRow, fileName, rowsShown } from './commanderRows';
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

const hair = 0.05;

function placesOf(row: Element) {
  const tab = String.fromCharCode(9);
  const range = document.createRange();
  const spanOf = (node: Node, from: number, to: number) => {
    range.setStart(node, from);
    range.setEnd(node, to);
    const { left, right } = range.getBoundingClientRect();
    return { left, right };
  };
  const inked = (node: Node | null | undefined) => {
    const text = node?.textContent ?? '';
    const from = text.length - text.trimStart().length;
    return node === null || node === undefined || text.trim() === ''
      ? undefined
      : spanOf(node, from, text.trimEnd().length);
  };
  const end = row.getBoundingClientRect().right;
  const room = end - parseFloat(getComputedStyle(row).paddingRight);
  if (!row.classList.contains('plain')) {
    const cell = (name: string) =>
      inked(row.querySelector(`.commander-${name}`)?.firstChild);
    return {
      plain: false,
      name: row.querySelector('.commander-name')?.getBoundingClientRect().left,
      extension: cell('extension')?.left,
      size: cell('size')?.right,
      date: cell('date')?.left,
      ends: cell('date')?.right,
      room,
    };
  }
  const text = [...row.childNodes].find(
    (node) => node.nodeType === Node.TEXT_NODE,
  );
  const written = text?.textContent ?? '';
  const stop = written.indexOf(tab);
  const side = row.closest('.commander-pane');
  const columns = (name: string) =>
    Number(
      side === null
        ? 0
        : getComputedStyle(side).getPropertyValue(`--commander-${name}`),
    );
  const from = stop + 1;
  const sized = from + columns('extension') + 2;
  const dated = sized + columns('size') + 2;
  const part = (start: number, finish: number) => {
    const piece = written.slice(start, finish);
    const lead = piece.length - piece.trimStart().length;
    return text === undefined || piece.trim() === ''
      ? undefined
      : spanOf(text, start + lead, start + piece.trimEnd().length);
  };
  return {
    plain: true,
    name:
      text === undefined
        ? undefined
        : spanOf(text, 0, stop === -1 ? written.length : stop).left,
    extension: part(from, sized - 2)?.left,
    size: part(sized, dated - 2)?.right,
    date: part(dated, written.length)?.left,
    ends: part(dated, written.length)?.right,
    room,
  };
}

for (const scale of [1, 1.25, 1.5]) {
  suite(`App commander rows at ${scale * 100}%`, () => {
    let folder: string;
    let profile: string;
    let opened: string;
    let app: ElectronApplication;
    let page: Page;

    const right = () => page.locator('.commander-pane').nth(1);
    const rowOf = (name: string): Locator =>
      right().locator('.commander-row', { hasText: name }).first();
    const places = (name: string) => rowOf(name).evaluate(placesOf);
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
      await rowOf('plain').waitFor();
      await waitFor(
        async () => (await places('plain')).plain,
        'the rows to be drawn as one text each',
      );
    });

    afterAll(async () => {
      if (app !== undefined) {
        await closeOrKill(app);
      }
      removeFolder(folder);
    });

    const alike = async (
      one: string,
      other: string,
      parts: readonly ('name' | 'extension' | 'size' | 'date')[] = [
        'name',
        'extension',
        'size',
        'date',
      ],
    ) => {
      const [text, cells] = await Promise.all([places(one), places(other)]);
      assert.deepStrictEqual([text.plain, cells.plain], [true, false]);
      for (const part of parts) {
        const [here, there] = [text[part], cells[part]];
        assert.ok(
          here !== undefined &&
            there !== undefined &&
            Math.abs(here - there) < hair,
          `the ${part} of ${one} at ${String(here)} and of ${other} at ${String(there)}`,
        );
      }
      for (const { ends, room } of [text, cells]) {
        assert.ok(
          ends !== undefined && ends <= room + hair,
          `a date ending at ${String(ends)} in a row with room to ${room}`,
        );
      }
    };

    test('stands the name, the extension, the size and the date of a row drawn as one text where a row drawn with cells has them, each within a twentieth of a pixel, and ends the date inside the row, as the tab of the one text was first stopped by the width of the header, a pixel or two wider than the rows beside their scrollbar, which cut every date short', async () => {
      await alike('plain', 'cellé');
      await alike('docs', 'cellé', ['name', 'date']);
    });

    test('keeps them there as the side grows narrower, drawing a name that no longer fits its column with cells that cut it, and as one text again once the side is as wide as before, whatever the width of the window, its columns set narrow and the name as long as the side has room for, as the test first took names a window on a smaller screen had no room for', async () => {
      const resizer = page.locator('.resizer').first();
      const handle = await resizer.boundingBox();
      assert.ok(handle !== null);
      const from = {
        x: handle.x + handle.width / 2,
        y: handle.y + handle.height / 2,
      };
      const room = await right().evaluate((side) => {
        const ruler = side.querySelector('.commander-ruler');
        const advance =
          ruler === null
            ? 0
            : parseFloat(getComputedStyle(ruler).columnGap) / 2;
        const names = parseFloat(
          getComputedStyle(side).getPropertyValue('--commander-name-width'),
        );
        return { advance, names, fits: Math.floor(names / advance + 0.001) };
      });
      assert.ok(
        room.fits >= shortest,
        `room for names of ${room.fits} characters`,
      );
      const fitting = 'f'.repeat(room.fits - 1);
      fs.writeFileSync(path.join(opened, `${fitting}.md`), '12345');
      await rowOf(fitting).waitFor();
      assert.strictEqual((await places(fitting)).plain, true);
      const by = Math.round(narrower * room.advance);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + by, from.y, { steps: 8 });
      await page.mouse.up();
      await waitFor(
        async () => !(await places(fitting)).plain,
        'the long name to be drawn with cells',
      );
      assert.deepStrictEqual(
        await rowOf(fitting)
          .locator('.commander-name')
          .evaluate((cell) => ({
            cut: cell.scrollWidth > cell.clientWidth,
            ellipsis: getComputedStyle(cell).textOverflow,
          })),
        { cut: true, ellipsis: 'ellipsis' },
      );
      await alike('plain', 'cellé');

      await page.mouse.move(from.x + by, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x, from.y, { steps: 8 });
      await page.mouse.up();
      await waitFor(
        async () => (await places(fitting)).plain,
        'the long name to be drawn as one text again',
      );
      await alike('plain', 'cellé');
    });

    test('draws the generic icon of a folder and of a file as a picture as large as 16 pixels are on the screen, in the muted color of the text, behind the row', async () => {
      const drawn = await rowOf('docs').evaluate(async (row) => {
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
          behind: getComputedStyle(row).backgroundImage.startsWith(
            'url("data:image/png',
          ),
          element: row.querySelector('.commander-icon, .icon') !== null,
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
      assert.deepStrictEqual([drawn.behind, drawn.element], [true, false]);
    });

    test('writes the rows a list dragged by its scrollbar comes to into the elements of the rows it left, each with its own name, color, mark, selection and icon, none of them those of the file the element showed before', async () => {
      const list = '.commander-pane:not(.inactive) .virtual-rows';
      await rowOf('plain').click();
      await boxOfRow(rowOf('cellé'));
      const settled = () =>
        untilSettled(
          async () =>
            JSON.stringify(
              await right()
                .locator('.commander-row')
                .evaluateAll((rows) =>
                  rows.map((row) => {
                    const image =
                      row.querySelector<HTMLImageElement>('img.system-icon');
                    return [
                      row.className,
                      row.textContent,
                      image === null
                        ? ''
                        : new URL(image.src).searchParams.get('name'),
                      image?.complete === true && image.naturalWidth > 0,
                    ];
                  }),
                ),
            ),
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
      await page.evaluate((selector) => {
        Reflect.set(window, 'rowsBefore', [
          ...document.querySelectorAll(`${selector} .commander-row`),
        ]);
      }, list);

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
      const reused = await page.evaluate((selector) => {
        const before: unknown = Reflect.get(window, 'rowsBefore');
        const rows = [
          ...document.querySelectorAll(`${selector} .commander-row`),
        ];
        return Array.isArray(before)
          ? rows.filter((row) => before.includes(row)).length
          : 0;
      }, list);
      assert.ok(reused > 10, `${reused} elements reused`);
      await page.mouse.up();
      await settled();

      const later = await right()
        .locator('.commander-row')
        .evaluateAll((rows) =>
          rows.map((row) => {
            const image =
              row.querySelector<HTMLImageElement>('img.system-icon');
            return {
              classes: [...row.classList],
              text: row.textContent ?? '',
              pictured:
                image === null
                  ? undefined
                  : new URL(image.src).searchParams.get('name'),
              loaded: image?.complete === true && image.naturalWidth > 0,
              loading: image?.classList.contains('loading') === true,
              over: row.hasAttribute('data-over-check'),
            };
          }),
        );
      assert.ok(later.length > 10);
      const colors = new Set<string>();
      for (const row of later) {
        const name = row.text.split(String.fromCharCode(9))[0] ?? '';
        assert.match(name, /^file-\d{3}$/, row.text);
        assert.deepStrictEqual(
          ['marked', 'selected', 'commander-folder', 'up'].filter((each) =>
            row.classes.includes(each),
          ),
          [],
          row.text,
        );
        assert.strictEqual(row.over, false, row.text);
        if (row.pictured !== undefined) {
          assert.strictEqual(row.pictured, `${name}.ts`);
        }
        assert.strictEqual(
          row.classes.includes('generic-file'),
          !(row.pictured !== undefined && row.loaded && !row.loading),
          `${row.text} ${row.classes.join(' ')}`,
        );
        colors.add(
          row.classes.find((each) => each.startsWith('file-color-')) ?? '',
        );
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
