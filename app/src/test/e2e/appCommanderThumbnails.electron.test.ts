import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../support/fixtures';
import {
  opened,
  profile,
  page,
  grayPng,
  withOrientation,
  storedThumbnails,
  right,
  rowNames,
  thumbnailed,
  shownThumbnailOf,
  thumbnailLookOf,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';

const tileNames = () =>
  right().locator('.commander-tile .commander-tile-name').allTextContents();

const selectedTile = async () =>
  (await right()
    .locator('.commander-tile.selected .commander-tile-name')
    .textContent()) ?? '';

const across = () =>
  right()
    .locator('.commander-tile')
    .evaluateAll((elements) => {
      const tops = elements.map(
        (element) => element.getBoundingClientRect().top,
      );
      return tops.filter((top) => top === tops[0]).length;
    });

const layoutLabel = () =>
  right().locator('.commander-layout .menu-button-label').textContent();

const thumbnailOf = (name: string) =>
  right()
    .locator('.commander-tile', { hasText: name })
    .locator('img.thumbnail-image')
    .evaluate((image: HTMLImageElement) => ({
      width: Math.round(image.getBoundingClientRect().width),
      height: Math.round(image.getBoundingClientRect().height),
      pixels: image.naturalWidth,
      ratio: devicePixelRatio,
      complete: image.complete && image.naturalWidth > 0,
    }))
    .catch(() => undefined);

const place = () =>
  right()
    .locator('.virtual-rows')
    .evaluate((list) => {
      const top = list.getBoundingClientRect().top;
      const first = [...list.querySelectorAll('.commander-tile')].find(
        (tile) => tile.getBoundingClientRect().top >= top - 1,
      );
      return {
        scrollTop: Math.round(list.scrollTop),
        first: first?.querySelector('.commander-tile-name')?.textContent,
      };
    });

const selectedName = () =>
  right()
    .locator('.commander-tile.selected .commander-tile-name')
    .textContent();

suite('App commander', () => {
  sharedCommanderApp();

  test('shows a side as thumbnails from the menu of its layout or on Mod+2, each file and folder a tile of its icon, name, size and date, moving among them as on a grid, and as details again on Mod+1, for its tab only, another tab showing details', async () => {
    const tiles = path.join(opened, 'tiles');
    fs.mkdirSync(tiles);
    for (let index = 1; index <= 7; index++) {
      fs.writeFileSync(path.join(tiles, `t${index}.txt`), 'x'.repeat(index));
    }

    await select('tiles');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).includes('t7.txt'),
      'the files of the folder',
    );
    assert.strictEqual(await layoutLabel(), strings.commander.layouts.details);
    await right()
      .locator(`button[title="${strings.commander.layout}"]`)
      .click();
    await page
      .getByRole('menuitemcheckbox', {
        name: strings.commander.layouts.thumbnails,
      })
      .click();
    await waitFor(
      async () => (await tileNames()).length === 8,
      'a tile for each file and the parent folder',
    );
    assert.strictEqual(
      await layoutLabel(),
      strings.commander.layouts.thumbnails,
    );
    assert.strictEqual(
      await right().locator('.commander-row.commander-line').count(),
      0,
    );
    assert.strictEqual(await right().locator('.commander-header').count(), 0);
    assert.strictEqual(await right().locator('.commander-path').count(), 1);
    const third = right().locator('.commander-tile', { hasText: 't3.txt' });
    assert.strictEqual(
      await third.locator('.commander-tile-size').textContent(),
      '3',
    );
    assert.match(
      (await third.locator('.commander-tile-date').textContent()) ?? '',
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    );
    await third.locator('.commander-thumbnail .commander-icon').waitFor();

    const names = await tileNames();
    const columns = await across();
    assert.ok(columns > 1 && columns < 8, String(columns));
    await page.keyboard.press('Home');
    await waitFor(
      async () => (await selectedTile()) === names[0],
      'the first tile, the keys going to the tiles once chosen from the menu',
    );
    await page.keyboard.press('ArrowRight');
    await waitFor(
      async () => (await selectedTile()) === names[1],
      'the tile on the right',
    );
    await page.keyboard.press('ArrowDown');
    await waitFor(
      async () => (await selectedTile()) === names[1 + columns],
      'the tile below',
    );
    await page.keyboard.press('ArrowLeft');
    await waitFor(
      async () => (await selectedTile()) === names[columns],
      'the tile on the left',
    );
    await page.keyboard.press('ArrowUp');
    await waitFor(
      async () => (await selectedTile()) === names[0],
      'the tile above',
    );
    await page.keyboard.press('End');
    await waitFor(
      async () => (await selectedTile()) === names.at(-1),
      'the last tile',
    );

    await page.keyboard.press('ControlOrMeta+1');
    await waitFor(
      async () => (await right().locator('.commander-tile').count()) === 0,
      'the details again',
    );
    assert.ok((await rowNames()).includes('t7.txt'));
    await page.keyboard.press('ControlOrMeta+2');
    await waitFor(
      async () => (await tileNames()).length === 8,
      'the thumbnails again',
    );

    await page.locator('.tab-add').click();
    await page
      .locator('.menu-item', { hasText: strings.tools.commander })
      .click();
    await waitFor(
      async () => (await page.locator('.tabs [role="tab"]').count()) === 2,
      'another commander tab',
    );
    await waitFor(
      async () =>
        (await layoutLabel()) === strings.commander.layouts.details &&
        (await right().locator('.commander-row').count()) > 0,
      'the other tab showing details',
    );
    assert.strictEqual(await right().locator('.commander-tile').count(), 0);
    await page.keyboard.press('ControlOrMeta+W');
    await waitFor(
      async () => (await page.locator('.tabs [role="tab"]').count()) === 1,
      'the other tab closed',
    );
    await waitFor(
      async () => (await tileNames()).length === 8,
      'the thumbnails of the first tab again',
    );
    assert.strictEqual(
      await layoutLabel(),
      strings.commander.layouts.thumbnails,
    );
    await right().locator('.commander-tile').first().click();
    await page.keyboard.press('ControlOrMeta+1');
    await waitFor(
      async () => (await right().locator('.commander-tile').count()) === 0,
      'the details once more',
    );

    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('notes.txt'),
      'the folder above',
    );
    fs.rmSync(tiles, { recursive: true });
    await waitFor(
      async () => !(await rowNames()).includes('tiles'),
      'the folder to be gone from the list',
    );
  });

  test('shows an image as a thumbnail of it fitted to its tile in pixels of the screen, a small one at its own size, an SVG drawn as it is, and the icon for other files', async () => {
    const pictures = path.join(opened, 'pictures');
    fs.mkdirSync(pictures);
    fs.writeFileSync(path.join(pictures, 'wide.png'), grayPng(600, 300));
    fs.writeFileSync(path.join(pictures, 'small.png'), grayPng(20, 10));
    fs.writeFileSync(path.join(pictures, 'tall.png'), grayPng(300, 600));
    fs.writeFileSync(
      path.join(pictures, 'logo.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200"/></svg>',
    );
    fs.writeFileSync(path.join(pictures, 'notes.txt'), 'notes');

    await select('pictures');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).includes('wide.png'),
      'the files of the folder',
    );
    await page.keyboard.press('ControlOrMeta+2');
    await waitFor(
      async () => (await thumbnailOf('wide.png'))?.complete === true,
      'the thumbnail of the wide image',
    );
    const wide = await thumbnailOf('wide.png');
    assert.deepStrictEqual(
      { width: wide?.width, height: wide?.height },
      { width: 144, height: 72 },
    );
    assert.strictEqual(wide?.pixels, Math.round(144 * (wide?.ratio ?? 1)));
    await waitFor(
      async () => (await thumbnailOf('tall.png'))?.complete === true,
      'the thumbnail of the tall image',
    );
    const tall = await thumbnailOf('tall.png');
    assert.deepStrictEqual(
      { width: tall?.width, height: tall?.height },
      { width: 72, height: 144 },
    );
    assert.strictEqual(tall?.pixels, Math.round(72 * (tall?.ratio ?? 1)));
    await waitFor(
      async () => (await thumbnailOf('small.png'))?.complete === true,
      'the thumbnail of the small image',
    );
    const small = await thumbnailOf('small.png');
    assert.deepStrictEqual(
      { width: small?.width, height: small?.height },
      { width: 20, height: 10 },
    );
    await waitFor(
      async () => (await thumbnailOf('logo.svg'))?.complete === true,
      'the SVG drawn',
    );
    const logo = await thumbnailOf('logo.svg');
    assert.deepStrictEqual(
      { width: logo?.width, height: logo?.height },
      { width: 144, height: 72 },
    );
    const notes = right().locator('.commander-tile', { hasText: 'notes.txt' });
    await notes.locator('.commander-icon').waitFor();
    assert.strictEqual(await notes.locator('img.thumbnail-image').count(), 0);

    await page.keyboard.press('ControlOrMeta+1');
    await waitFor(
      async () => (await right().locator('.commander-tile').count()) === 0,
      'the details again',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('notes.txt'),
      'the folder above',
    );
    fs.rmSync(pictures, { recursive: true });
    await waitFor(
      async () => !(await rowNames()).includes('pictures'),
      'the folder to be gone from the list',
    );
  });

  test('makes the thumbnails of the tiles in view only, so a folder of many images shows those on screen first, and those further down once scrolled to', async () => {
    const many = path.join(opened, 'many');
    fs.mkdirSync(many);
    const image = grayPng(600, 300);
    for (let index = 10; index < 70; index++) {
      fs.writeFileSync(path.join(many, `p${index}.png`), image);
    }
    await select('many');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).includes('p10.png'),
      'the files of the folder',
    );
    await page.keyboard.press('ControlOrMeta+2');
    await waitFor(
      async () => (await thumbnailed()).some((each) => each.name === 'p10.png'),
      'the first thumbnails',
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    const first = await thumbnailed();
    assert.ok(first.length > 0 && first.length < 60, String(first.length));
    assert.ok(
      first.every((each) => each.inView),
      JSON.stringify(first.filter((each) => !each.inView)),
    );
    await page.keyboard.press('End');
    await waitFor(
      async () => (await thumbnailed()).some((each) => each.name === 'p69.png'),
      'the thumbnail of the last image once scrolled to',
    );

    await page.keyboard.press('ControlOrMeta+1');
    await waitFor(
      async () => (await right().locator('.commander-tile').count()) === 0,
      'the details again',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('notes.txt'),
      'the folder above',
    );
    fs.rmSync(many, { recursive: true });
    await waitFor(
      async () => !(await rowNames()).includes('many'),
      'the folder to be gone from the list',
    );
  });

  test('keeps a side shown as thumbnails scrolled where it was once a file viewed from it is closed, rather than moving its tiles', async () => {
    const scrolled = path.join(opened, 'scrolled');
    fs.mkdirSync(scrolled);
    const image = grayPng(600, 300);
    for (let index = 10; index < 50; index++) {
      fs.writeFileSync(path.join(scrolled, `s${index}.png`), image);
    }

    await select('scrolled');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).includes('s10.png'),
      'the files of the folder',
    );
    await page.keyboard.press('ControlOrMeta+2');
    await right().locator('.commander-tile').first().waitFor();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowUp');
    await waitFor(
      async () => (await place()).scrollTop > 0,
      'the tiles scrolled down',
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    const before = await place();
    await page.keyboard.press('F3');
    await page.locator('.viewer').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    await right().locator('.commander-tile').first().waitFor();
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepStrictEqual(await place(), before);
    const selectedBefore = await selectedName();
    await page.keyboard.press('ArrowLeft');
    await waitFor(
      async () => (await selectedName()) !== selectedBefore,
      'the keys to move among the tiles again',
    );

    await page.keyboard.press('ControlOrMeta+1');
    await waitFor(
      async () => (await right().locator('.commander-tile').count()) === 0,
      'the details again',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('notes.txt'),
      'the folder above',
    );
    fs.rmSync(scrolled, { recursive: true });
    await waitFor(
      async () => !(await rowNames()).includes('scrolled'),
      'the folder to be gone from the list',
    );
  });

  test('keeps the thumbnails it made in a folder of its own, showing one from there once the page starts again, without reading its image', async () => {
    const cached = path.join(opened, 'cached');
    fs.mkdirSync(cached);
    const wide = path.join(cached, 'wide.png');
    fs.writeFileSync(wide, grayPng(600, 300));
    const stored = path.join(profile, 'Thumbnails');
    const storedCount = () =>
      fs.existsSync(stored)
        ? fs.readdirSync(stored).filter((name) => name.endsWith('.webp')).length
        : 0;
    const storedBefore = storedCount();
    await select('cached');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).includes('wide.png'),
      'the files of the folder',
    );
    await page.keyboard.press('ControlOrMeta+2');
    await waitFor(
      async () => (await shownThumbnailOf('wide.png')) > 0,
      'the thumbnail',
    );
    await waitFor(
      () => storedCount() > storedBefore,
      'the thumbnail of this image kept',
    );

    const { atimeMs, mtimeMs, size } = fs.statSync(wide);
    const junk = path.join(opened, 'junk.tmp');
    fs.writeFileSync(junk, Buffer.alloc(size, 7));
    fs.utimesSync(junk, atimeMs / 1000, mtimeMs / 1000);
    fs.renameSync(junk, wide);
    await page.reload();
    await waitFor(
      async () => (await rowNames()).includes('wide.png'),
      'the files of the folder, as details once the page starts again',
    );
    await page.keyboard.press('ControlOrMeta+2');
    await waitFor(
      async () => (await shownThumbnailOf('wide.png')) > 0,
      'the thumbnail kept, as the image no longer decodes',
    );

    await page.keyboard.press('ControlOrMeta+1');
    await waitFor(
      async () => (await right().locator('.commander-tile').count()) === 0,
      'the details again',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('notes.txt'),
      'the folder above',
    );
    fs.rmSync(cached, { recursive: true });
    await waitFor(
      async () => !(await rowNames()).includes('cached'),
      'the folder to be gone from the list',
    );
  });

  test('turns the thumbnail of a JPEG as its EXIF asks, decoding it at a fraction of its size', async () => {
    const jpegs = path.join(opened, 'jpegs');
    fs.mkdirSync(jpegs);
    const darkLeft = Buffer.from(
      await page.evaluate(async () => {
        const canvas = new OffscreenCanvas(600, 300);
        const context = canvas.getContext('2d');
        if (context === null) {
          return [];
        }
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 600, 300);
        context.fillStyle = '#000000';
        context.fillRect(0, 0, 300, 300);
        const blob = await canvas.convertToBlob({
          type: 'image/jpeg',
          quality: 0.9,
        });
        return [...new Uint8Array(await blob.arrayBuffer())];
      }),
    );
    fs.writeFileSync(path.join(jpegs, 'photo.jpg'), darkLeft);
    fs.writeFileSync(
      path.join(jpegs, 'turned.jpg'),
      withOrientation(darkLeft, 6),
    );
    await select('jpegs');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).includes('turned.jpg'),
      'the files of the folder',
    );
    await page.keyboard.press('ControlOrMeta+2');
    await waitFor(
      async () =>
        (await thumbnailLookOf('photo.jpg')) !== undefined &&
        (await thumbnailLookOf('turned.jpg')) !== undefined,
      'the thumbnails of the JPEGs',
    );
    const photo = await thumbnailLookOf('photo.jpg');
    assert.deepStrictEqual(
      { width: photo?.width, height: photo?.height },
      { width: 144, height: 72 },
    );
    assert.ok(
      (photo?.left ?? 255) < 60 && (photo?.right ?? 0) > 200,
      JSON.stringify(photo),
    );
    const turned = await thumbnailLookOf('turned.jpg');
    assert.deepStrictEqual(
      { width: turned?.width, height: turned?.height },
      { width: 72, height: 144 },
    );
    assert.ok(
      (turned?.top ?? 255) < 60 && (turned?.bottom ?? 0) > 200,
      JSON.stringify(turned),
    );

    await page.keyboard.press('ControlOrMeta+1');
    await waitFor(
      async () => (await right().locator('.commander-tile').count()) === 0,
      'the details again',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('notes.txt'),
      'the folder above',
    );
    fs.rmSync(jpegs, { recursive: true });
    await waitFor(
      async () => !(await rowNames()).includes('jpegs'),
      'the folder to be gone from the list',
    );
  });

  test('makes the thumbnails of every image of a folder shown as thumbnails in the background, not only those in view, without a scroll', async () => {
    const filled = path.join(opened, 'filled');
    fs.mkdirSync(filled);
    const image = grayPng(600, 300);
    for (let index = 100; index < 180; index++) {
      fs.writeFileSync(path.join(filled, `f${index}.png`), image);
    }
    const before = storedThumbnails(profile);

    await select('filled');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).includes('f100.png'),
      'the files of the folder',
    );
    await page.keyboard.press('ControlOrMeta+2');
    await waitFor(
      () => storedThumbnails(profile) >= before + 80,
      'a thumbnail kept for every image of the folder',
    );

    await page.keyboard.press('ControlOrMeta+1');
    await waitFor(
      async () => (await right().locator('.commander-tile').count()) === 0,
      'the details again',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('notes.txt'),
      'the folder above',
    );
    fs.rmSync(filled, { recursive: true });
    await waitFor(
      async () => !(await rowNames()).includes('filled'),
      'the folder to be gone from the list',
    );
  });

  test('stops making the thumbnails of a folder in the background once the side shows its details', async () => {
    const stopped = path.join(opened, 'stopped');
    fs.mkdirSync(stopped);
    const image = grayPng(1200, 900);
    for (let index = 100; index < 500; index++) {
      fs.writeFileSync(path.join(stopped, `s${index}.png`), image);
    }
    const before = storedThumbnails(profile);

    await select('stopped');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).includes('s100.png'),
      'the files of the folder',
    );
    await page.keyboard.press('ControlOrMeta+2');
    await waitFor(
      () => storedThumbnails(profile) >= before + 30,
      'the background filling to be under way',
    );
    await page.keyboard.press('ControlOrMeta+1');
    await waitFor(
      async () => (await right().locator('.commander-tile').count()) === 0,
      'the details again',
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    const whenStopped = storedThumbnails(profile);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const later = storedThumbnails(profile);
    assert.ok(later <= whenStopped + 2, `${whenStopped} then ${later}`);
    assert.ok(later < before + 400, String(later - before));

    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('notes.txt'),
      'the folder above',
    );
    fs.rmSync(stopped, { recursive: true });
    await waitFor(
      async () => !(await rowNames()).includes('stopped'),
      'the folder to be gone from the list',
    );
  });
});
