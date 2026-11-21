import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElectronApplication, Locator, Page } from 'playwright-core';
import { afterAll, beforeAll } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { closeOrKill, launchApp } from './appLaunch';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { fileName, rowsShown } from './commanderRows';

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
  element.evaluate(async (shown) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', {
      willReadFrequently: true,
    });
    if (context === null) {
      throw new Error('no canvas');
    }
    const inked = async () => {
      const image = new Image();
      image.src = getComputedStyle(shown)
        .backgroundImage.replace(/^url\("/, '')
        .replace(/"\).*$/, '');
      await image.decode();
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      return Math.max(...data.filter((_, at) => at % 4 === 3));
    };
    const full = shown.classList.contains('commander-line')
      ? shown.querySelector('.system-icon') === null
        ? await inked()
        : 1
      : undefined;
    const look = async () => {
      const icon = shown.querySelector('.system-icon');
      canvas.width = 1;
      canvas.height = 1;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = getComputedStyle(shown).color;
      context.fillRect(0, 0, 1, 1);
      const color = [...context.getImageData(0, 0, 1, 1).data];
      return {
        color,
        icon:
          full === undefined
            ? undefined
            : icon === null
              ? (await inked()) / full
              : Number(getComputedStyle(icon).opacity),
      };
    };
    const before = await look();
    shown.classList.add('hidden');
    const after = await look();
    shown.classList.remove('hidden');
    return { before, after };
  });

export const looksOf = (row: Locator) =>
  row.evaluate((shown) => {
    const drawn = (part: string) =>
      getComputedStyle(shown, part).content === 'none' ? 'hidden' : 'visible';
    return {
      color: getComputedStyle(shown).color,
      weight: getComputedStyle(shown).fontWeight,
      background: getComputedStyle(shown).backgroundColor,
      box: drawn('::before'),
      check: drawn('::after'),
    };
  });

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

export const markingRow = (name: string) =>
  right().locator('.commander-row', {
    hasText: new RegExp(`^${name}\\s*txt`),
  });

export const icons = () =>
  right()
    .locator('.commander-row')
    .evaluateAll((rows) =>
      rows.map((row) => {
        const image = row.querySelector<HTMLImageElement>('img.system-icon');
        const text = [...row.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? '')
          .join('');
        const drawn =
          row.querySelector('.commander-name')?.textContent ??
          text.split(String.fromCharCode(9))[0] ??
          '';
        const picture = getComputedStyle(row).backgroundImage;
        const pictured = (name: string) =>
          row.classList.contains(`generic-${name}`) &&
          picture.startsWith('url("data:image/png') &&
          picture.startsWith(
            getComputedStyle(document.documentElement)
              .getPropertyValue(`--${name}-icon`)
              .trim(),
          );
        return {
          name:
            row.classList.contains('plain') &&
            row.classList.contains('commander-folder')
              ? drawn.slice(1, -1)
              : drawn,
          folder: pictured('folder'),
          file: pictured('file'),
          loaded: image !== null && image.complete && image.naturalWidth > 0,
          loading: image?.classList.contains('loading') === true,
        };
      }),
    );

export const selected = async () =>
  (await right().locator('.commander-row.selected').textContent()) ?? '';
export const select = async (name: string | RegExp) => {
  await right().locator('.commander-row', { hasText: name }).click();
  await waitFor(
    async () => {
      const text = await selected();
      return typeof name === 'string' ? text.includes(name) : name.test(text);
    },
    `${String(name)} to be selected`,
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
    const buttons = box('.column-title');
    const text = box('.path-text');
    const names = box('.commander-header .commander-name');
    const dates = box('.commander-header .commander-date');
    return {
      underButtons: text.top >= buttons.bottom - 1 / 64,
      aboveHeadings: text.bottom <= names.top + 1 / 64,
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
