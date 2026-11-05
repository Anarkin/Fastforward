import * as assert from 'node:assert';
import { maxColoredBytes } from '../tools/commander/shared/protocol';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import type { ElectronApplication, Locator, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../shared/strings';
import { defaultSettings, waitFor } from './fixtures';
import { pdfOf } from './pdfs';
import { closeOrKill, launchApp, waitForFocus } from './appFixtures';
import { removeFolder, tempFolder } from './repositories';

const colorOf = (locator: Locator) =>
  locator.evaluate((element) => getComputedStyle(element).color);

const dotted = (drawn: Locator) =>
  drawn
    .first()
    .evaluate((element) =>
      getComputedStyle(element).backgroundImage.startsWith('radial-gradient'),
    );

const pngChunk = (type: string, body: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
};

const grayPng = (width: number, height: number) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  const rows = Buffer.alloc((width + 1) * height, 128);
  for (let row = 0; row < height; row++) {
    rows[row * (width + 1)] = 0;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const withOrientation = (jpeg: Buffer, orientation: number) => {
  const tiff = Buffer.alloc(26);
  tiff.write('MM', 0, 'latin1');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x0112, 10);
  tiff.writeUInt16BE(3, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  tiff.writeUInt32BE(0, 22);
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const segment = Buffer.alloc(4);
  segment.writeUInt16BE(0xffe1, 0);
  segment.writeUInt16BE(exif.length + 2, 2);
  const afterApp0 = 4 + jpeg.readUInt16BE(4);
  return Buffer.concat([
    jpeg.subarray(0, afterApp0),
    segment,
    exif,
    jpeg.subarray(afterApp0),
  ]);
};

const storedThumbnails = (profile: string): number => {
  const stored = path.join(profile, 'Thumbnails');
  return fs.existsSync(stored)
    ? fs.readdirSync(stored).filter((name) => name.endsWith('.webp')).length
    : 0;
};

const threeLines = (changed: string) =>
  ['one', changed, 'three', ''].join(String.fromCharCode(10));

const savedSetting = (
  profile: string,
  group: string,
  name: string,
): unknown => {
  const file = path.join(profile, 'settings.user.json');
  const settings: unknown = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : {};
  const saved: unknown =
    typeof settings === 'object' && settings !== null
      ? Reflect.get(settings, group)
      : undefined;
  return typeof saved === 'object' && saved !== null
    ? Reflect.get(saved, name)
    : undefined;
};

const hiding = (element: Locator) =>
  element.evaluate((shown) => {
    const look = () => {
      const icon = shown.querySelector('.commander-icon');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', {
        willReadFrequently: true,
      });
      if (context === null) {
        throw new Error('no canvas');
      }
      context.fillStyle = getComputedStyle(shown).color;
      context.fillRect(0, 0, 1, 1);
      return {
        color: [...context.getImageData(0, 0, 1, 1).data],
        icon:
          icon === null ? undefined : Number(getComputedStyle(icon).opacity),
      };
    };
    const before = look();
    shown.classList.add('hidden');
    const after = look();
    shown.classList.remove('hidden');
    return { before, after };
  });

const savedText = (profile: string, name: string): unknown =>
  savedSetting(profile, 'text', name);

