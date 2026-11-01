import * as assert from 'node:assert';
import { maxColoredBytes } from '../tools/commander/shared/protocol';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../shared/strings';
import { waitFor } from './fixtures';
import { closeOrKill, launchApp, waitForFocus } from './appFixtures';
import { removeFolder, tempFolder } from './repositories';

const threeLines = (changed: string) =>
  ['one', changed, 'three', ''].join(String.fromCharCode(10));

suite('App commander', () => {
  let folder: string;
  let opened: string;
  let profile: string;
  let app: ElectronApplication;
  let page: Page;

  const right = () => page.locator('.commander-pane').nth(1);
  const rowNames = (pane = right()) =>
    pane
      .locator('.commander-row')
      .evaluateAll((rows) =>
        rows.map((row) =>
          [
            row.querySelector('.commander-name')?.textContent,
            row.querySelector('.commander-extension')?.textContent,
          ]
            .filter(Boolean)
            .join('.'),
        ),
      );

  const markedNames = () =>
    right().locator('.commander-row.marked .commander-name').allTextContents();

  const markingRow = (name: string) =>
    right().locator('.commander-row', { hasText: `${name}txt` });

  const icons = () =>
    right()
      .locator('.commander-row')
      .evaluateAll((rows) =>
        rows.map((row) => {
          const image = row.querySelector<HTMLImageElement>(
            '.commander-icon img',
          );
          return {
            name: row.querySelector('.commander-name')?.textContent,
            folder: row.querySelector('.commander-icon .folder-icon') !== null,
            file: row.querySelector('.commander-icon .file-icon') !== null,
            loaded: image !== null && image.complete && image.naturalWidth > 0,
          };
        }),
      );

  const select = async (name: string) => {
    await right().locator('.commander-row', { hasText: name }).click();
    await waitFor(
      async () =>
        (
          await right().locator('.commander-row.selected').textContent()
        )?.includes(name) === true,
      `${name} to be selected`,
    );
  };
  beforeAll(async () => {
    folder = tempFolder('app-commander');
    profile = path.join(folder, 'profile');
    opened = path.join(folder, 'opened');
    fs.mkdirSync(path.join(opened, 'src'), { recursive: true });
    fs.writeFileSync(path.join(opened, 'notes.txt'), '12345');
    fs.writeFileSync(path.join(opened, 'big.bin'), Buffer.alloc(12_288));
    fs.writeFileSync(path.join(opened, 'src', 'main.ts'), '');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [{ id: '1', tool: 'commander', root: opened }],
        activeTab: '1',
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await right().locator('.commander-row').first().waitFor();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  test('lists the folder it was opened with on the right, the active side, folders first and then files by extension, with their sizes', async () => {
    await waitForFocus(
      right().locator('.virtual-rows'),
      'the list of the right side',
    );
    assert.deepStrictEqual(await rowNames(), [
      '..',
      'src',
      'big.bin',
      'notes.txt',
    ]);
    assert.strictEqual(
      await right()
        .locator('.commander-row', { hasText: 'big' })
        .locator('.commander-size')
        .textContent(),
      '12,288',
    );
  });

  test('opens a folder with Enter and goes back up with Backspace, selecting the folder it came from', async () => {
    await right().locator('.commander-row', { hasText: 'src' }).click();
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..,main.ts',
      'the listing of src',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () =>
        (
          await right().locator('.commander-row.selected').textContent()
        )?.includes('src') === true,
      'src to be selected again',
    );
  });

  test('opens a folder with a double click', async () => {
    await right().locator('.commander-row', { hasText: 'src' }).dblclick();
    await waitFor(
      async () => (await rowNames()).join() === '..,main.ts',
      'the listing of src',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).length === 4,
      'the listing of the folder opened',
    );
  });

  test('shows a file made in the folder shown at once, and drops it once removed', async () => {
    const made = path.join(opened, 'made.log');
    fs.writeFileSync(made, 'made');
    await waitFor(
      async () => (await rowNames()).includes('made.log'),
      'the file made to be listed',
    );
    fs.rmSync(made);
    await waitFor(
      async () => !(await rowNames()).includes('made.log'),
      'the file removed to be dropped',
    );
  });

  test('draws the system icon of each file, and an outlined folder for folders', async () => {
    await waitFor(
      async () =>
        (await icons()).every(
          (icon) => icon.folder || icon.file || icon.loaded,
        ),
      'every row to have its icon',
    );
    const drawn = await icons();
    assert.deepStrictEqual(
      drawn.filter((icon) => icon.folder).map((icon) => icon.name),
      ['..', 'src'],
    );
    if (process.platform !== 'linux') {
      assert.ok(
        drawn.filter((icon) => !icon.folder).every((icon) => icon.loaded),
        JSON.stringify(drawn),
      );
    }
  });

  test('opens the folder of the active side in another tool, the left one once Tab makes it active', async () => {
    const left = page.locator('.commander-pane').nth(0);
    await right().locator('.virtual-rows').focus();
    await page.keyboard.press('Tab');
    await waitForFocus(
      left.locator('.virtual-rows'),
      'the list of the left side',
    );
    assert.notStrictEqual(
      await left.locator('.column-name').textContent(),
      await right().locator('.column-name').textContent(),
    );
    await page.keyboard.press('ControlOrMeta+Shift+O');
    await page.locator('.open-with-folders').waitFor();
    assert.strictEqual(
      await page.locator('.open-with-folders').textContent(),
      await left.locator('.column-name').textContent(),
    );
    await page.keyboard.press('Escape');
    await page.locator('.open-with-folders').waitFor({ state: 'detached' });
    await page.keyboard.press('Tab');
    await waitForFocus(
      right().locator('.virtual-rows'),
      'the list of the right side',
    );
  });

  test('says in a window, not a notice, that a folder can’t be read, closing it with Enter', async () => {
    const locked = path.join(opened, 'locked');
    fs.mkdirSync(locked);
    const user = process.env.USERNAME ?? '';
    if (process.platform === 'win32') {
      execFileSync('icacls', [locked, '/deny', `${user}:(RX)`]);
    } else {
      fs.chmodSync(locked, 0o000);
    }
    try {
      await right().locator('.commander-row', { hasText: 'locked' }).click();
      await waitFor(
        async () =>
          (
            await right().locator('.commander-row.selected').textContent()
          )?.includes('locked') === true,
        'the locked folder to be selected',
      );
      await page.keyboard.press('Enter');
      const popup = page.locator('.confirm-popup');
      await popup.waitFor();
      assert.strictEqual(
        await popup.locator('.confirm-body > span').textContent(),
        strings.commander.noAccess(locked),
      );
      assert.strictEqual(await page.locator('.notice').count(), 0);
      assert.deepStrictEqual(
        await popup.locator('.confirm-button').allTextContents(),
        process.platform === 'win32'
          ? [strings.commander.asAdministrator, strings.confirm.ok]
          : [strings.confirm.ok],
      );
      await waitForFocus(
        popup.locator('.confirm-button.default'),
        'the OK button of the window',
      );
      await page.keyboard.press('Enter');
      await popup.waitFor({ state: 'detached' });
      assert.strictEqual(
        await right().locator('.column-name').textContent(),
        opened,
      );
    } finally {
      if (process.platform === 'win32') {
        execFileSync('icacls', [locked, '/remove:d', user]);
      } else {
        fs.chmodSync(locked, 0o755);
      }
      fs.rmdirSync(locked);
    }
  });

  test('goes back through the folders of the side with Alt+Left, and forward again with its button', async () => {
    await right().locator('.virtual-rows').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await waitFor(
      async () => (await rowNames()).join() === '..,main.ts',
      'the folder before, src',
    );
    await right()
      .locator('.nav-button', { has: page.locator('svg') })
      .nth(1)
      .click();
    await waitFor(
      async () =>
        (await right().locator('.column-name').textContent()) === opened,
      'the folder after, the one opened',
    );
  });

  test('opens the selected folder on the left side with Mod+Left, or the folder it is in when a file is selected', async () => {
    const left = page.locator('.commander-pane').nth(0);
    await select('src');
    await page.keyboard.press('ControlOrMeta+ArrowLeft');
    await waitFor(
      async () =>
        (await left.locator('.column-name').textContent()) ===
        path.join(opened, 'src'),
      'the left side to open src',
    );
    await select('notes');
    await page.keyboard.press('ControlOrMeta+ArrowLeft');
    await waitFor(
      async () => (await left.locator('.column-name').textContent()) === opened,
      'the left side to open the folder of the file',
    );
  });

  test('views a file in a tab of its own with F3, saved as one, and goes back to the commander with Escape, its row still selected', async () => {
    await select('notes');
    await page.keyboard.press('F3');
    await page.locator('.tabs .tab.active', { hasText: 'notes.txt' }).waitFor();
    await page.locator('.viewer').waitFor();
    if (process.platform !== 'linux') {
      await waitFor(
        () =>
          page
            .locator('.tabs .tab.active img.tab-icon')
            .evaluate(
              (image: HTMLImageElement) =>
                image.complete && image.naturalWidth > 0,
            ),
        'the tab to show the icon of the file',
      );
    }
    await waitFor(() => {
      const state: unknown = JSON.parse(
        fs.readFileSync(path.join(profile, 'state.json'), 'utf8'),
      );
      return JSON.stringify(state).includes('"view":true');
    }, 'the viewing tab to be saved');

    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    await page.locator('.tabs .tab.active', { hasText: 'Commander' }).waitFor();
    assert.strictEqual(
      await page.locator('.tabs .tab', { hasText: 'notes.txt' }).count(),
      0,
    );
    assert.match(
      (await right().locator('.commander-row.selected').textContent()) ?? '',
      /^notes/,
    );
    await page.keyboard.press('ArrowUp');
    await waitFor(
      async () =>
        !(
          (await right().locator('.commander-row.selected').textContent()) ?? ''
        ).startsWith('notes'),
      'the keys to move the selection again',
    );
  });

  test('shows the rows of a file viewed, moving a page with PageDown, to its end with End and anywhere with its scrollbar', async () => {
    const lines = Array.from({ length: 200 }, (_, index) => `row ${index}`);
    fs.writeFileSync(
      path.join(opened, 'rows.txt'),
      lines.join(String.fromCharCode(10)),
    );
    await select('rows');
    await page.keyboard.press('F3');
    const first = () =>
      page.locator('.viewer-rows .viewer-row').first().textContent();
    await waitFor(async () => (await first()) === 'row 0', 'the first row');
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');

    await page
      .locator('.viewer-rows .viewer-row')
      .nth(3)
      .dblclick({ position: { x: 12, y: 4 } });
    assert.strictEqual(
      await page.evaluate(() => getSelection()?.toString().trim()),
      'row',
    );
    const thumb = page.locator('.viewer-thumb');
    assert.match(
      (await thumb.getAttribute('class')) ?? '',
      /overlay-scrollbar/,
    );
    assert.strictEqual(
      await thumb.evaluate((element) => element.getBoundingClientRect().width),
      await page.evaluate(() =>
        parseFloat(
          getComputedStyle(document.body).getPropertyValue('--scrollbar-size'),
        ),
      ),
    );

    for (let press = 0; press < 30; press++) {
      void page.keyboard.press('ArrowDown');
    }
    await waitFor(
      async () => (await first()) === 'row 30',
      'every press of a key held down to move a row',
    );

    await page.keyboard.press('PageDown');
    await waitFor(
      async () => /^row [4-9]/.test((await first()) ?? ''),
      'a page further down',
    );
    await page.keyboard.press('End');
    await waitFor(
      async () =>
        (await page
          .locator('.viewer-rows .viewer-row')
          .last()
          .textContent()) === 'row 199',
      'the last row',
    );
    const bar = await page.locator('.viewer-scrollbar').boundingBox();
    assert.ok(bar);
    await page.mouse.click(bar.x + bar.width / 2, bar.y + 1);
    await waitFor(async () => (await first()) === 'row 0', 'the start again');

    const middle = bar.y + bar.height / 2;
    await page.mouse.move(bar.x + bar.width / 2, bar.y + 1);
    await page.mouse.down();
    await page.mouse.move(bar.x + bar.width / 2, middle, { steps: 10 });
    await waitFor(async () => {
      const row = Number((await first())?.split(' ')[1]);
      return row > 60 && row < 140;
    }, 'the middle rows while the thumb is still held');
    const held = await thumb.boundingBox();
    assert.ok(held && held.y <= middle && middle <= held.y + held.height);
    await page.mouse.up();

    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'rows.txt'));
    await waitFor(
      async () => !(await rowNames()).includes('rows.txt'),
      'the file to be gone from the list',
    );
  });

  test('colors the code of a file viewed as the diff colors it, leaving a file over the size colored plain', async () => {
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
    fs.rmSync(path.join(opened, 'code.ts'));
    fs.rmSync(path.join(opened, 'large.ts'));
    await waitFor(async () => {
      const names = await rowNames();
      return !names.includes('code.ts') && !names.includes('large.ts');
    }, 'the files to be gone from the list');
  });

  test('shows a binary file in hex, 16 bytes a row, to its last row with End, and switches to text and back with 1 and 2 or the buttons', async () => {
    fs.writeFileSync(
      path.join(opened, 'data.bin'),
      Buffer.from(Array.from({ length: 65536 }, (_, index) => index % 256)),
    );
    await select('data');
    await page.keyboard.press('F3');
    const pressedMode = () =>
      page
        .locator('.viewer .segmented [aria-pressed="true"]')
        .getAttribute('title');
    await waitFor(
      async () => (await pressedMode()) === 'Text',
      'a binary file to open as text',
    );
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');
    await page.keyboard.press('2');
    const firstRow = () =>
      page.locator('.viewer-rows .viewer-row').first().textContent();
    await waitFor(
      async () =>
        (await firstRow()) ===
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
          'Viewer',
        ),
      'the shortcuts of the viewer',
    );
    assert.ok(
      !(await page.locator('.shortcuts-heading').allTextContents()).includes(
        'Commander',
      ),
    );
    await page.keyboard.press('F1');
    await page
      .locator('.shortcuts-heading')
      .first()
      .waitFor({ state: 'detached' });

    await page.keyboard.press('1');
    await waitFor(
      async () => (await pressedMode()) === 'Text',
      'the text view',
    );
    await page.keyboard.press('Home');
    await waitFor(
      async () =>
        ((await firstRow()) ?? '').startsWith(
          `${'.'.repeat(32)} !"#$%&'()*+,-./0123456789`,
        ),
      'the bytes as text, one to a character, a dot for each with no glyph',
    );
    await page.keyboard.press('2');
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
    await waitFor(async () => (await firstRow()) === 'plain', 'the text');
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

  test('previews an image, an SVG and Markdown with its images, switching to the source with 1, and offers no preview for other files', async () => {
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
    const imageWidth = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth)
        .catch(() => 0);
    const pressedMode = () =>
      page
        .locator('.viewer .segmented [aria-pressed="true"]')
        .getAttribute('title');
    const close = async () => {
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });
    };

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
    await page.keyboard.press('1');
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

  test('marks files moving with Shift, with Space and Insert, with Ctrl+click and Shift+click, never the parent row, and drops the marks in another folder', async () => {
    const markingFolder = path.join(opened, 'marking');
    fs.mkdirSync(markingFolder);
    for (const name of ['a', 'b', 'c', 'd']) {
      fs.writeFileSync(path.join(markingFolder, `${name}.txt`), name);
    }
    await select('marking');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..,a.txt,b.txt,c.txt,d.txt',
      'the markingFolder to be listed',
    );
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await waitFor(
      async () => (await markedNames()).join() === 'a,b',
      'the files passed to be marked, the parent row not',
    );
    await page.keyboard.press('Shift+ArrowUp');
    await waitFor(
      async () => (await markedNames()).join() === 'a,b,c',
      'moving up from a file not marked to mark it',
    );
    await page.keyboard.press('Shift+ArrowUp');
    await waitFor(
      async () => (await markedNames()).join() === 'a,c',
      'moving from a marked file to unmark it',
    );

    await page.keyboard.press('Space');
    await page.keyboard.press('Insert');
    await waitFor(
      async () => (await markedNames()).join() === 'b,c',
      'Space and Insert to toggle and move down',
    );
    await markingRow('a').click({ modifiers: ['ControlOrMeta'] });
    await waitFor(
      async () => (await markedNames()).join() === 'a,b,c',
      'Ctrl+click to toggle',
    );
    await markingRow('d').click({ modifiers: ['Shift'] });
    await waitFor(
      async () => (await markedNames()).join() === 'a,b,c,d',
      'Shift+click to mark the range',
    );
    const colors = await right()
      .locator('.commander-row.marked .commander-name')
      .evaluateAll((names) =>
        names.map((name) => getComputedStyle(name).color),
      );
    assert.strictEqual(
      new Set(colors).size,
      1,
      `The marked rows, the selected one among them, have the colors ${colors.join(', ')}`,
    );

    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('marking'),
      'the parent markingFolder',
    );
    await select('marking');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..,a.txt,b.txt,c.txt,d.txt',
      'the markingFolder to be listed again',
    );
    assert.deepStrictEqual(await markedNames(), []);
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('marking'),
      'the parent markingFolder',
    );
    fs.rmSync(markingFolder, { recursive: true });
    await waitFor(
      async () => !(await rowNames()).includes('marking'),
      'the markingFolder to be gone from the list',
    );
  });

  test('compares the two files marked on a side with Shift+F3 in a git tab of their own, showing their diff', async () => {
    fs.writeFileSync(path.join(opened, 'before.txt'), threeLines('two'));
    fs.writeFileSync(path.join(opened, 'after.txt'), threeLines('2'));
    await select('before');
    await page.keyboard.press('Space');
    await select('after');
    await page.keyboard.press('Space');
    await waitFor(
      async () => (await markedNames()).toSorted().join() === 'after,before',
      'both files to be marked',
    );

    await page.evaluate(() => {
      const watched = window as typeof window & { repositoryShown?: boolean };
      watched.repositoryShown = false;
      const check = () => {
        const comparing = document
          .querySelector('.tabs .tab.active')
          ?.textContent?.includes('↔');
        const repository = document.querySelector<HTMLElement>(
          '.repository:not(.compare-view)',
        );
        if (comparing && repository && repository.offsetParent !== null) {
          watched.repositoryShown = true;
        }
        if (document.querySelector('.compare-view .diff-line.added') === null) {
          requestAnimationFrame(check);
        }
      };
      requestAnimationFrame(check);
    });
    await page.keyboard.press('Shift+F3');
    await page
      .locator('.tabs .tab.active', { hasText: 'after.txt ↔ before.txt' })
      .waitFor();
    await waitFor(
      async () =>
        (
          await page.locator('.compare-view .diff-line.added').allTextContents()
        ).some((line) => line.includes('two')),
      'the diff of the two files',
    );
    assert.strictEqual(
      await page.evaluate(
        () =>
          (window as typeof window & { repositoryShown?: boolean })
            .repositoryShown,
      ),
      false,
      'The commit list showed before the comparison',
    );

    await page.keyboard.press('F1');
    await waitFor(
      async () =>
        (await page.locator('.shortcuts-heading').allTextContents()).join() ===
        'Tabs,App,Diff',
      'only the shortcuts of the diff',
    );
    await page.keyboard.press('F1');
    await page
      .locator('.shortcuts-heading')
      .first()
      .waitFor({ state: 'detached' });

    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(
      page.locator('.compare-view .diff-find-input'),
      'the search of the diff',
    );
    await page.keyboard.press('Escape');
    await waitFor(
      async () =>
        (await page.locator('.compare-view .diff-find-input').count()) === 0,
      'the search to close',
    );
    assert.strictEqual(
      await page.locator('.tabs .tab.active', { hasText: '↔' }).count(),
      1,
    );
    await page.keyboard.press('Escape');
    await page.locator('.tabs .tab.active', { hasText: 'Commander' }).waitFor();
    for (const name of ['before.txt', 'after.txt']) {
      fs.rmSync(path.join(opened, name));
    }
    await waitFor(async () => {
      const names = await rowNames();
      return !names.includes('before.txt') && !names.includes('after.txt');
    }, 'the files to be gone from the list');
  });

  test('lines up the shortcuts of the commander that go on in the second column with those of the first, under its heading', async () => {
    const size = await app.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();
      const before = window?.getSize();
      window?.setSize(1290, 779);
      return before;
    });
    await right().locator('.virtual-rows').focus();
    await page.keyboard.press('F1');
    await page
      .locator('.shortcuts-heading', { hasText: 'Commander' })
      .waitFor();
    const tops = await page
      .locator('.shortcuts-group', {
        has: page.locator('.shortcuts-heading', { hasText: 'Commander' }),
      })
      .locator('.shortcut-keys')
      .evaluateAll((cells) => {
        const firstOfColumn = new Map<number, number>();
        for (const cell of cells) {
          const { left, top } = cell.getBoundingClientRect();
          const column = Math.round(left);
          firstOfColumn.set(
            column,
            Math.min(firstOfColumn.get(column) ?? Infinity, top),
          );
        }
        return [...firstOfColumn.values()];
      });
    await page.keyboard.press('F1');
    await page
      .locator('.shortcuts-heading')
      .first()
      .waitFor({ state: 'detached' });
    await app.evaluate(
      ({ BrowserWindow }, [width, height]) => {
        BrowserWindow.getAllWindows()[0]?.setSize(width, height);
      },
      size ?? [1280, 800],
    );
    assert.strictEqual(tops.length, 2);
    assert.ok(
      Math.abs((tops[0] ?? 0) - (tops[1] ?? 0)) < 2,
      `The columns start at ${tops.join(' and ')}`,
    );
  });

  test('reads a file in the encoding its byte order mark names, and in the one chosen from the menu E opens, staying where it was', async () => {
    const text = Array.from(
      { length: 300 },
      (_, index) => `ligne ${index} é`,
    ).join(String.fromCharCode(10));
    fs.writeFileSync(
      path.join(opened, 'wide.txt'),
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]),
    );
    await select('wide');
    await page.keyboard.press('F3');
    const rowTexts = () =>
      page.locator('.viewer-rows .viewer-row').allTextContents();
    await waitFor(
      async () => (await rowTexts())[0] === 'ligne 0 é',
      'the text read as UTF-16',
    );
    assert.strictEqual(
      await page.locator('.viewer-encoding-label').textContent(),
      'UTF-16 LE',
    );

    await page.keyboard.press('End');
    await waitFor(
      async () => (await rowTexts()).at(-1) === 'ligne 299 é',
      'the end of the text',
    );
    await page.keyboard.press('e');
    await page.getByText('Bytes, one to a character').click();
    await waitFor(
      async () => (await rowTexts()).join('').includes('2.9.9. .é.'),
      'the end of the file as bytes',
    );
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'wide.txt'));
    await waitFor(
      async () => !(await rowNames()).includes('wide.txt'),
      'the file to be gone from the list',
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
    const lines = () =>
      right()
        .locator('.column-handle')
        .evaluateAll((handles) =>
          handles.map(
            (handle) => getComputedStyle(handle, '::after').backgroundColor,
          ),
        );
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
          left: { column: 'extension', descending: false },
          right: { column: 'size', descending: false },
        })
      );
    }, 'the order of the right side to be saved');
  });
});
