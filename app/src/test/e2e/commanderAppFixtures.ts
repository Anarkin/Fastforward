import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElectronApplication, Locator, Page } from 'playwright-core';
import { afterAll, beforeAll } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { closeOrKill, launchApp } from './appLaunch';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import {
  clickLine,
  fileName,
  lineOf,
  linesShown,
  rowsShown,
  selectedText,
  untilLines,
} from './commanderRows';

export let folder: string;
export let opened: string;
export let profile: string;
export let app: ElectronApplication;
export let page: Page;

export const colorOf = (locator: Locator) =>
  locator.evaluate((element) => getComputedStyle(element).color);

export const threeLines = (changed: string) =>
  ['one', changed, 'three', ''].join(String.fromCharCode(10));

export const savedSetting = (
  profileFolder: string,
  ...keys: readonly string[]
): unknown => {
  const file = path.join(profileFolder, 'settings.user.json');
  let saved: unknown = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : {};
  for (const key of keys) {
    saved =
      typeof saved === 'object' && saved !== null
        ? Reflect.get(saved, key)
        : undefined;
  }
  return saved;
};

export const hiding = (element: Locator) =>
  element.evaluate((shown) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', {
      willReadFrequently: true,
    });
    if (context === null) {
      throw new Error('no canvas');
    }
    const look = () => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = getComputedStyle(shown).color;
      context.fillRect(0, 0, 1, 1);
      return { color: [...context.getImageData(0, 0, 1, 1).data] };
    };
    const before = look();
    shown.classList.add('hidden');
    const after = look();
    shown.classList.remove('hidden');
    return { before, after };
  });

export const looksOf = async (match: string | RegExp) => {
  const line = await lineOf(right(), match);
  return {
    color: line.ink,
    background: line.ground,
    box: line.check === 'none' ? 'hidden' : 'visible',
    check: line.check === 'checked' ? 'visible' : 'hidden',
  };
};

const bytesOf = (color: string) =>
  page.evaluate((css) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      throw new Error('no canvas');
    }
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data];
  }, color);

export const hidingLine = async (match: string | RegExp) => {
  const line = await lineOf(right(), match);
  const classes = line.classes
    .filter((name) => name !== 'pointed' && !name.startsWith('generic-'))
    .join(' ');
  const inksOf = (shown: string) =>
    right()
      .locator('.commander-layer')
      .evaluate(
        (layer, asked) =>
          layer instanceof HTMLElement ? layer.seenInks?.(asked) : undefined,
        shown,
      );
  const look = async (shown: string) => {
    const inks = await inksOf(shown);
    if (inks === undefined) {
      throw new Error('no inks of the canvas');
    }
    return { color: await bytesOf(inks.ink), icon: inks.iconOpacity };
  };
  return {
    before: await look(classes),
    after: await look(`${classes} hidden`),
  };
};

export const savedText = (profileFolder: string, name: string): unknown =>
  savedSetting(profileFolder, 'text', name);

export const betweenRows = (places: readonly number[], row: number) =>
  places.some(
    (place) => Math.abs(place / row - Math.round(place / row)) > 0.01,
  );

export const wrapLongLines = async (wrap = true) => {
  const button = page.getByRole('button', { name: 'Wrap Long Lines' });
  if ((await button.getAttribute('aria-pressed')) !== String(wrap)) {
    await button.click();
  }
  await page
    .getByRole('button', { name: 'Wrap Long Lines', pressed: wrap })
    .waitFor();
};

export const right = () => page.locator('.commander-pane').nth(1);
export const rowNames = async (pane = right()) =>
  (await rowsShown(pane)).map(fileName);

const namesWith = async (className: string) =>
  (await rowsShown(right()))
    .filter(({ classes }) => classes.includes(className))
    .map(({ name }) => name);

export const groupStartsShown = () => namesWith('group-start');
export const statusShown = () =>
  right().locator('.column-status').textContent();
export const sortedRows = async () => (await rowNames()).toSorted().join();

export const markedSorted = async () => (await markedNames()).toSorted().join();

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

export const markedNames = () => namesWith('marked');

export const markingRow = (name: string) => new RegExp(`^${name} txt`);

export const icons = async () =>
  (await linesShown(right())).map((line) => ({
    name: line.name,
    folder:
      line.icon === 'generic' && line.classes.includes('commander-folder'),
    file: line.icon === 'generic' && !line.classes.includes('commander-folder'),
    loaded: line.icon === 'system',
  }));

export const selected = () => selectedText(right());
export const select = async (name: string | RegExp) => {
  const chosen = async () => {
    const text = await selected();
    return typeof name === 'string' ? text.includes(name) : name.test(text);
  };
  for (let tries = 0; !(await chosen()); tries++) {
    await clickLine(page, right(), name);
    const told = await waitFor(chosen, `${String(name)} to be selected`, 1500)
      .then(() => true)
      .catch((error: unknown) => {
        if (tries >= 4) {
          throw error;
        }
        return false;
      });
    if (told) {
      return;
    }
  }
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
      const parts = [...title.querySelectorAll('.path-folder .path-part')];
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
    const text = box('.path-text');
    const names = box('.commander-header .commander-name');
    const row = box('.commander-path');
    const padding = getComputedStyle(
      side.querySelector('.commander-path') ?? side,
    );
    return {
      atTop:
        side.querySelector('.column-title') === null &&
        side.firstElementChild === side.querySelector('.commander-path'),
      aboveHeadings: text.bottom <= names.top + 1 / 64,
      fromStart:
        Math.round(text.left - row.left - parseFloat(padding.paddingLeft)) + 0,
      shortOfEnd:
        Math.round(row.right - parseFloat(padding.paddingRight) - text.right) +
        0,
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
    await untilLines(right());
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });
}
