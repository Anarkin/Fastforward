import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { defaultSettings, waitFor } from '../support/fixtures';
import { scrollPlaces, waitForFocus } from './appFixtures';
import {
  opened,
  profile,
  page,
  grayPng,
  betweenRows,
  right,
  rowNames,
  thumbGaps,
  select,
  openFolder,
  sharedCommanderApp,
} from './commanderAppFixtures';

const lines = () =>
  right()
    .locator('.column-handle')
    .evaluateAll((handles) =>
      handles.map(
        (handle) => getComputedStyle(handle, '::after').backgroundColor,
      ),
    );

suite('App commander', () => {
  sharedCommanderApp();

  test('compares two images marked on a side with Shift+F3 side by side, as a commit shows them, rather than showing nothing', async () => {
    fs.writeFileSync(path.join(opened, 'shot1.png'), grayPng(40, 30));
    fs.writeFileSync(path.join(opened, 'shot2.png'), grayPng(30, 40));
    await select('shot1');
    await page.keyboard.press('Space');
    await select('shot2');
    await page.keyboard.press('Space');
    await page.keyboard.press('Shift+F3');
    await waitFor(
      async () =>
        (
          await page
            .locator('.compare-view .image-diff img')
            .evaluateAll((images) =>
              images.map((image) =>
                image instanceof HTMLImageElement && image.complete
                  ? `${image.naturalWidth}x${image.naturalHeight}`
                  : '',
              ),
            )
        )
          .toSorted((a, b) => a.localeCompare(b))
          .join() === '30x40,40x30',
      'both images, side by side',
    );
    await page.keyboard.press('Escape');
    await page.locator('.tabs .tab.active', { hasText: 'Commander' }).waitFor();
    for (const name of ['shot1.png', 'shot2.png']) {
      fs.rmSync(path.join(opened, name));
    }
    await waitFor(async () => {
      const names = await rowNames();
      return !names.includes('shot1.png') && !names.includes('shot2.png');
    }, 'the images to be gone from the list');
  });

  test('shows the spaces of a name as they are, two in a row or one first, so names differing only in their spaces look apart', async () => {
    const names = ['spaced one', 'spaced  two', ' spaced first'];
    for (const name of names) {
      fs.writeFileSync(path.join(opened, `${name}.txt`), '');
    }
    try {
      await waitFor(async () => {
        const shown = await rowNames();
        return names.every((name) => shown.includes(`${name}.txt`));
      }, 'the files to be listed');
      const drawn = await right()
        .locator('.commander-row .commander-name')
        .evaluateAll((cells) =>
          cells.flatMap((cell) => {
            const text = cell.textContent ?? '';
            if (!text.includes('spaced')) {
              return [];
            }
            const range = document.createRange();
            range.selectNodeContents(cell);
            return [[text, range.getBoundingClientRect().width] as const];
          }),
        );
      const advance =
        (drawn.find(([text]) => text === 'spaced one')?.[1] ?? 0) /
        'spaced one'.length;
      assert.deepStrictEqual(
        drawn
          .map(([text, width]) => [text, Math.round(width / advance)] as const)
          .toSorted(([a], [b]) => a.localeCompare(b)),
        names
          .map((name) => [name, name.length] as const)
          .toSorted(([a], [b]) => a.localeCompare(b)),
      );
    } finally {
      for (const name of names) {
        fs.rmSync(path.join(opened, `${name}.txt`));
      }
    }
    await waitFor(
      async () => !(await rowNames()).some((name) => name.includes('spaced')),
      'the files to be gone from the list',
    );
  });

  test('ends an extension too long for its column with an ellipsis, as it ends a name too long for its column', async () => {
    const file = path.join(
      opened,
      'installer.appinstaller-of-a-long-extension',
    );
    fs.writeFileSync(file, '');
    try {
      const cell = right()
        .locator('.commander-row', { hasText: 'installer' })
        .locator('.commander-extension');
      await cell.waitFor();
      assert.deepStrictEqual(
        await cell.evaluate((element) => ({
          clipped: element.scrollWidth > element.clientWidth,
          ellipsis:
            getComputedStyle(element).textOverflow === 'ellipsis' &&
            getComputedStyle(element).display === 'block',
        })),
        { clipped: true, ellipsis: true },
      );
    } finally {
      fs.rmSync(file);
    }
    await waitFor(
      async () =>
        !(await rowNames()).some((name) => name.includes('installer')),
      'the file to be gone from the list',
    );
  });

  test('says two files compared are the same rather than showing nothing', async () => {
    fs.writeFileSync(path.join(opened, 'twin1.txt'), 'twins');
    fs.writeFileSync(path.join(opened, 'twin2.txt'), 'twins');
    await select('twin1');
    await page.keyboard.press('Space');
    await select('twin2');
    await page.keyboard.press('Space');
    await page.keyboard.press('Shift+F3');
    await page
      .locator('.compare-view .diff-note', {
        hasText: 'The files are the same.',
      })
      .waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.tabs .tab.active', { hasText: 'Commander' }).waitFor();
    for (const name of ['twin1.txt', 'twin2.txt']) {
      fs.rmSync(path.join(opened, name));
    }
    await waitFor(async () => {
      const names = await rowNames();
      return !names.includes('twin1.txt') && !names.includes('twin2.txt');
    }, 'the files to be gone from the list');
  });

  test('starts each row where the one above it ends, leaving no seam between their backgrounds', async () => {
    const names = ['seam1.txt', 'seam2.txt', 'seam3.txt', 'seam4.txt'];
    for (const name of names) {
      fs.writeFileSync(path.join(opened, name), name);
    }
    await waitFor(
      async () => (await rowNames()).includes('seam4.txt'),
      'the files to be listed',
    );
    const gaps = await right()
      .locator('.virtual-row')
      .evaluateAll((rows) =>
        rows
          .map((row) => row.getBoundingClientRect())
          .toSorted((one, other) => one.top - other.top)
          .slice(1)
          .map((box, index, boxes) => {
            const above =
              index === 0
                ? rows
                    .map((row) => row.getBoundingClientRect())
                    .toSorted((one, other) => one.top - other.top)[0]
                : boxes[index - 1];
            return above === undefined ? 0 : box.top - above.bottom;
          }),
      );
    assert.ok(gaps.length > 2);
    assert.ok(
      gaps.every((gap) => Math.abs(gap) < 0.01),
      `The gaps between the rows are ${gaps.join(', ')}`,
    );
    for (const name of names) {
      fs.rmSync(path.join(opened, name));
    }
    await waitFor(
      async () => !(await rowNames()).includes('seam4.txt'),
      'the files to be gone from the list',
    );
  });

  test('scrolls the list by whole rows, the rows of the setting for each notch of the wheel, ten unless set, as far as a touchpad goes, a page on Page Down, gliding there once set to, and with the scrollbar alike, gliding after its thumb and coming to rest on a row', async () => {
    const many = path.join(opened, 'many');
    fs.mkdirSync(many);
    for (let index = 0; index < 400; index++) {
      fs.writeFileSync(path.join(many, `file${index}.txt`), '');
    }
    await select('many');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).includes('file10.txt'),
      'the folder of many files',
    );
    const list = right().locator('.virtual-rows');
    const offRow = () =>
      list.evaluate((element) => {
        const row =
          element.querySelector('.commander-row')?.getBoundingClientRect()
            .height ?? 1;
        const rows = element.scrollTop / row;
        return {
          top: element.scrollTop,
          off: Math.abs(rows - Math.round(rows)),
        };
      });

    await list.hover();
    const notched = await scrollPlaces(page, list, () =>
      page.mouse.wheel(0, 300),
    );
    const oneRow = await list.evaluate(
      (element) =>
        element.querySelector('.commander-row')?.getBoundingClientRect()
          .height ?? 0,
    );
    assert.ok(
      Math.abs(
        (notched.at(-1) ?? 0) - oneRow * defaultSettings().scrolling.wheelRows,
      ) < 0.01,
      JSON.stringify(notched),
    );
    assert.ok(betweenRows(notched, oneRow), JSON.stringify(notched));

    const far = await scrollPlaces(page, list, () =>
      list.evaluate((element) => {
        element.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: 2990,
            bubbles: true,
            cancelable: true,
          }),
        );
      }),
    );
    assert.ok((far.at(-1) ?? 0) > 2000, JSON.stringify(far));
    const firstRowOffset = await list.evaluate((element) => {
      const top = element.getBoundingClientRect().top;
      const boxes = [...element.querySelectorAll('.virtual-row')]
        .map((row) => row.getBoundingClientRect())
        .filter((box) => box.bottom > top + 0.5)
        .toSorted((one, other) => one.top - other.top);
      return (boxes[0]?.top ?? top) - top;
    });
    assert.ok(
      Math.abs(firstRowOffset) < 0.01,
      `The first row shown starts ${firstRowOffset} from the top`,
    );

    await list.evaluate((element) => {
      element.scrollTop = 25;
    });
    await waitFor(
      async () => (await offRow()).off < 0.01,
      'a place between rows to snap to a row',
    );
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await waitFor(
      async () => (await offRow()).top > 100 && (await offRow()).off < 0.01,
      'the end of the list to start on a row',
    );

    await list.evaluate((element) => {
      element.scrollTop = 0;
    });
    await list.hover();
    const thumb = page.locator('.overlay-scrollbar.vertical.shown');
    const grabbed = await thumb.boundingBox();
    assert.ok(grabbed, 'the scrollbar of the list');
    await list.evaluate((element) => {
      const row =
        element.querySelector('.commander-row')?.getBoundingClientRect()
          .height ?? 1;
      const offs: number[] = [];
      Reflect.set(window, 'dragOffs', offs);
      const record = () => {
        const rows = element.scrollTop / row;
        offs.push(Math.abs(rows - Math.round(rows)));
        if (Reflect.get(window, 'dragOffs') === offs) {
          requestAnimationFrame(record);
        }
      };
      requestAnimationFrame(record);
    });
    const x = grabbed.x + grabbed.width / 2;
    const y = grabbed.y + grabbed.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let step = 1; step <= 40; step++) {
      await page.mouse.move(x, y + step * 3);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(resolve)),
      );
    }
    await page.mouse.up();
    const offs = await page.evaluate(() => {
      const recorded: unknown = Reflect.get(window, 'dragOffs');
      Reflect.set(window, 'dragOffs', undefined);
      return Array.isArray(recorded) ? recorded.map(Number) : [];
    });
    assert.ok((await offRow()).top > 0, 'the list to scroll on its scrollbar');
    assert.ok(offs.length > 20, String(offs.length));
    assert.ok(
      offs.some((off) => off >= 0.01),
      'the list to glide after the thumb',
    );
    await waitFor(
      async () => (await offRow()).off < 0.01,
      'the list to come to rest on a row',
    );

    await list.evaluate((element) => {
      element.scrollTop = 0;
    });
    await waitFor(async () => (await offRow()).top === 0, 'the top again');
    await list.focus();
    await page.keyboard.press('PageDown');
    const paged = await scrollPlaces(page, list, () =>
      page.keyboard.press('PageDown'),
    );
    assert.ok((paged.at(-1) ?? 0) > oneRow * 5, JSON.stringify(paged));
    assert.ok((await offRow()).off < 0.01, JSON.stringify(await offRow()));
    assert.ok(betweenRows(paged, oneRow), JSON.stringify(paged));

    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('many'),
      'the parent folder',
    );
    fs.rmSync(many, { recursive: true });
    await waitFor(
      async () => !(await rowNames()).includes('many'),
      'the folder to be gone from the list',
    );
  });

  test('keeps the thumb of a side against the header of the side and the line its column draws on the right and at the bottom, clipped by the corner the column rounds as it runs into it', async () => {
    const long = path.join(opened, 'thumbs');
    fs.mkdirSync(long);
    for (let index = 0; index < 200; index++) {
      fs.writeFileSync(path.join(long, `file${index}.txt`), '');
    }
    try {
      await openFolder('thumbs', long);
      await right().locator('.virtual-rows').hover();
      await waitFor(async () => (await thumbGaps()) !== undefined, 'the thumb');
      const atTop = await thumbGaps();
      await page.keyboard.press('End');
      await waitFor(async () => (await thumbGaps())?.atEnd === true, 'the end');
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const atEnd = await thumbGaps();

      assert.deepStrictEqual(
        [atTop?.right, atTop?.top, atEnd?.right, atEnd?.bottom, atEnd?.rounded],
        [0, 0, 0, 0, atEnd?.corner],
        JSON.stringify({ atTop, atEnd }),
      );
    } finally {
      await page.keyboard.press('Backspace');
      fs.rmSync(long, { recursive: true, force: true });
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent()) === opened,
        'the folder opened',
      );
    }
  });

  test('scrolls thumbnails a row of tiles for each notch of the wheel, and for as little touchpad as a row of text, gliding there once set to', async () => {
    const many = path.join(opened, 'many tiles');
    fs.mkdirSync(many);
    for (let index = 0; index < 200; index++) {
      fs.writeFileSync(path.join(many, `tile${index}.txt`), '');
    }
    await select('many tiles');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).includes('tile10.txt'),
      'the folder of many files',
    );
    await page.keyboard.press('ControlOrMeta+2');
    const list = right().locator('.virtual-rows');
    await waitFor(
      async () => (await right().locator('.commander-tile').count()) > 0,
      'the thumbnails',
    );
    const sizes = () =>
      list.evaluate((element) => ({
        top: element.scrollTop,
        tile:
          element.querySelector('.virtual-row')?.getBoundingClientRect()
            .height ?? 0,
        text:
          element.querySelector('.commander-tile-name')?.getBoundingClientRect()
            .height ?? 0,
      }));
    const { tile, text } = await sizes();
    assert.ok(tile > text * 2 && text > 0, JSON.stringify(await sizes()));

    await list.hover();
    const notched = await scrollPlaces(page, list, () =>
      page.mouse.wheel(0, 100),
    );
    assert.ok(
      Math.abs((notched.at(-1) ?? 0) - tile) < 0.01,
      JSON.stringify(notched),
    );
    assert.ok(betweenRows(notched, tile), JSON.stringify(notched));

    const glided = await scrollPlaces(page, list, () =>
      list.evaluate((element, glide) => {
        element.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: glide,
            bubbles: true,
            cancelable: true,
          }),
        );
      }, text + 1),
    );
    assert.ok(
      Math.abs((glided.at(-1) ?? 0) - tile * 2) < 0.01,
      JSON.stringify(glided),
    );
    assert.ok(betweenRows(glided, tile), JSON.stringify(glided));

    await page.keyboard.press('ControlOrMeta+1');
    await waitFor(
      async () => (await right().locator('.commander-tile').count()) === 0,
      'the details again',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('many tiles'),
      'the parent folder',
    );
    fs.rmSync(many, { recursive: true });
    await waitFor(
      async () => !(await rowNames()).includes('many tiles'),
      'the folder to be gone from the list',
    );
  });

  test.skipIf(process.platform !== 'win32')(
    'opens the drive menu of the right side with Alt+F2 and changes the drive by its letter',
    async () => {
      await right().locator('.virtual-rows').focus();
      await page.keyboard.press('Alt+F1');
      await page.locator('.commander-pane').nth(0).locator('.menu').waitFor();
      await page.keyboard.press('Alt+F2');
      await right().locator('.menu').waitFor();
      await page
        .locator('.commander-pane')
        .nth(0)
        .locator('.menu')
        .waitFor({ state: 'detached' });
      await page.keyboard.press(opened.charAt(0).toLowerCase());
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent()) ===
          `${opened.charAt(0).toUpperCase()}:\\`,
        'the root of the drive of the folder opened',
      );
      await page
        .locator('.commander-pane .menu')
        .waitFor({ state: 'detached' });
    },
  );

  test('marks the selected row of the active side only', async () => {
    const left = page.locator('.commander-pane').nth(0);
    const transparent = 'rgba(0, 0, 0, 0)';
    const backgrounds = () =>
      Promise.all(
        [left, right()].map((pane) =>
          pane
            .locator('.commander-row.selected')
            .evaluate((row) => getComputedStyle(row).backgroundColor),
        ),
      );
    const marked = async (expected: readonly [boolean, boolean]) => {
      let seen: string[] = [];
      try {
        await waitFor(async () => {
          seen = await backgrounds();
          return seen.every(
            (color, index) => (color !== transparent) === expected[index],
          );
        }, 'the selected rows');
      } catch {
        assert.fail(
          `Expected the selected row marked on the left ${expected[0]} and on the right ${expected[1]}, but their backgrounds were ${seen.join(' and ')}`,
        );
      }
    };
    await page.mouse.move(0, 0);
    await right().locator('.virtual-rows').focus();
    await waitForFocus(right().locator('.virtual-rows'), 'the right side');
    await marked([false, true]);
    await page.keyboard.press('Tab');
    await waitForFocus(left.locator('.virtual-rows'), 'the left side');
    await marked([true, false]);
    await page.keyboard.press('Tab');
  });

  test.skipIf(process.platform !== 'win32')(
    'opens Users for Documents and Settings, a link no one may list, without saying there is no access',
    async () => {
      const drive = `${opened.charAt(0).toUpperCase()}:\\`;
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent()) === drive,
        'the right side to show the root of the drive',
      );
      await select('Documents and Settings');
      await page.keyboard.press('Enter');
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent()) ===
          `${drive}Users`,
        'the right side to open Users',
      );
      assert.strictEqual(await page.locator('.confirm-popup').count(), 0);
    },
  );

  test('draws rows as the diff draws lines, in the monospace font and its line height', async () => {
    const row = await right()
      .locator('.commander-row')
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          family: style.fontFamily,
          height: element.getBoundingClientRect().height,
          lineHeight: style.lineHeight,
        };
      });
    assert.match(row.family, /JetBrains Mono/);
    assert.ok(
      Math.abs(row.height - parseFloat(row.lineHeight)) < 0.01,
      `${row.height} ${row.lineHeight}`,
    );
  });

  test('shows where columns can be resized once the pointer is on the header, in the focus color on the one under it', async () => {
    const [border, focus] = await page.evaluate(() => {
      const probe = document.createElement('div');
      document.body.append(probe);
      const colors = ['--color-border', '--color-focus'].map((name) => {
        probe.style.backgroundColor = `var(${name})`;
        return getComputedStyle(probe).backgroundColor;
      });
      probe.remove();
      return colors;
    });
    await page.mouse.move(0, 0);
    assert.deepStrictEqual(await lines(), [
      'rgba(0, 0, 0, 0)',
      'rgba(0, 0, 0, 0)',
      'rgba(0, 0, 0, 0)',
    ]);
    await right().locator('.commander-sort').first().hover();
    assert.deepStrictEqual(await lines(), [border, border, border]);
    await right().locator('.column-handle').nth(1).hover({ force: true });
    assert.deepStrictEqual(await lines(), [border, focus, border]);
  });

  test('saves the width of a column dragged in the header to the user settings', async () => {
    const handle = right().locator('.column-handle').first();
    const box = await handle.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 40, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await waitFor(() => {
      const file = path.join(profile, 'settings.user.json');
      if (!fs.existsSync(file)) {
        return false;
      }
      const extension: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
        ?.tools?.commander?.columns?.extension;
      return typeof extension === 'number' && extension > 10;
    }, 'the width of the extension to be saved');
  });

  test('saves the order a header of a side is clicked for to the user settings, for that side', async () => {
    await right().locator('.commander-sort', { hasText: 'Size' }).click();
    await waitFor(() => {
      const file = path.join(profile, 'settings.user.json');
      if (!fs.existsSync(file)) {
        return false;
      }
      const sort: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))?.tools
        ?.commander?.sort;
      return (
        JSON.stringify(sort) ===
        JSON.stringify({
          left: { column: 'extension', descending: false, groupByColor: true },
          right: { column: 'size', descending: false, groupByColor: true },
        })
      );
    }, 'the order of the right side to be saved');
  });
});