async function scrollPlaces(
  page: Page,
  list: Locator,
  scroll: () => Promise<void>,
): Promise<number[]> {
  await list.evaluate((element) => {
    const places: number[] = [];
    Reflect.set(window, 'scrollPlaces', places);
    Reflect.set(window, 'scrollRested', false);
    const record = () => {
      places.push(element.scrollTop);
      const resting = places.slice(-12);
      if (
        places.some((place) => place !== places[0]) &&
        resting.length === 12 &&
        resting.every((place) => place === resting[0])
      ) {
        Reflect.set(window, 'scrollRested', true);
        return;
      }
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
  await scroll();
  await waitFor(
    () => page.evaluate(() => Reflect.get(window, 'scrollRested') === true),
    'the list to come to rest',
  );
  return page.evaluate(() => {
    const places: unknown = Reflect.get(window, 'scrollPlaces');
    return Array.isArray(places) ? places.map(Number) : [];
  });
}

const betweenRows = (places: readonly number[], row: number) =>
  places.some(
    (place) => Math.abs(place / row - Math.round(place / row)) > 0.01,
  );

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

  const thumbnailed = () =>
    right()
      .locator('.virtual-rows')
      .evaluate((list) => {
        const shown = list.getBoundingClientRect();
        return [...list.querySelectorAll('.commander-tile')]
          .filter((tile) => tile.querySelector('img.thumbnail-image'))
          .map((tile) => {
            const box = tile.getBoundingClientRect();
            return {
              name: tile.querySelector('.commander-tile-name')?.textContent,
              inView: box.bottom > shown.top && box.top < shown.bottom,
            };
          });
      });

  const shownThumbnailOf = (name: string) =>
    right()
      .locator('.commander-tile', { hasText: name })
      .locator('img.thumbnail-image')
      .evaluate((image: HTMLImageElement) =>
        image.complete ? image.naturalWidth : 0,
      )
      .catch(() => 0);

  const thumbnailLookOf = (name: string) =>
    right()
      .locator('.commander-tile', { hasText: name })
      .locator('img.thumbnail-image')
      .evaluate((image: HTMLImageElement) => {
        if (!image.complete || image.naturalWidth === 0) {
          return undefined;
        }
        const { naturalWidth: width, naturalHeight: height } = image;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context?.drawImage(image, 0, 0);
        const light = (x: number, y: number) =>
          context?.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[0] ??
          0;
        const box = image.getBoundingClientRect();
        return {
          width: Math.round(box.width),
          height: Math.round(box.height),
          left: light(width / 4, height / 2),
          right: light((3 * width) / 4, height / 2),
          top: light(width / 2, height / 4),
          bottom: light(width / 2, (3 * height) / 4),
        };
      })
      .catch(() => undefined);

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
            loading: image?.classList.contains('loading') === true,
          };
        }),
      );

  const firstViewerRow = async () =>
    (await page.locator('.viewer-rows .viewer-row').first().textContent()) ??
    '';
  const findMarks = () =>
    page
      .locator('.viewer-rows .find-match')
      .evaluateAll((elements) =>
        elements.map((element) => [
          element.textContent,
          element.classList.contains('current'),
        ]),
      );
  const findCount = () =>
    page.locator('.viewer .find-field-count').textContent();
  const selected = async () =>
    (await right().locator('.commander-row.selected').textContent()) ?? '';
  const viewerThumb = () =>
    page.locator('.viewer-thumb').evaluate((element) => {
      const box = element.getBoundingClientRect();
      const track = element.parentElement?.getBoundingClientRect();
      return {
        top: box.top,
        height: box.height,
        fromEnd: (track?.bottom ?? 0) - box.bottom,
      };
    });
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
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ scrolling: { smooth: true } }),
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

  test('lists the folder it was opened with on the right, the active side, folders first and then files by their colors and by extension, those of no color last, with their sizes', async () => {
    await waitForFocus(
      right().locator('.virtual-rows'),
      'the list of the right side',
    );
    assert.deepStrictEqual(await rowNames(), [
      '..',
      'src',
      'notes.txt',
      'big.bin',
    ]);
    assert.strictEqual(
      await right()
        .locator('.commander-row', { hasText: 'big' })
        .locator('.commander-size')
        .textContent(),
      '12,288',
    );
  });

  test('dims a hidden file in its own color, or the color of the text without one, its icon with it, by the share the theme gives hidden files, and a hidden folder of the path alike', async () => {
    const share =
      Number.parseFloat(
        await page.evaluate(() =>
          getComputedStyle(document.body).getPropertyValue(
            '--color-hidden-file',
          ),
        ),
      ) / 100;
    assert.ok(share > 0.3 && share < 0.8, String(share));
    const dimmed = async (element: Locator) => {
      const { before, after } = await hiding(element);
      assert.deepStrictEqual(after.color.slice(0, 3), before.color.slice(0, 3));
      assert.ok(
        Math.abs((after.color[3] ?? 0) / 255 - share) < 0.02,
        `${after.color.join()} is not ${share} of ${before.color.join()}`,
      );
      return { before, after };
    };
    const rowOf = (name: string) =>
      right().locator('.commander-row', { hasText: name });

    const colored = await dimmed(rowOf('notes'));
    const plain = await dimmed(rowOf('big'));
    assert.notDeepStrictEqual(colored.before.color, plain.before.color);
    for (const { before, after } of [colored, plain]) {
      assert.strictEqual(before.icon, 1);
      assert.ok(Math.abs((after.icon ?? 0) - share) < 0.01, String(after.icon));
    }
    await dimmed(right().locator('.path-title .path-part').first());
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
          (icon) => !icon.loading && (icon.folder || icon.file || icon.loaded),
        ),
      'every row to have its icon, none still loading',
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

  test('marks a folder that is a repository with the git icon in its Ext column, and no other, opening it in a git tab on a click of the icon or Shift+Enter', async () => {
    const made = path.join(folder, 'made-repository');
    execFileSync('git', ['init', '--quiet', made]);
    fs.renameSync(made, path.join(opened, 'repo'));
    const markOf = (name: string) =>
      right()
        .locator('.commander-row', { hasText: name })
        .locator('.commander-extension .commander-mark .tool-git');
    await markOf('repo').waitFor();
    assert.strictEqual(await markOf('src').count(), 0);
    const repoRow = right().locator('.commander-row', { hasText: 'repo' });
    const surroundOf = () =>
      repoRow
        .locator('.commander-mark')
        .evaluate((element) => getComputedStyle(element).boxShadow);
    await page.mouse.move(0, 0);
    assert.strictEqual(await surroundOf(), 'none');
    await repoRow.locator('.commander-mark').hover();
    assert.strictEqual(
      await colorOf(markOf('repo')),
      await colorOf(repoRow.locator('.commander-name')),
    );
    assert.notStrictEqual(await surroundOf(), 'none');

    const gitTab = page.locator('.tabs .tab.active', { hasText: 'repo' });
    const backToCommander = async () => {
      await page.keyboard.press('ControlOrMeta+W');
      await gitTab.waitFor({ state: 'detached' });
      await page
        .locator('.tabs .tab.active', { hasText: 'Commander' })
        .waitFor();
    };
    await markOf('repo').click();
    await gitTab.locator('.tool-git').waitFor();
    await backToCommander();

    await right()
      .locator('.commander-row', { hasText: 'repo' })
      .locator('.commander-name')
      .click();
    await waitFor(
      async () => (await selected()).includes('repo'),
      'repo to be selected',
    );
    await page.keyboard.press('Shift+Enter');
    await gitTab.locator('.tool-git').waitFor();
    await backToCommander();

    fs.rmSync(path.join(opened, 'repo'), {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    });
    await waitFor(
      async () => !(await rowNames()).includes('repo'),
      'the repository to be gone from the list',
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
      await page
        .locator('.tabs [role="tab"]', { hasText: 'notes.txt' })
        .count(),
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

  test('centers the path of a file viewed in the room between the buttons of its header, rather than in the whole header, the buttons staying at its edges', async () => {
    await select('notes');
    await page.keyboard.press('F3');
    await page.locator('.viewer .path-title').waitFor();
    const placesOf = () =>
      page.locator('.viewer .column-title').evaluate((header) => {
        const box = (selector: string) => {
          const found = header.querySelector(selector);
          if (found === null) {
            throw new Error(selector);
          }
          return found.getBoundingClientRect();
        };
        const start = box('.column-start');
        const actions = box('.column-actions');
        const title = box('.path-title');
        const edges = header.getBoundingClientRect();
        return {
          offCenter: Math.abs(
            (title.left + title.right) / 2 - (start.right + actions.left) / 2,
          ),
          start: start.left - edges.left,
          actions: edges.right - actions.right,
        };
      });
    await waitFor(
      async () => (await placesOf()).offCenter <= 1,
      'the path centered between the buttons',
    );
    const placed = await placesOf();
    assert.deepStrictEqual(
      [Math.round(placed.start), Math.round(placed.actions)],
      [4, 4],
    );

    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    await page.locator('.tabs .tab.active', { hasText: 'Commander' }).waitFor();
  });

  test('filters the files of a side on Ctrl+F or Alt and a letter by every word anywhere in their names, moving among them with the arrows as one types, and clears the filter on Esc or once a folder opens', async () => {
    const names = ['alpha-report.txt', 'beta.txt', 'Report-gamma.md'];
    for (const name of names) {
      fs.writeFileSync(path.join(opened, name), name);
    }
    fs.mkdirSync(path.join(opened, 'reports-folder'));
    try {
      await waitFor(
        async () => (await rowNames()).includes('reports-folder'),
        'the files to be listed',
      );
      await select('beta');
      await page.keyboard.press('ControlOrMeta+F');
      await waitForFocus(
        right().locator('.commander-filter-input'),
        'the filter',
      );
      await page.keyboard.type('rep gam');
      await waitFor(
        async () =>
          JSON.stringify((await rowNames()).filter((name) => name !== '..')) ===
          JSON.stringify(['Report-gamma.md']),
        'only the file with both words',
      );
      assert.ok((await selected()).includes('Report-gamma'));
      await page.keyboard.press('ControlOrMeta+F');
      await page.keyboard.type('report');
      await waitFor(
        async () =>
          JSON.stringify(
            (await rowNames()).filter((name) => name !== '..').toSorted(),
          ) ===
          JSON.stringify([
            'Report-gamma.md',
            'alpha-report.txt',
            'reports-folder',
          ]),
        'the files and the folder with the word',
      );
      assert.match(
        (await right().locator('.find-field-count').textContent()) ?? '',
        /^3 of \d+$/,
      );
      assert.strictEqual(
        await right().locator('.commander-row .match').first().textContent(),
        'report',
      );
      await page.keyboard.press('ArrowDown');
      await waitFor(
        async () => (await selected()).includes('alpha-report'),
        'the next match selected',
      );

      await page.keyboard.press('Enter');
      await waitForFocus(right().locator('.virtual-rows'), 'the list');
      assert.ok(await right().locator('.commander-filter-input').isVisible());
      await page.keyboard.press('Escape');
      await right()
        .locator('.commander-filter-input')
        .waitFor({ state: 'detached' });
      await waitFor(
        async () => (await rowNames()).includes('beta.txt'),
        'every file again',
      );
      assert.ok((await selected()).includes('alpha-report'));

      await page.keyboard.press('ControlOrMeta+F');
      await page.keyboard.type('folder');
      await waitFor(
        async () => (await selected()).includes('reports-folder'),
        'the folder selected',
      );
      await page.keyboard.press('Enter');
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent())?.endsWith(
            'reports-folder',
          ) === true,
        'the folder opened',
      );
      await waitForFocus(
        right().locator('.virtual-rows'),
        'the list in the folder',
      );
      assert.strictEqual(
        await right().locator('.commander-filter-input').count(),
        0,
      );
      await page.keyboard.press('Backspace');
      await waitFor(
        async () => (await rowNames()).includes('beta.txt'),
        'the folder left',
      );

      await page.keyboard.press('Alt+b');
      await waitForFocus(
        right().locator('.commander-filter-input'),
        'the filter from Alt and a letter',
      );
      await page.keyboard.press('Alt+e');
      await waitFor(
        async () =>
          (await right().locator('.commander-filter-input').inputValue()) ===
            'be' &&
          JSON.stringify((await rowNames()).filter((name) => name !== '..')) ===
            JSON.stringify(['beta.txt']),
        'the files with the letters typed with Alt',
      );
      await page.keyboard.press('Escape');
      await right()
        .locator('.commander-filter-input')
        .waitFor({ state: 'detached' });
    } finally {
      if (await right().locator('.commander-filter-input').isVisible()) {
        await right().locator('.commander-filter-input').press('Escape');
        await right()
          .locator('.commander-filter-input')
          .waitFor({ state: 'detached' });
      }
      for (const name of names) {
        fs.rmSync(path.join(opened, name));
      }
      fs.rmSync(path.join(opened, 'reports-folder'), { recursive: true });
      await waitFor(
        async () => !(await rowNames()).includes('beta.txt'),
        'the files to be gone from the list',
      );
    }
  });

  test('previews a PDF, searching it on Ctrl+F without leaving the preview, and opens it again where it was left', async () => {
    fs.writeFileSync(
      path.join(opened, 'book.pdf'),
      pdfOf(
        Array.from({ length: 12 }, (_page, pageIndex) =>
          Array.from({ length: 40 }, (_line, line) =>
            line === 20 && (pageIndex === 2 || pageIndex === 8)
              ? `Needle on page ${pageIndex + 1}`
              : `Page ${pageIndex + 1}, line ${line + 1}`,
          ),
        ),
      ),
    );
    const scroller = page.locator('.viewer .pdf-scroll');
    const count = () => page.locator('.viewer .find-field-count').textContent();
    const shownPage = () =>
      scroller.evaluate((element) => {
        const top = element.getBoundingClientRect().top;
        const pages = [...element.querySelectorAll('.page')];
        return (
          pages.findIndex(
            (each) => each.getBoundingClientRect().bottom > top + 40,
          ) + 1
        );
      });
    try {
      await select('book');
      await page.keyboard.press('F3');
      await page
        .locator('.viewer .textLayer', { hasText: 'Page 1, line 1' })
        .waitFor();
      await waitForFocus(scroller, 'the PDF');
      assert.strictEqual(
        await page.locator('.viewer .page').first().getAttribute('aria-label'),
        'Page 1',
      );

      await page.keyboard.press('ControlOrMeta+F');
      await waitForFocus(
        page.locator('.viewer .find-field-input'),
        'the search',
      );
      await page.keyboard.type('needle');
      await waitFor(
        async () => (await count()) === '1 of 2',
        'the matches counted',
      );
      await page.locator('.viewer .textLayer .highlight.selected').waitFor();
      await page.keyboard.press('Enter');
      await waitFor(async () => (await count()) === '2 of 2', 'the next match');
      await waitFor(
        async () => (await shownPage()) === 9,
        'the page of the match',
      );
      await page.keyboard.press('Escape');
      await page.locator('.viewer .find-field').waitFor({ state: 'detached' });
      assert.strictEqual(await page.locator('.viewer .pdf-pane').count(), 1);

      await scroller.evaluate((element) => {
        const seventh = element.querySelectorAll('.page')[6];
        if (seventh instanceof HTMLElement) {
          element.scrollTop = seventh.offsetTop + 20;
        }
      });
      const pdfState = () =>
        scroller.evaluate((element) => ({
          scrollTop: element.scrollTop,
          seventh: [...element.querySelectorAll('.page')].map((each) =>
            each instanceof HTMLElement ? each.offsetTop : -1,
          )[6],
          count: element.querySelectorAll('.page').length,
        }));
      await waitFor(
        async () => (await shownPage()) === 7,
        'page 7 shown',
      ).catch(async (error: unknown) => {
        throw new Error(
          `${String(error)}: page ${await shownPage()} shown, ${JSON.stringify(await pdfState())}`,
        );
      });
      await scroller.focus();
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });

      await select('book');
      await page.keyboard.press('F3');
      await page.locator('.viewer .textLayer').first().waitFor();
      await waitFor(
        async () => (await shownPage()) === 7,
        'the PDF opened at page 7 again',
      ).catch(async (error: unknown) => {
        throw new Error(
          `${String(error)}: page ${await shownPage()} shown, ${JSON.stringify(await pdfState())}, places ${fs.existsSync(path.join(profile, 'pdf-places.json')) ? fs.readFileSync(path.join(profile, 'pdf-places.json'), 'utf8') : 'none saved'}`,
        );
      });
    } finally {
      if (await page.locator('.viewer .find-field').isVisible()) {
        await page.keyboard.press('Escape');
      }
      if (await page.locator('.viewer').isVisible()) {
        await scroller.focus();
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'book.pdf'));
      await waitFor(
        async () => !(await rowNames()).includes('book.pdf'),
        'the file to be gone from the list',
      );
    }
  });

  test('searches a file viewed on Ctrl+F as the diff does, counting the matches, stepping to them with Enter and Shift+Enter, and closes the search on Esc, then the viewer', async () => {
    const lines = Array.from({ length: 300 }, (_, index) =>
      index % 100 === 50 ? `Needle ${index}` : `row ${index}`,
    );
    fs.writeFileSync(
      path.join(opened, 'haystack.txt'),
      lines.join(String.fromCharCode(10)),
    );
    try {
      await select('haystack');
      await page.keyboard.press('F3');
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');

      await page.keyboard.press('ControlOrMeta+F');
      await waitForFocus(
        page.locator('.viewer .find-field-input'),
        'the search',
      );
      assert.ok(
        (await page
          .locator('.viewer .search-row')
          .evaluate(
            (row) =>
              row.getBoundingClientRect().left -
              (row.closest('.viewer')?.getBoundingClientRect().left ?? 0),
          )) < 8,
        'The search starts at the start of the header, as in the diff',
      );
      await page.keyboard.type('needle');
      await waitFor(async () => (await findCount()) === '1 of 3', 'the count');
      await waitFor(
        async () =>
          JSON.stringify(await findMarks()) ===
          JSON.stringify([['Needle', true]]),
        'the first match marked as current',
      );
      await page.keyboard.press('Enter');
      await waitFor(
        async () => (await findCount()) === '2 of 3',
        'the next match',
      );
      await waitFor(
        async () =>
          JSON.stringify(await findMarks()) ===
            JSON.stringify([['Needle', true]]) &&
          ((await page
            .locator('.viewer-rows .viewer-row', {
              has: page.locator('.find-match.current'),
            })
            .textContent()) ?? '') === 'Needle 150',
        'the view at the second match',
      );
      await page.keyboard.press('Shift+Enter');
      await waitFor(
        async () => (await findCount()) === '1 of 3',
        'the previous match',
      );
      await page.keyboard.press('1');
      assert.strictEqual(
        await page.locator('.viewer .find-field-input').inputValue(),
        'needle1',
      );
      await page.keyboard.press('Backspace');

      await page.keyboard.press('Escape');
      await page.locator('.viewer .find-field').waitFor({ state: 'detached' });
      await waitForFocus(page.locator('.viewer-body'), 'the viewer again');
      assert.deepStrictEqual(await findMarks(), []);
      assert.strictEqual(await page.locator('.viewer').count(), 1);
    } finally {
      if (await page.locator('.viewer .find-field').isVisible()) {
        await page.keyboard.press('Escape');
        await page
          .locator('.viewer .find-field')
          .waitFor({ state: 'detached' });
      }
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'haystack.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('haystack.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('keeps the thumb of a file viewed as tall wherever it is scrolled to, though its lines grow long further down, moves it down as the rows do, and ends it at the end of its track without a jump', async () => {
    const lines = Array.from({ length: 300 }, (_, index) =>
      index < 150
        ? `short ${index}`.padEnd(19, '.')
        : `long ${index}`.padEnd(59, '.'),
    );
    fs.writeFileSync(
      path.join(opened, 'uneven.txt'),
      lines.join(String.fromCharCode(10)),
    );
    try {
      await select('uneven');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === 'short 0............',
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      const first = await viewerThumb();
      assert.ok(first.height > 30, JSON.stringify(first));
      const seen = [first];
      await waitFor(async () => {
        seen.push(await viewerThumb());
        if ((await firstViewerRow()).startsWith('long')) {
          return true;
        }
        await page.keyboard.press('PageDown');
        return false;
      }, 'the long rows');
      await page.keyboard.press('End');
      await waitFor(
        async () => (await firstViewerRow()).startsWith('long 2'),
        'the end',
      );
      seen.push(await viewerThumb());
      assert.ok(
        seen.every((each) => Math.abs(each.height - first.height) < 0.5),
        JSON.stringify(seen),
      );
      assert.ok(
        seen.every(
          (each, index) =>
            index === 0 || each.top >= (seen[index - 1]?.top ?? 0),
        ),
        JSON.stringify(seen),
      );
      assert.ok(
        Math.abs(seen.at(-1)?.fromEnd ?? 1) < 0.5,
        JSON.stringify(seen),
      );
      const atEnd = seen.at(-1)?.top ?? 0;
      const lastTop = await firstViewerRow();
      await page.keyboard.press('ArrowUp');
      await waitFor(
        async () => (await firstViewerRow()) !== lastTop,
        'a row up',
      );
      const track = await page
        .locator('.viewer-thumb')
        .evaluate(
          (element) =>
            element.parentElement?.getBoundingClientRect().height ?? 0,
        );
      assert.ok(
        atEnd - (await viewerThumb()).top < track / 50,
        JSON.stringify({ atEnd, up: await viewerThumb(), track }),
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'uneven.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('uneven.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('shows the rows of a file viewed, moving a page with PageDown, to its end with End and anywhere with its scrollbar, centering its thumb where its track is pressed, its thumb moving with the rows while dragged rather than under the pointer and then jumping to them once let go', async () => {
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

    await thumb.evaluate((element) => {
      const frames: { top: number; row: string }[] = [];
      Reflect.set(window, 'thumbFrames', frames);
      const record = () => {
        frames.push({
          top: element.getBoundingClientRect().top,
          row:
            document.querySelector('.viewer-rows .viewer-row')?.textContent ??
            '',
        });
        if (Reflect.get(window, 'thumbFrames') === frames) {
          requestAnimationFrame(record);
        }
      };
      requestAnimationFrame(record);
    });
    const x = bar.x + bar.width / 2;
    const nextFrame = () =>
      page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(resolve)),
      );
    await page.mouse.move(x, middle);
    await page.mouse.down();
    for (let step = 1; step <= 30; step++) {
      await page.mouse.move(x, middle + step);
      await nextFrame();
      await nextFrame();
    }
    await page.mouse.up();
    for (let frame = 0; frame < 10; frame++) {
      await nextFrame();
    }
    const frames = await page.evaluate(() => {
      const recorded: unknown = Reflect.get(window, 'thumbFrames');
      Reflect.set(window, 'thumbFrames', undefined);
      return Array.isArray(recorded)
        ? recorded.map((frame: unknown) => ({
            top: Number(Reflect.get(Object(frame), 'top')),
            row: String(Reflect.get(Object(frame), 'row')),
          }))
        : [];
    });
    assert.ok(new Set(frames.map((frame) => frame.row)).size > 1);
    assert.deepStrictEqual(
      frames.filter(
        (frame, index) =>
          index > 0 &&
          frame.row === frames[index - 1]?.row &&
          Math.abs(frame.top - (frames[index - 1]?.top ?? 0)) > 0.5,
      ),
      [],
    );

    const thumbHeight = (await thumb.boundingBox())?.height ?? 0;
    assert.ok(thumbHeight > 0);
    const pressed = bar.y + thumbHeight * 1.5;
    await page.mouse.click(x, pressed);
    await waitFor(async () => {
      const box = await thumb.boundingBox();
      return (
        box !== null &&
        Math.abs(box.y + box.height / 2 - pressed) < box.height / 10
      );
    }, 'the thumb centered where its track was pressed');

    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'rows.txt'));
    await waitFor(
      async () => !(await rowNames()).includes('rows.txt'),
      'the file to be gone from the list',
    );
  });

  test('wraps the long lines of a file viewed as the diff wraps its lines, indenting the rows they wrap onto and marking where they wrap and the spaces they wrap at, copies a wrapped line as one line, stops on W or its button for the diff too, and hides whitespace, as it does by default, until a dot', async () => {
    const words = Array.from({ length: 80 }, (_, index) => `word${index}`).join(
      ' ',
    );
    const line = `    ${words}`;
    fs.writeFileSync(
      path.join(opened, 'long.txt'),
      ['short', line, 'after'].join(String.fromCharCode(10)),
    );
    const rows = page.locator('.viewer-rows .viewer-row');
    const layout = () =>
      page.locator('.viewer-body').evaluate((body) => {
        const shown = body.querySelector('.viewer-rows');
        const leftOf = (row: Element | undefined, offset: number) => {
          const walker = document.createTreeWalker(
            row ?? body,
            NodeFilter.SHOW_TEXT,
          );
          let node = walker.nextNode();
          let at = offset;
          while (node instanceof Text && at >= node.length) {
            at -= node.length;
            node = walker.nextNode();
          }
          if (!(node instanceof Text)) {
            return Number.NaN;
          }
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + 1);
          return range.getBoundingClientRect().left;
        };
        const each = [...body.querySelectorAll('.viewer-rows .viewer-row')];
        const edge = body.getBoundingClientRect().right;
        return {
          fits:
            (shown?.getBoundingClientRect().width ?? Infinity) <=
            body.clientWidth + 0.5,
          marks: [...body.querySelectorAll('.viewer-break')].map(
            (mark) => mark.getBoundingClientRect().right <= edge,
          ),
          indented: Math.abs(leftOf(each[2], 0) - leftOf(each[1], 4)) < 0.5,
        };
      });
    try {
      await select('long');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === 'short',
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      await waitFor(async () => (await rows.count()) > 4, 'the line to wrap');
      const wrapped = await rows.allTextContents();
      assert.strictEqual(wrapped.slice(1, -1).join(''), line);
      assert.strictEqual(wrapped.at(-1), 'after');
      assert.deepStrictEqual(await layout(), {
        fits: true,
        marks: wrapped.slice(2, -1).map(() => true),
        indented: true,
      });
      await page.evaluate(() => {
        const shown = [
          ...document.querySelectorAll('.viewer-rows .viewer-row'),
        ];
        const range = document.createRange();
        range.setStartBefore(shown[1] ?? document.body);
        range.setEnd(shown.at(-1)?.firstChild ?? document.body, 3);
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
        `${line}${String.fromCharCode(10)}aft`,
      );

      await page.keyboard.press('w');
      await waitFor(async () => (await rows.count()) === 3, 'the line whole');
      const unwrapped = await rows.allTextContents();
      assert.deepStrictEqual(
        [unwrapped[0], line.startsWith(unwrapped[1] ?? '-'), unwrapped[2]],
        ['short', true, 'after'],
      );
      assert.strictEqual((await layout()).fits, false);
      assert.strictEqual(await page.locator('.viewer-break').count(), 0);
      await waitFor(
        () => savedText(profile, 'wordWrap') === false,
        'no wrapping saved',
      );

      await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
      await waitFor(async () => (await rows.count()) > 4, 'the line wrapped');
      await waitFor(
        () => savedText(profile, 'wordWrap') === undefined,
        'the wrapping left to the default',
      );

      const spaces = page.locator('.viewer-rows .spaces');
      const hanging = page.locator('.viewer-rows .viewer-wrap-spaces');
      await waitFor(
        async () => (await hanging.count()) > 0,
        'only the spaces the rows wrap at marked, as whitespace is hidden by default',
      );
      assert.strictEqual(await dotted(hanging), true);
      assert.strictEqual(await spaces.count(), 0);
      await page.keyboard.press('.');
      await waitFor(async () => (await spaces.count()) > 0, 'the spaces drawn');
      assert.strictEqual(await dotted(spaces), true);
      assert.strictEqual(await hanging.count(), 0);
      await waitFor(
        () => savedText(profile, 'showWhitespace') === true,
        'whitespace shown saved',
      );
      assert.strictEqual(savedText(profile, 'wordWrap'), undefined);
      await page.keyboard.press('.');
      await waitFor(
        async () => (await spaces.count()) === 0,
        'the spaces plain again',
      );
      await waitFor(
        () => savedText(profile, 'showWhitespace') === undefined,
        'whitespace left to the default',
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'long.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('long.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('keeps a file viewed with its lines wrapped as wide as the viewer, the runs of spaces hanging past its edge out of sight rather than scrolled to, whether whitespace is shown or not, and back at its left edge once wrapped after scrolling sideways', async () => {
    const padded = `| a${' '.repeat(300)}| b${' '.repeat(300)}|`;
    fs.writeFileSync(
      path.join(opened, 'padded.txt'),
      ['short', padded, ' '.repeat(400), 'after'].join(String.fromCharCode(10)),
    );
    const rows = page.locator('.viewer-rows .viewer-row');
    const sideways = page.locator('.viewer-sideways');
    const overflow = () =>
      sideways.evaluate((element) => ({
        wider: element.scrollWidth > element.clientWidth,
        left: element.scrollLeft,
      }));
    try {
      await select('padded');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === 'short',
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      await waitFor(
        async () => (await rows.count()) > 5,
        'the padded line to wrap',
      );
      assert.deepStrictEqual(await overflow(), { wider: false, left: 0 });
      await page.keyboard.press('.');
      await page.locator('.viewer-rows .spaces').first().waitFor();
      assert.deepStrictEqual(await overflow(), { wider: false, left: 0 });
      await page.keyboard.press('w');
      await waitFor(
        async () => (await overflow()).wider,
        'the lines whole, wider than the viewer',
      );
      await sideways.evaluate((element) => element.scrollBy({ left: 400 }));
      await waitFor(async () => (await overflow()).left > 0, 'scrolled away');
      await page.keyboard.press('w');
      await waitFor(async () => {
        const { wider, left } = await overflow();
        return !wider && left === 0;
      }, 'the lines wrapped again, from the left edge');
      await page.keyboard.press('.');
      await waitFor(
        () =>
          savedText(profile, 'showWhitespace') === undefined &&
          savedText(profile, 'wordWrap') === undefined,
        'the choices left to the defaults',
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'padded.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('padded.txt'),
        'the file to be gone from the list',
      );
    }
  });

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

  test('colors the code of a file viewed as the diff colors it, a long one from the top as its lines are done, none while Plain Text is chosen from the menu L opens, which files viewed and diffs start in until Auto is, and a file in the language chosen there, found by what is typed, for as long as it is viewed, leaving a file over the size colored plain, and previews no Markdown over a size of its own', async () => {
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
    const reopen = async () => {
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });
      await page.keyboard.press('F3');
      await page.locator('.viewer-rows .viewer-row').first().waitFor();
    };
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

    const lastKeyword = () =>
      page
        .locator('.viewer-rows .viewer-row')
        .last()
        .locator('.syntax-keyword')
        .count();
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
  });

  test('shows a binary file in hex, 16 bytes a row, to its last row with End, and switches to text and back with 2 and 1 or the buttons', async () => {
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
          'Viewer',
        ),
      'the shortcuts of the viewer',
    );
    assert.ok(
      !(await page.locator('.shortcuts-heading').allTextContents()).includes(
        'Folders',
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
    const shown = () =>
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
    const openHuge = async () => {
      await select('huge');
      await page.keyboard.press('F3');
      await waitFor(async () => (await shown()).natural === 3000, 'the image');
    };
    const close = async () => {
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });
    };

    await openHuge();
    const fitted = await shown();
    assert.ok(fitted.width < 3000, JSON.stringify(fitted));
    assert.strictEqual(fitted.widest, 0);
    assert.strictEqual(await realSize.getAttribute('aria-pressed'), 'false');

    await page.keyboard.press('f');
    await waitFor(
      async () => Math.round((await shown()).width) === 3000,
      'the image at its real size',
    );
    const real = await shown();
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
    await waitFor(async () => (await shown()).top === 0, 'the top');
    await page.keyboard.press('ArrowDown');
    await waitFor(async () => (await shown()).top > 0, 'a row down');
    await page.keyboard.press('End');
    await waitFor(async () => {
      const { top, tallest } = await shown();
      return Math.abs(top - tallest) <= 1;
    }, 'the bottom');
    const before = (await shown()).left;
    await page.keyboard.press('ArrowRight');
    await waitFor(async () => (await shown()).left > before, 'to the right');
    await close();

    await openHuge();
    await waitFor(
      async () => Math.round((await shown()).width) === 3000,
      'the next image at its real size',
    );
    await realSize.click();
    await waitFor(
      async () => (await shown()).width < 3000,
      'the image fitted again',
    );
    assert.strictEqual((await shown()).widest, 0);
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

  test('deletes the marked files, or the selected one, for good on Shift+Delete and Shift+F8 once confirmed, keeping them when Cancel is picked with the arrow keys, and selects the file after the deleted ones', async () => {
    const deletingFolder = path.join(opened, 'deleting');
    fs.mkdirSync(deletingFolder);
    for (const name of ['a', 'b', 'c', 'd']) {
      fs.writeFileSync(path.join(deletingFolder, `${name}.txt`), name);
    }
    await select('deleting');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..,a.txt,b.txt,c.txt,d.txt',
      'the folder to be listed',
    );
    await select('b');
    const popup = page.locator('.confirm-popup');
    await page.keyboard.press('Shift+Delete');
    await popup.waitFor();
    assert.match(
      (await popup.textContent()) ?? '',
      /Delete "b\.txt" permanently\? This cannot be undone\./,
    );
    await page.keyboard.press('ArrowLeft');
    await waitFor(
      async () =>
        (await page.evaluate(() => document.activeElement?.textContent)) ===
        'Cancel',
      'the arrow key to move to Cancel',
    );
    await page.keyboard.press('Enter');
    await popup.waitFor({ state: 'detached' });
    assert.ok(fs.existsSync(path.join(deletingFolder, 'b.txt')));

    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await page.keyboard.press('Shift+F8');
    await popup.waitFor();
    assert.match(
      (await popup.textContent()) ?? '',
      /Delete 2 items permanently\?/,
    );
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..,a.txt,d.txt',
      'the marked files to be gone from the list',
    );
    assert.deepStrictEqual(fs.readdirSync(deletingFolder).toSorted(), [
      'a.txt',
      'd.txt',
    ]);
    await waitFor(
      async () =>
        (
          await right().locator('.commander-row.selected').textContent()
        )?.startsWith('dtxt') === true,
      'the file after the deleted ones to be selected',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('deleting'),
      'the folder above to be listed again',
    );
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
    const hiddenColor = await right()
      .locator('.commander-row.marked')
      .first()
      .evaluate((row) => {
        row.classList.add('hidden');
        const color = getComputedStyle(row).color;
        row.classList.remove('hidden');
        return color;
      });
    assert.strictEqual(
      hiddenColor,
      colors[0],
      'A hidden file marked is red too',
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

  test('shows a side as thumbnails from the menu of its layout or on Mod+2, each file and folder a tile of its icon, name, size and date, moving among them as on a grid, and as details again on Mod+1, for its tab only, another tab showing details', async () => {
    const tiles = path.join(opened, 'tiles');
    fs.mkdirSync(tiles);
    for (let index = 1; index <= 7; index++) {
      fs.writeFileSync(path.join(tiles, `t${index}.txt`), 'x'.repeat(index));
    }
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
    assert.strictEqual(await right().locator('.commander-line').count(), 0);
    assert.strictEqual(await right().locator('.commander-header').count(), 0);
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
    const selectedName = () =>
      right()
        .locator('.commander-tile.selected .commander-tile-name')
        .textContent();
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

  test('compares the two files marked on a side with Shift+F3 in a git tab of their own, showing their diff, with every language in its menu on L, as it shows one file', async () => {
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
          ?.textContent?.includes('→');
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
      .locator('.tabs .tab.active', { hasText: 'after.txt → before.txt' })
      .waitFor();
    await waitFor(
      async () =>
        (
          await page.locator('.compare-view .diff-line.added').allTextContents()
        ).some((line) => line.includes('two')),
      'the diff of the two files',
    );
    await waitForFocus(
      page.locator('.compare-view [data-column-focus]').first(),
      'the diff, to take the keys at once',
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
      page.locator('.compare-view .find-field-input'),
      'the search of the diff',
    );
    await page.keyboard.press('Escape');
    await waitFor(
      async () =>
        (await page.locator('.compare-view .find-field-input').count()) === 0,
      'the search to close',
    );
    assert.strictEqual(
      await page.locator('.tabs .tab.active', { hasText: '→' }).count(),
      1,
    );
    const language = page.locator('.compare-view .language-button');
    assert.strictEqual(
      await language.locator('.menu-button-label').textContent(),
      'Plain Text',
    );
    await page.keyboard.press('l');
    await language.locator('.menu-filter').waitFor();
    await page.keyboard.press('Escape');
    await language.locator('.menu').waitFor({ state: 'detached' });
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

  test('lines up the shortcuts of the viewer, its only group, that go on in the second column with those of the first, under its heading', async () => {
    const size = await app.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();
      const before = window?.getSize();
      window?.setSize(1290, 779);
      return before;
    });
    await select('notes');
    await page.keyboard.press('F3');
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');
    await page.keyboard.press('F1');
    await page.locator('.shortcuts-heading', { hasText: 'Viewer' }).waitFor();
    const tops = await page
      .locator('.shortcuts-group', {
        has: page.locator('.shortcuts-heading', { hasText: 'Viewer' }),
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
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    assert.strictEqual(tops.length, 2);
    assert.ok(
      Math.abs((tops[0] ?? 0) - (tops[1] ?? 0)) < 2,
      `The columns start at ${tops.join(' and ')}`,
    );
  });

  test('reads a file in the encoding its byte order mark names, and in the one chosen from the menu E opens, found by what is typed, staying where it was', async () => {
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
      await page.locator('.viewer-encoding .menu-button-label').textContent(),
      'UTF-16 LE',
    );

    await page.keyboard.press('End');
    await waitFor(
      async () => (await rowTexts()).at(-1) === 'ligne 299 é',
      'the end of the text',
    );
    await page.keyboard.press('e');
    const encodingItems = page.locator('.viewer-encoding .menu-item');
    assert.strictEqual(
      await encodingItems
        .and(page.locator('[aria-checked="true"]'))
        .textContent(),
      '✓Auto: UTF-16 LE',
    );
    await encodingItems.filter({ hasText: /^Bytes$/ }).click();
    await waitFor(
      async () => (await rowTexts()).join('').includes('2.9.9. .é.'),
      'the end of the file as bytes',
    );
    await page.keyboard.press('e');
    await page.locator('.viewer-encoding .menu-filter').waitFor();
    await page.keyboard.type('latin2');
    await page.keyboard.press('Enter');
    await waitFor(
      async () =>
        (await page
          .locator('.viewer-encoding .menu-button-label')
          .textContent()) === '8859-2',
      'the encoding found by its other name chosen',
    );
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'wide.txt'));
    await waitFor(
      async () => !(await rowNames()).includes('wide.txt'),
      'the file to be gone from the list',
    );
  });

  test('keeps the scrollbar of the language menu below its filter and off its rounded corners, from the first language to the last', async () => {
    fs.writeFileSync(path.join(opened, 'menu.ts'), 'const a = 1;');
    await select('menu');
    await page.keyboard.press('F3');
    await page.locator('.viewer-rows .viewer-row').first().waitFor();
    await page.keyboard.press('l');
    const menu = page.locator('.viewer .language-button .menu');
    await menu.waitFor();
    const thumb = page.locator('.overlay-scrollbar.vertical.shown');
    const boxes = async () => {
      await thumb.waitFor();
      const [menuBox, filterBox, thumbBox] = await Promise.all([
        menu.boundingBox(),
        page.locator('.viewer .language-button .menu-filter').boundingBox(),
        thumb.boundingBox(),
      ]);
      assert.ok(menuBox && filterBox && thumbBox);
      return { menuBox, filterBox, thumbBox };
    };

    await menu.hover();
    const top = await boxes();
    const subpixel = 0.5;
    assert.ok(
      top.thumbBox.y >= top.filterBox.y + top.filterBox.height - subpixel,
      JSON.stringify(top),
    );

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await waitFor(
      async () =>
        (await boxes()).thumbBox.y > top.thumbBox.y + top.thumbBox.height,
      'the thumb at the end of its track',
    );
    const end = await boxes();
    assert.ok(
      end.thumbBox.y + end.thumbBox.height <=
        end.menuBox.y + end.menuBox.height - 6 + subpixel,
      JSON.stringify(end),
    );

    await page.keyboard.press('Home');
    await waitFor(
      async () => (await boxes()).thumbBox.y === top.thumbBox.y,
      'the thumb back at the start of its track',
    );
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'menu.ts'));
    await waitFor(
      async () => !(await rowNames()).includes('menu.ts'),
      'menu.ts to be gone from the list',
    );
  });

  test('scrolls the language menu to where its track is pressed, the thumb centered there and following the pointer while held, without choosing the language under it or selecting text', async () => {
    fs.writeFileSync(path.join(opened, 'track.ts'), 'const a = 1;');
    await select('track');
    await page.keyboard.press('F3');
    await page.locator('.viewer-rows .viewer-row').first().waitFor();
    const label = page.locator('.viewer .language-button .menu-button-label');
    const language = await label.textContent();
    await page.keyboard.press('l');
    const menu = page.locator('.viewer .language-button .menu');
    await menu.waitFor();
    const thumb = page.locator('.overlay-scrollbar.vertical.shown');
    await menu.hover();
    await thumb.waitFor();
    const [menuBox, top] = await Promise.all([
      menu.boundingBox(),
      thumb.boundingBox(),
    ]);
    assert.ok(menuBox && top);
    const x = top.x + top.width / 2;
    const trackTop = top.y;
    const trackBottom = menuBox.y + menuBox.height - 6;
    const centered = async (y: number) => {
      const box = await thumb.boundingBox();
      return box !== null && Math.abs(box.y + box.height / 2 - y) <= 1;
    };

    const middle = (trackTop + trackBottom) / 2;
    await page.mouse.move(x, middle);
    await page.mouse.down();
    await waitFor(() => centered(middle), 'the thumb centered where pressed');
    const lower = trackTop + ((trackBottom - trackTop) * 3) / 4;
    await page.mouse.move(x, lower, { steps: 5 });
    await waitFor(() => centered(lower), 'the thumb following the pointer');
    await page.mouse.up();
    await page.mouse.click(x, trackTop + 2);
    await waitFor(
      async () => (await thumb.boundingBox())?.y === top.y,
      'the thumb back at the start of its track',
    );

    assert.strictEqual(await menu.count(), 1);
    assert.strictEqual(
      await page.evaluate(() => getSelection()?.toString() ?? ''),
      '',
    );
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
    assert.strictEqual(await label.textContent(), language);
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'track.ts'));
    await waitFor(
      async () => !(await rowNames()).includes('track.ts'),
      'track.ts to be gone from the list',
    );
  });

  test('colors the code of a file in any encoding, from the first line of one with a byte order mark', async () => {
    const code = ['const a = 1;', "let b = 'é';"].join(String.fromCharCode(10));
    const files = {
      'wide.ts': Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from(code, 'utf16le'),
      ]),
      'marked.ts': Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(code),
      ]),
    };
    for (const [name, bytes] of Object.entries(files)) {
      fs.writeFileSync(path.join(opened, name), bytes);
      await select(name.replace('.ts', ''));
      await page.keyboard.press('F3');
      const firstKeywords = () =>
        page
          .locator('.viewer-rows .viewer-row')
          .evaluateAll((rows) =>
            rows.map(
              (row) => row.querySelector('.syntax-keyword')?.textContent,
            ),
          );
      await waitFor(
        async () => (await firstKeywords()).join(' ') === 'const let',
        `the keywords of both lines of ${name} colored`,
      );
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });
      fs.rmSync(path.join(opened, name));
      await waitFor(
        async () => !(await rowNames()).includes(name),
        `${name} to be gone from the list`,
      );
    }
  });

  test('reads a text file that is not UTF-8 in the code page of the system', async () => {
    fs.writeFileSync(
      path.join(opened, 'legacy.txt'),
      Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x6f, 0x6b]),
    );
    try {
      await select('legacy');
      await page.keyboard.press('F3');
      await page.locator('.viewer').waitFor();
      await waitFor(
        async () => (await firstViewerRow()).startsWith('caf'),
        'the text',
      ).catch(async (error: unknown) => {
        throw new Error(
          `${String(error)}: the viewer of ${await page.locator('.viewer').getAttribute('data-file')} showed ${JSON.stringify(await page.locator('.viewer').innerText())}`,
        );
      });
      const row = await firstViewerRow();
      assert.ok(!row.includes(String.fromCharCode(0xfffd)), row);
      assert.ok(
        ['1250', '1251', '1252'].includes(
          (await page
            .locator('.viewer-encoding .menu-button-label')
            .textContent()) ?? '',
        ),
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'legacy.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('legacy.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test.skipIf(process.platform !== 'win32')(
    'shows the menu of Windows for a file right-clicked, selecting it, or selected on Shift+F10, with the commands Explorer shows, and goes on once the menu is closed',
    async () => {
      const file = path.join(opened, 'menu.txt');
      fs.writeFileSync(file, 'menu\n');
      await waitFor(
        async () => (await rowNames()).includes('menu.txt'),
        'the file to be listed',
      );
      const { default: koffi } = await import('koffi');
      const user32 = koffi.load('user32.dll');
      const findWindow = user32.func(
        'void *FindWindowExW(void *parent, void *after, const char16_t *className, const char16_t *title)',
      );
      const visible = user32.func('bool IsWindowVisible(void *window)');
      const sendMessage = user32.func(
        'intptr_t SendMessageW(void *window, uint32_t message, uintptr_t w, intptr_t l)',
      );
      const postMessage = user32.func(
        'bool PostMessageW(void *window, uint32_t message, uintptr_t w, intptr_t l)',
      );
      const itemCount = user32.func('int GetMenuItemCount(intptr_t menu)');
      const shown = (): unknown => {
        for (
          let menu: unknown = findWindow(null, null, '#32768', null);
          menu !== null;
          menu = findWindow(null, menu, '#32768', null)
        ) {
          if (visible(menu) === true) {
            return menu;
          }
        }
        return null;
      };
      try {
        const clicking = right()
          .locator('.commander-row', { hasText: 'menutxt' })
          .click({ button: 'right' });
        await waitFor(() => shown() !== null, 'the menu of Windows');

        assert.ok(Number(itemCount(sendMessage(shown(), 0x1e1, 0, 0))) > 3);
        postMessage(shown(), 0x100, 0x1b, 0);
        await waitFor(() => shown() === null, 'the menu to close');
        await clicking;
        assert.match(await selected(), /menu/);

        const pressing = page.keyboard.press('Shift+F10');
        await waitFor(() => shown() !== null, 'the menu again on Shift+F10');
        postMessage(shown(), 0x100, 0x1b, 0);
        await waitFor(() => shown() === null, 'the menu to close again');
        await pressing;
        assert.strictEqual(await app.evaluate(() => 'answering'), 'answering');
      } finally {
        const open = shown();
        if (open !== null) {
          postMessage(open, 0x10, 0, 0);
        }
        fs.rmSync(file);
      }
    },
  );

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

    await list.evaluate((element) =>
      element.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: 2990,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await waitFor(async () => (await offRow()).top > 2000, 'a long way down');
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
          left: { column: 'extension', descending: false, groupByColor: true },
          right: { column: 'size', descending: false, groupByColor: true },
        })
      );
    }, 'the order of the right side to be saved');
  });
});
