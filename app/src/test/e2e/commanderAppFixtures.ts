import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import type { ElectronApplication, Locator, Page } from 'playwright-core';
import { afterAll, beforeAll } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { clippedCorner, closeOrKill, launchApp } from './appFixtures';
import { removeFolder, tempFolder } from '../helpers/repositories';

export let folder: string;
export let opened: string;
export let profile: string;
export let app: ElectronApplication;
export let page: Page;

export const colorOf = (locator: Locator) =>
  locator.evaluate((element) => getComputedStyle(element).color);

export const dotted = (drawn: Locator) =>
  drawn
    .first()
    .evaluate((element) =>
      getComputedStyle(element).backgroundImage.startsWith('linear-gradient'),
    );

const pngChunk = (type: string, body: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
};

export const grayPng = (width: number, height: number) => {
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

export const withOrientation = (jpeg: Buffer, orientation: number) => {
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

export const storedThumbnails = (profileFolder: string): number => {
  const stored = path.join(profileFolder, 'Thumbnails');
  return fs.existsSync(stored)
    ? fs.readdirSync(stored).filter((name) => name.endsWith('.webp')).length
    : 0;
};

export const threeLines = (changed: string) =>
  ['one', changed, 'three', ''].join(String.fromCharCode(10));

export const savedSetting = (
  profileFolder: string,
  group: string,
  name: string,
): unknown => {
  const file = path.join(profileFolder, 'settings.user.json');
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

export const hiding = (element: Locator) =>
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

export const looksOf = (row: Locator) =>
  row.evaluate((shown) => {
    const box = shown.querySelector('.commander-check');
    const check = shown.querySelector('.check-box');
    return {
      color: getComputedStyle(shown).color,
      weight: getComputedStyle(shown).fontWeight,
      background: getComputedStyle(shown).backgroundColor,
      box: box === null ? undefined : getComputedStyle(box).visibility,
      check:
        check === null
          ? undefined
          : getComputedStyle(check, '::after').content === 'none'
            ? 'hidden'
            : 'visible',
    };
  });

export const savedText = (profileFolder: string, name: string): unknown =>
  savedSetting(profileFolder, 'text', name);

export const betweenRows = (places: readonly number[], row: number) =>
  places.some(
    (place) => Math.abs(place / row - Math.round(place / row)) > 0.01,
  );

export const right = () => page.locator('.commander-pane').nth(1);
export const rowNames = (pane = right()) =>
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

export const groupStartsShown = () =>
  right()
    .locator('.commander-row.group-start .commander-name')
    .allTextContents();
export const statusShown = () =>
  right().locator('.column-status').textContent();
export const sortedRows = async () => (await rowNames()).toSorted().join();

export const thumbGaps = () =>
  right()
    .evaluate((side) => {
      const scroller = side.querySelector('.virtual-rows');
      const bar = document.querySelector('.overlay-scrollbar.vertical.shown');
      if (scroller === null || bar === null) {
        return undefined;
      }
      const line = parseFloat(
        getComputedStyle(side, '::after').getPropertyValue('--frame-line'),
      );
      const inner =
        parseFloat(getComputedStyle(side).borderBottomRightRadius) - line;
      const border = parseFloat(getComputedStyle(bar).borderTopWidth);
      const edge = side.getBoundingClientRect();
      const list = scroller.getBoundingClientRect();
      const thumb = bar.getBoundingClientRect();
      const rightGap = edge.right - line - (thumb.right - border);
      const bottomGap = edge.bottom - line - (thumb.bottom - border);
      return {
        right: Math.round(rightGap) + 0,
        top: Math.round(thumb.top + border - list.top) + 0,
        bottom: Math.round(bottomGap) + 0,
        corner: Math.round(inner),
        clip: getComputedStyle(bar).clipPath,
        atEnd:
          scroller.scrollTop + scroller.clientHeight >=
          scroller.scrollHeight - 1,
      };
    })
    .then(
      (gaps) =>
        gaps && { ...gaps, rounded: Math.round(clippedCorner(gaps.clip)) },
    );

export const markedSorted = async () => (await markedNames()).toSorted().join();

export const thumbnailed = () =>
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

export const shownThumbnailOf = (name: string) =>
  right()
    .locator('.commander-tile', { hasText: name })
    .locator('img.thumbnail-image')
    .evaluate((image: HTMLImageElement) =>
      image.complete ? image.naturalWidth : 0,
    )
    .catch(() => 0);

export const thumbnailLookOf = (name: string) =>
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
        context?.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[0] ?? 0;
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

export const onClipboard = () =>
  app
    .evaluate(async ({ clipboard }) => {
      for (const item of await clipboard.read()) {
        if (item.types.includes('text/uri-list')) {
          return (await item.getType('text/uri-list')).text();
        }
      }
      return '';
    })
    .then((list) =>
      list
        .split(/\r?\n/)
        .filter(Boolean)
        .map((uri) => fileURLToPath(uri)),
    );

export const textOnClipboard = () =>
  app.evaluate(({ clipboard }) => clipboard.readText());

export const markedNames = () =>
  right().locator('.commander-row.marked .commander-name').allTextContents();

export const markingRow = (name: string) =>
  right().locator('.commander-row', { hasText: `${name}txt` });

export const icons = () =>
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

export const shownState = () =>
  page.evaluate(() => {
    const viewer = document.querySelector('.viewer');
    return JSON.stringify({
      viewing: viewer?.getAttribute('data-file') ?? null,
      text:
        viewer instanceof HTMLElement ? viewer.innerText.slice(0, 300) : null,
      selected: [...document.querySelectorAll('.commander-row.selected')].map(
        (row) => row.textContent,
      ),
      focused: document.activeElement?.className ?? null,
    });
  });
export const closeViewer = async () => {
  if (await page.locator('.viewer').isVisible()) {
    await page.keyboard.press('Escape');
    await page
      .locator('.viewer')
      .waitFor({ state: 'detached' })
      .catch(() => undefined);
  }
};
export const firstViewerRow = async () =>
  (await page.locator('.viewer-rows .viewer-row').first().textContent()) ?? '';
export const findMarks = () =>
  page
    .locator('.viewer-rows .find-match')
    .evaluateAll((elements) =>
      elements.map((element) => [
        element.textContent,
        element.classList.contains('current'),
      ]),
    );
export const findCount = () =>
  page.locator('.viewer .find-field-count').textContent();
export const selected = async () =>
  (await right().locator('.commander-row.selected').textContent()) ?? '';
export const viewerThumb = () =>
  page.locator('.viewer-thumb').evaluate((element) => {
    const box = element.getBoundingClientRect();
    const track = element.parentElement?.getBoundingClientRect();
    return {
      top: box.top,
      height: box.height,
      fromEnd: (track?.bottom ?? 0) - box.bottom,
    };
  });
export const select = async (name: string) => {
  await right().locator('.commander-row', { hasText: name }).click();
  await waitFor(
    async () =>
      (
        await right().locator('.commander-row.selected').textContent()
      )?.includes(name) === true,
    `${name} to be selected`,
  );
};
export const openFolder = async (name: string, folderPath: string) => {
  await select(name);
  await page.keyboard.press('Enter');
  await waitFor(
    async () =>
      (await right().locator('.column-name').textContent()) === folderPath,
    `${name} to open`,
  );
};
export const pathCut = () =>
  right()
    .locator('.path-title')
    .evaluate((title) => {
      const box = (selector: string) => {
        const found = title.querySelector(selector);
        if (found === null) {
          throw new Error(selector);
        }
        return found.getBoundingClientRect();
      };
      const textBox = (node: Node) => {
        const range = title.ownerDocument.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect();
      };
      const shownFolders = box('.path-folder');
      const name = box('.path-name');
      const parts = [...title.querySelectorAll('.path-part')];
      const first = textBox(parts[0]);
      const nearestPart = parts[parts.length - 1];
      const nearest = textBox(nearestPart);
      const after = nearestPart.nextSibling;
      const separator =
        after?.nodeType === Node.TEXT_NODE ? textBox(after) : undefined;
      const named = title.querySelector('.path-name') ?? title;
      const nameText = textBox(named);
      const advance = nameText.width / (named.textContent?.length ?? 1);
      return {
        startCut: first.left < shownFolders.left - 1,
        startMarked: shownFolders.width >= 2 * advance - 0.5,
        nearestInView:
          nearest.left >= shownFolders.left - 0.02 &&
          nearest.right <= shownFolders.right + 0.02,
        separatorInView:
          separator !== undefined &&
          separator.width > 0 &&
          separator.left >= shownFolders.left - 0.02 &&
          separator.right <= shownFolders.right + 0.02 &&
          separator.right <= name.left + 0.02,
        nameWhole: nameText.width <= name.width + 0.02,
        nameInView: name.right <= title.getBoundingClientRect().right + 0.02,
      };
    });
export const pathPlaces = () =>
  right().evaluate((side) => {
    const box = (selector: string) => {
      const found = side.querySelector(selector);
      if (found === null) {
        throw new Error(selector);
      }
      return found.getBoundingClientRect();
    };
    const buttons = box('.column-title');
    const text = box('.path-text');
    const names = box('.commander-header .commander-name');
    const dates = box('.commander-header .commander-date');
    return {
      underButtons: text.top >= buttons.bottom,
      aboveHeadings: text.bottom <= names.top,
      fromNames: Math.round(text.left - names.left) + 0,
      shortOfDates: Math.round(dates.right - text.right) + 0,
    };
  });
export const savedBookmarks = () => {
  const file = path.join(profile, 'settings.user.json');
  return fs.existsSync(file)
    ? JSON.stringify(
        JSON.parse(fs.readFileSync(file, 'utf8'))?.tools?.commander?.bookmarks,
      )
    : undefined;
};

export function sharedCommanderApp(): void {
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
}
