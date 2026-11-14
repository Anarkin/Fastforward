import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import {
  opened,
  profile,
  app,
  page,
  grayPng,
  savedSetting,
  rowNames,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';

const pressedMode = () =>
  page
    .locator('.viewer .segmented [aria-pressed="true"]')
    .getAttribute('title');

const imageWidth = (selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((image: HTMLImageElement) => image.naturalWidth)
    .catch(() => 0);

const close = async () => {
  await page.keyboard.press('Escape');
  await page.locator('.viewer').waitFor({ state: 'detached' });
};

const previewSize = () =>
  page.locator('.viewer-preview').evaluate((body) => {
    const image = body.querySelector('img');
    const box = image?.getBoundingClientRect();
    return {
      width: (box?.width ?? 0) * devicePixelRatio,
      height: (box?.height ?? 0) * devicePixelRatio,
      natural: image?.naturalWidth ?? 0,
      left: body.scrollLeft,
      top: body.scrollTop,
      widest: body.scrollWidth - body.clientWidth,
      tallest: body.scrollHeight - body.clientHeight,
    };
  });

const zoomTo = async (ratio: number) => {
  await app.evaluate(({ BrowserWindow, screen }, wanted) => {
    const window = BrowserWindow.getAllWindows().toSorted(
      (a, b) => a.id - b.id,
    )[0];
    const display = screen.getDisplayMatching(
      window?.getBounds() ?? { x: 0, y: 0, width: 1, height: 1 },
    );
    window?.webContents.setZoomFactor(wanted / display.scaleFactor);
  }, ratio);
  await waitFor(
    () => page.evaluate((wanted) => devicePixelRatio === wanted, ratio),
    `the window at ${ratio * 100}%`,
  );
};

const roundedPreviewSize = () =>
  page.locator('.viewer-preview').evaluate((body) => {
    const image = body.querySelector('img');
    const box = image?.getBoundingClientRect();
    return {
      width: Math.round((box?.width ?? 0) * devicePixelRatio),
      height: Math.round((box?.height ?? 0) * devicePixelRatio),
      natural: image?.naturalWidth ?? 0,
      widest: body.scrollWidth - body.clientWidth,
      tallest: body.scrollHeight - body.clientHeight,
    };
  });

const view = async (name: string, natural: number) => {
  await select(name);
  await page.keyboard.press('F3');
  await waitFor(
    async () => (await roundedPreviewSize()).natural === natural,
    'the image',
  );
};

suite('App commander', () => {
  sharedCommanderApp();

  test('previews an image, an SVG and Markdown with its images, offering hex, text and the preview from the least to the most particular, switching to the source with 2, and offers no preview for other files', async () => {
    const dot = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    fs.writeFileSync(path.join(opened, 'dot.png'), dot);
    fs.writeFileSync(
      path.join(opened, 'logo.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
    fs.mkdirSync(path.join(opened, 'pics'));
    fs.writeFileSync(path.join(opened, 'pics', 'dot.png'), dot);
    fs.writeFileSync(
      path.join(opened, 'doc.md'),
      ['# Title', '', '![dot](pics/dot.png)', ''].join(String.fromCharCode(10)),
    );
    fs.writeFileSync(path.join(opened, 'plain.txt'), 'plain');

    await select('dot');
    await page.keyboard.press('F3');
    await waitFor(
      async () => (await imageWidth('.viewer-image img')) === 1,
      'the image',
    );
    assert.strictEqual(await pressedMode(), 'Preview');
    await close();

    await select('logo');
    await page.keyboard.press('F3');
    await waitFor(
      async () => (await imageWidth('.viewer-image img')) === 10,
      'the SVG drawn',
    );
    assert.deepStrictEqual(
      await page
        .locator('.viewer .segmented button')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('title')),
        ),
      ['Hex', 'Text', 'Preview'],
    );
    await page.keyboard.press('2');
    await waitFor(
      async () =>
        (
          (await page
            .locator('.viewer-rows .viewer-row')
            .first()
            .textContent()) ?? ''
        ).startsWith('<svg'),
      'the SVG source',
    );
    await close();

    await select('doc');
    await page.keyboard.press('F3');
    await waitFor(
      async () =>
        (await page
          .locator('.viewer .markdown h1')
          .first()
          .textContent()
          .catch(() => '')) === 'Title',
      'the heading',
    );
    await waitFor(
      async () => (await imageWidth('.viewer .markdown img')) === 1,
      'the image of the document',
    );
    await close();

    await select('plain');
    await page.keyboard.press('F3');
    await waitFor(
      async () => (await pressedMode()) === 'Text',
      'the text view',
    );
    assert.strictEqual(
      await page.locator('.viewer .segmented [title="Preview"]').count(),
      0,
    );
    await page.keyboard.press('3');
    assert.strictEqual(await pressedMode(), 'Text');
    await close();

    for (const name of ['dot.png', 'logo.svg', 'doc.md', 'plain.txt']) {
      fs.rmSync(path.join(opened, name));
    }
    fs.rmSync(path.join(opened, 'pics'), { recursive: true });
    await waitFor(async () => {
      const names = await rowNames();
      return !['dot.png', 'logo.svg', 'doc.md', 'plain.txt', 'pics'].some(
        (name) => names.includes(name),
      );
    }, 'the files to be gone from the list');
  });

  test('shows an image previewed at its real size on F, a pixel of it on a pixel of the screen, from its middle, scrolled by the keys, saved for the next image, and fitted to the viewer again on its button', async () => {
    fs.writeFileSync(path.join(opened, 'huge.png'), grayPng(3000, 2000));
    const realSize = page.locator(
      `.viewer button[title="${strings.commander.realSize}"]`,
    );
    const openHuge = async () => {
      await select('huge');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await previewSize()).natural === 3000,
        'the image',
      );
    };

    await openHuge();
    const fitted = await previewSize();
    assert.ok(fitted.width < 3000, JSON.stringify(fitted));
    assert.strictEqual(fitted.widest, 0);
    assert.strictEqual(await realSize.getAttribute('aria-pressed'), 'false');

    await page.keyboard.press('f');
    await waitFor(
      async () => Math.round((await previewSize()).width) === 3000,
      'the image at its real size',
    );
    const real = await previewSize();
    assert.strictEqual(Math.round(real.height), 2000);
    assert.ok(real.widest > 0 && real.tallest > 0, JSON.stringify(real));
    assert.ok(Math.abs(real.left - real.widest / 2) <= 1, JSON.stringify(real));
    assert.ok(Math.abs(real.top - real.tallest / 2) <= 1, JSON.stringify(real));
    assert.strictEqual(await realSize.getAttribute('aria-pressed'), 'true');
    await waitFor(
      () => savedSetting(profile, 'images', 'realSize') === true,
      'real size to be saved',
    );

    await page.keyboard.press('Home');
    await waitFor(async () => (await previewSize()).top === 0, 'the top');
    await page.keyboard.press('ArrowDown');
    await waitFor(async () => (await previewSize()).top > 0, 'a row down');
    await page.keyboard.press('End');
    await waitFor(async () => {
      const { top, tallest } = await previewSize();
      return Math.abs(top - tallest) <= 1;
    }, 'the bottom');
    const before = (await previewSize()).left;
    await page.keyboard.press('ArrowRight');
    await waitFor(
      async () => (await previewSize()).left > before,
      'to the right',
    );
    await close();

    await openHuge();
    await waitFor(
      async () => Math.round((await previewSize()).width) === 3000,
      'the next image at its real size',
    );
    await realSize.click();
    await waitFor(
      async () => (await previewSize()).width < 3000,
      'the image fitted again',
    );
    assert.strictEqual((await previewSize()).widest, 0);
    await waitFor(
      () => savedSetting(profile, 'images', 'realSize') === undefined,
      'the default to be saved',
    );
    await close();

    fs.rmSync(path.join(opened, 'huge.png'));
    await waitFor(
      async () => !(await rowNames()).includes('huge.png'),
      'the image to be gone from the list',
    );
  });

  test('fits an image smaller than the viewer at its real size at 125%, a pixel of it on a pixel of the screen as F shows it, rather than enlarged to the pixels of the page, and shrinks one larger than the viewer to fit', async () => {
    fs.writeFileSync(path.join(opened, 'small.png'), grayPng(400, 300));
    fs.writeFileSync(path.join(opened, 'huge.png'), grayPng(3000, 2000));
    const realSize = page.locator(
      `.viewer button[title="${strings.commander.realSize}"]`,
    );
    const display = await page.evaluate(() => devicePixelRatio);

    await zoomTo(1.25);
    try {
      await view('small', 400);
      assert.strictEqual(await realSize.getAttribute('aria-pressed'), 'false');
      await waitFor(
        async () => (await roundedPreviewSize()).width === 400,
        'the image fitted at its real size',
      );
      assert.strictEqual((await roundedPreviewSize()).height, 300);

      await page.keyboard.press('f');
      await waitFor(
        async () => (await realSize.getAttribute('aria-pressed')) === 'true',
        'real size',
      );
      assert.deepStrictEqual(
        {
          width: (await roundedPreviewSize()).width,
          height: (await roundedPreviewSize()).height,
        },
        { width: 400, height: 300 },
      );
      await page.keyboard.press('f');
      await waitFor(
        () => savedSetting(profile, 'images', 'realSize') === undefined,
        'the default to be saved',
      );
      await close();

      await view('huge', 3000);
      const fitted = await roundedPreviewSize();
      assert.ok(fitted.width < 3000, JSON.stringify(fitted));
      assert.strictEqual(
        Math.round((fitted.width / fitted.height) * 100),
        150,
        JSON.stringify(fitted),
      );
      assert.strictEqual(fitted.widest, 0);
      assert.strictEqual(fitted.tallest, 0);
      await close();
    } finally {
      await zoomTo(display);
    }

    fs.rmSync(path.join(opened, 'small.png'));
    fs.rmSync(path.join(opened, 'huge.png'));
    await waitFor(async () => {
      const names = await rowNames();
      return !names.includes('small.png') && !names.includes('huge.png');
    }, 'the images to be gone from the list');
  });
});
