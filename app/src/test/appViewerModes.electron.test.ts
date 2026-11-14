import * as assert from 'node:assert';
import { maxColoredBytes } from '../tools/commander/shared/protocol';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../lib/shared/strings';
import { waitFor } from './fixtures';
import { waitForFocus } from './appFixtures';
import {
  opened,
  profile,
  app,
  page,
  grayPng,
  savedSetting,
  savedText,
  right,
  rowNames,
  shownState,
  closeViewer,
  firstViewerRow,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';

const languageLabel = () =>
  page.locator('.viewer .language-button .menu-button-label').textContent();

const checkedLanguage = () =>
  page
    .locator('.viewer .language-button .menu-item[aria-checked="true"]')
    .textContent();

const chooseLanguage = async (typed: string) => {
  await page.keyboard.press('l');
  await page.locator('.viewer .language-button .menu-filter').waitFor();
  await page.keyboard.type(typed);
  await page.keyboard.press('Enter');
  await page.locator('.viewer .language-button .menu').waitFor({
    state: 'detached',
  });
};

const reopen = async () => {
  await page.keyboard.press('Escape');
  await page.locator('.viewer').waitFor({ state: 'detached' });
  await waitForFocus(
    right().locator('.virtual-rows'),
    'the list of the right side',
  );
  await page.keyboard.press('F3');
  await page
    .locator('.viewer-rows .viewer-row')
    .first()
    .waitFor()
    .catch(async (error: unknown) => {
      throw new Error(`${String(error)}: ${await shownState()}`);
    });
};

const lastKeyword = () =>
  page
    .locator('.viewer-rows .viewer-row')
    .last()
    .locator('.syntax-keyword')
    .count();

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

  test('scrolls a file viewed sideways while its lines are not wrapped, on its overlay scrollbar, Shift and the wheel, or Left and Right, keeping the width of the widest row seen as it scrolls away, drawing only the columns near the screen yet copying rows whole, and brings a match off to the side into view', async () => {
    const long = `start ${'x'.repeat(600)} found`;
    fs.writeFileSync(
      path.join(opened, 'wide.txt'),
      [long, ...Array.from({ length: 300 }, (_, index) => `row ${index}`)].join(
        String.fromCharCode(10),
      ),
    );
    const sideways = page.locator('.viewer-sideways');
    const across = () =>
      sideways.evaluate((element) => ({
        left: element.scrollLeft,
        width: element.scrollWidth,
        shown: element.clientWidth,
      }));
    try {
      await select('wide');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()).startsWith('start'),
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      await page.keyboard.press('w');
      await waitFor(async () => {
        const { width, shown } = await across();
        return width > shown + 100;
      }, 'the long line too wide to show');
      const drawn =
        (await page
          .locator('.viewer-rows .viewer-row')
          .first()
          .textContent()) ?? '';
      assert.ok(drawn.length < long.length, String(drawn.length));
      await page.evaluate(() => {
        const shown = [
          ...document.querySelectorAll('.viewer-rows .viewer-row'),
        ];
        const range = document.createRange();
        range.setStartBefore(shown[0] ?? document.body);
        range.setEnd(shown[1]?.firstChild ?? document.body, 2);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
        window.addEventListener(
          'copy',
          (event) =>
            Reflect.set(
              window,
              'copied',
              event.clipboardData?.getData('text/plain'),
            ),
          { once: true },
        );
      });
      await page.keyboard.press('ControlOrMeta+C');
      assert.strictEqual(
        await page.evaluate((): unknown => Reflect.get(window, 'copied')),
        `${long}${String.fromCharCode(10)}ro`,
      );
      await page.evaluate(() => getSelection()?.removeAllRanges());

      await page.locator('.viewer-rows').hover();
      await page.locator('.overlay-scrollbar.horizontal.shown').waitFor();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await waitFor(async () => (await across()).left > 0, 'a step sideways');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await waitFor(async () => (await across()).left === 0, 'back again');
      await page.keyboard.down('Shift');
      await page.mouse.wheel(0, 300);
      await page.keyboard.up('Shift');
      await waitFor(
        async () => (await across()).left > 0,
        'the wheel sideways',
      );
      assert.ok((await firstViewerRow()).startsWith('start'));

      const before = await across();
      await page.keyboard.press('PageDown');
      await waitFor(
        async () => (await firstViewerRow()).startsWith('row'),
        'the long line scrolled away',
      );
      const after = await across();
      assert.deepStrictEqual(
        [after.left, after.width],
        [before.left, before.width],
      );

      await page.keyboard.press('Home');
      await waitFor(
        async () => (await firstViewerRow()).startsWith('start'),
        'the start again',
      );
      await sideways.evaluate((element) => {
        element.scrollLeft = 0;
      });
      await page.keyboard.press('ControlOrMeta+F');
      await page.keyboard.type('found');
      await page.keyboard.press('Enter');
      await waitFor(
        () =>
          page.evaluate(() => {
            const mark = document.querySelector('.find-match.current');
            const area = document.querySelector('.viewer-sideways');
            if (mark === null || area === null) {
              return false;
            }
            const box = mark.getBoundingClientRect();
            const shown = area.getBoundingClientRect();
            return box.left >= shown.left && box.right <= shown.right;
          }),
        'the match brought into view',
      );
      await page.keyboard.press('Escape');

      await page.keyboard.press('w');
      await waitFor(async () => {
        const { left, width, shown } = await across();
        return left === 0 && width <= shown + 1;
      }, 'the lines wrapped to the width again');
    } finally {
      for (
        let presses = 0;
        presses < 3 && (await page.locator('.viewer').isVisible());
        presses++
      ) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
      await page.locator('.viewer').waitFor({ state: 'detached' });
      fs.rmSync(path.join(opened, 'wide.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('wide.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('knows the width of the widest line of a file viewed without wrapping as soon as it opens, however far down it is, as the diff knows the widest of its lines, rather than widening as rows are read', async () => {
    const long = `start ${'x'.repeat(600)} end`;
    fs.writeFileSync(
      path.join(opened, 'widest last.txt'),
      [
        ...Array.from({ length: 3000 }, (_, index) => `row ${index}`),
        long,
      ].join(String.fromCharCode(10)),
    );
    const sideways = page.locator('.viewer-sideways');
    try {
      await select('widest last');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === 'row 0',
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      await page.keyboard.press('w');
      const widthAndAdvance = () =>
        sideways.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(
            element.querySelector('.viewer-rows .viewer-row') ?? element,
          );
          return {
            width: element.scrollWidth,
            char: range.getBoundingClientRect().width / 'row 0'.length,
          };
        });
      await waitFor(async () => {
        const { width, char } = await widthAndAdvance();
        return char > 0 && width >= long.length * char;
      }, 'the width of the last line');
      assert.strictEqual(await firstViewerRow(), 'row 0');
      await page.keyboard.press('w');
      await waitFor(
        () => savedText(profile, 'wordWrap') === undefined,
        'the wrapping left to the default',
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'widest last.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('widest last.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('colors the code of a file viewed as the diff colors it, a long one from the top as its lines are done, none while Plain Text is chosen from the menu L opens, which files viewed and diffs start in until Auto is, and a file in the language chosen there, found by what is typed, for as long as it is viewed, leaving a file over the size colored plain, and previews no Markdown over a size of its own', async () => {
    try {
      fs.writeFileSync(path.join(opened, 'code.ts'), 'const answer = 42;');
      await select('code');
      await page.keyboard.press('F3');
      await waitFor(
        async () =>
          (await page
            .locator('.viewer-row .syntax-keyword')
            .first()
            .textContent()) === 'const',
        'the keyword colored',
      );
      const colors = await page.evaluate(() => {
        const keyword = document.querySelector('.viewer-row .syntax-keyword');
        const plain = document.querySelector('.viewer-row');
        return keyword && plain
          ? [getComputedStyle(keyword).color, getComputedStyle(plain).color]
          : [];
      });
      assert.notStrictEqual(colors[0], colors[1]);
      assert.strictEqual(await languageLabel(), 'TypeScript');
      await page.keyboard.press('l');
      assert.strictEqual(await checkedLanguage(), '✓Auto: TypeScript');
      await page.keyboard.press('Escape');
      await chooseLanguage('plain');
      await page.locator('.viewer-row .syntax-keyword').first().waitFor({
        state: 'detached',
      });
      assert.strictEqual(await languageLabel(), 'Plain Text');
      await waitFor(
        () => savedText(profile, 'highlightSyntax') === false,
        'Plain Text saved',
      );
      await reopen();
      assert.strictEqual(await languageLabel(), 'Plain Text');
      await chooseLanguage('typescript');
      await page.locator('.viewer-row .syntax-keyword').first().waitFor();
      assert.strictEqual(savedText(profile, 'highlightSyntax'), false);
      await reopen();
      assert.strictEqual(await languageLabel(), 'Plain Text');
      await chooseLanguage('auto');
      await page.locator('.viewer-row .syntax-keyword').first().waitFor();
      assert.strictEqual(await languageLabel(), 'TypeScript');
      await waitFor(
        () => savedText(profile, 'highlightSyntax') === undefined,
        'Auto saved, as the default',
      );
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });

      fs.writeFileSync(path.join(opened, 'script.txt'), 'const answer = 42;');
      await select('script');
      await page.keyboard.press('F3');
      await page.locator('.viewer-rows .viewer-row').first().waitFor();
      assert.strictEqual(await languageLabel(), 'Plain Text');
      await chooseLanguage('javascript');
      await waitFor(
        async () =>
          (await page
            .locator('.viewer-row .syntax-keyword')
            .first()
            .textContent()) === 'const',
        'the text colored in the language chosen',
      );
      assert.strictEqual(await languageLabel(), 'JavaScript');
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });
      fs.rmSync(path.join(opened, 'script.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('script.txt'),
        'script.txt to be gone from the list',
      );

      fs.writeFileSync(
        path.join(opened, 'lines.ts'),
        Array.from({ length: 6000 }, (_, index) => `let a${index} = 1;`).join(
          String.fromCharCode(10),
        ),
      );
      await select('lines');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await lastKeyword()) > 0,
        'the first lines colored',
      );
      await page.keyboard.press('End');
      await waitFor(
        async () =>
          (await page
            .locator('.viewer-rows .viewer-row')
            .last()
            .textContent()) === 'let a5999 = 1;' && (await lastKeyword()) > 0,
        'the last line colored',
      );
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });

      fs.writeFileSync(
        path.join(opened, 'over.ts'),
        `let first = 1;${String.fromCharCode(10).repeat(1024 * 1024)}`,
      );
      await select('over');
      await page.keyboard.press('F3');
      await waitFor(
        async () =>
          (await page
            .locator('.viewer-rows .viewer-row')
            .first()
            .textContent()) === 'let first = 1;' &&
          (await page.locator('.viewer-row .syntax-keyword').count()) > 0,
        'the first line of a file over a megabyte colored',
      );
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });

      fs.writeFileSync(
        path.join(opened, 'over.md'),
        `# Over${String.fromCharCode(10).repeat(1024 * 1024)}`,
      );
      await select('overmd');
      await page.keyboard.press('F3');
      await waitFor(
        async () =>
          (await page.locator('.viewer .markdown-note').textContent()) ===
          'Documents over 1 MB are not previewed.',
        'the document too large to preview',
      );
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });

      fs.writeFileSync(
        path.join(opened, 'large.ts'),
        `const big = 1;${' '.repeat(maxColoredBytes)}`,
      );
      await select('large');
      await page.keyboard.press('F3');
      await waitFor(
        async () =>
          (
            (await page
              .locator('.viewer-rows .viewer-row')
              .first()
              .textContent()) ?? ''
          ).startsWith('const big'),
        'the large file shown',
      );
      await page.waitForTimeout(300);
      assert.strictEqual(
        await page.locator('.viewer-row .syntax-keyword').count(),
        0,
      );
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });
      const files = ['code.ts', 'lines.ts', 'over.ts', 'over.md', 'large.ts'];
      for (const file of files) {
        fs.rmSync(path.join(opened, file));
      }
      await waitFor(async () => {
        const names = await rowNames();
        return files.every((file) => !names.includes(file));
      }, 'the files to be gone from the list');
    } finally {
      await closeViewer();
    }
  });

  test('keeps what a viewing tab was switched to show its file as while another tab is shown, for when it is shown again, and views the file as at first in a tab opened after it closed, which can take its id', async () => {
    fs.writeFileSync(path.join(opened, 'kept.md'), '# Kept\n');
    const viewerTab = page.locator('.tabs [role="tab"]', {
      hasText: 'kept.md',
    });
    try {
      await select('kept');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await pressedMode()) === strings.commander.viewPreview,
        'the preview',
      );
      await page
        .locator('.viewer .segmented')
        .getByRole('button', { name: strings.commander.viewText })
        .click();
      await waitFor(
        async () => (await pressedMode()) === strings.commander.viewText,
        'the text',
      );

      await page
        .locator('.tabs [role="tab"]', { hasText: 'Commander' })
        .click();
      await page.locator('.viewer').waitFor({ state: 'detached' });
      await viewerTab.click();
      await page.locator('.viewer').waitFor();
      assert.strictEqual(await pressedMode(), strings.commander.viewText);

      await page.locator('.viewer .column-body').first().focus();
      await page.keyboard.press('Escape');
      await viewerTab.waitFor({ state: 'detached' });
      await select('kept');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await pressedMode()) === strings.commander.viewPreview,
        'the preview of a tab opened anew',
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.locator('.viewer .column-body').first().focus();
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'kept.md'));
      await waitFor(
        async () => !(await rowNames()).includes('kept.md'),
        'the file to be gone from the list',
      );
    }
  });

  test('shows a binary file in hex, 16 bytes a row, to its last row with End, and switches to text and back with 2 and 1 or the buttons', async () => {
    fs.writeFileSync(
      path.join(opened, 'data.bin'),
      Buffer.from(Array.from({ length: 65536 }, (_, index) => index % 256)),
    );
    await select('data');
    await page.keyboard.press('F3');
    await waitFor(
      async () => (await pressedMode()) === 'Text',
      'a binary file to open as text',
    );
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');
    await page.keyboard.press('1');
    await waitFor(
      async () =>
        (await firstViewerRow()) ===
        '0000000000 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F................',
      'the first row in hex',
    );

    await page.keyboard.press('End');
    await waitFor(
      async () =>
        (
          (await page
            .locator('.viewer-rows .viewer-row')
            .last()
            .textContent()) ?? ''
        ).startsWith('0000FFF0F0 F1'),
      'the last row',
    );

    await page.keyboard.press('F1');
    await waitFor(
      async () =>
        (await page.locator('.shortcuts-heading').allTextContents()).includes(
          'Text',
        ),
      'the shortcuts of the viewer',
    );
    assert.ok(
      !(await page.locator('.shortcuts-heading').allTextContents()).includes(
        'Listing',
      ),
    );
    await page.keyboard.press('F1');
    await page
      .locator('.shortcuts-heading')
      .first()
      .waitFor({ state: 'detached' });

    await page.keyboard.press('2');
    await waitFor(
      async () => (await pressedMode()) === 'Text',
      'the text view',
    );
    await page.keyboard.press('Home');
    await waitFor(
      async () =>
        ((await firstViewerRow()) ?? '').startsWith(
          `${'.'.repeat(32)} !"#$%&'()*+,-./0123456789`,
        ),
      'the bytes as text, one to a character, a dot for each with no glyph',
    );
    await page.keyboard.press('1');
    await waitFor(async () => (await pressedMode()) === 'Hex', 'the hex view');
    await page.locator('.viewer .segmented [title="Text"]').click();
    await waitFor(
      async () => (await pressedMode()) === 'Text',
      'the text view',
    );
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });

    fs.writeFileSync(path.join(opened, 'plain.txt'), 'plain');
    await select('plain');
    await page.keyboard.press('F3');
    await waitFor(async () => (await firstViewerRow()) === 'plain', 'the text');
    assert.strictEqual(await pressedMode(), 'Text');
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'data.bin'));
    fs.rmSync(path.join(opened, 'plain.txt'));
    await waitFor(async () => {
      const names = await rowNames();
      return !names.includes('data.bin') && !names.includes('plain.txt');
    }, 'the files to be gone from the list');
  });

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
