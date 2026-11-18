import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { defaultSettings, waitFor } from '../helpers/fixtures';
import { scrollPlaces } from './scrollProbes';
import {
  opened,
  page,
  betweenRows,
  right,
  rowNames,
  thumbGaps,
  select,
  openFolder,
  sharedCommanderApp,
} from './commanderAppFixtures';

suite('App commander', () => {
  sharedCommanderApp();

  test('scrolls the list by whole rows, the rows of the setting for each notch of the wheel, ten unless set, by the pixels of a touchpad, a page on Page Down, gliding there once set to, and with the scrollbar alike, following its thumb between rows and coming to rest on a row once let go', async () => {
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
      'the list to follow the thumb between rows',
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

  test('scrolls thumbnails a row of tiles for each notch of the wheel, and settles a row of tiles on for as little touchpad as a row of text, once it rests', async () => {
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
});
