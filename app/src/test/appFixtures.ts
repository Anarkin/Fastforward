import { spawnSync, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  _electron,
  type ElectronApplication,
  type Locator,
  type Page,
} from 'playwright-core';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { defaultSettings, waitFor } from './fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

export const appFolder = path.join(__dirname, '..', '..');

const longLine = Array.from({ length: 80 }, (_, index) => `word${index}`).join(
  ' ',
);
export const longLines = Array.from(
  { length: 200 },
  (_, index) => `line${index} ${longLine}`,
);
export const [firstLongLine] = longLines;

export const gridRuler = '....:....1....:....2....:....3....:....4|';

export const gridLines = [
  gridRuler,
  ...(
    [
      ['😀', 2],
      ['😀'.repeat(10), 20],
      ['🎉 🎉 🎉 🎉 🎉 party', 20],
      ['中文中文中文', 12],
      ['日本語のテキスト', 16],
      ['한국어 텍스트', 13],
      ['😀😀😀 中文中文 abc', 19],
      ['Árvíztűrő tükörfúrógép', 22],
      ['👨‍👩‍👧‍👦 family of four', 17],
      ['⚠ text      ⚠️ emoji', 20],
      ['🇭🇺 flag', 7],
      ['1️⃣ keycap', 9],
      ['👍🏽 skin tone', 12],
      ['Café au lait', 12],
      ['ＡＢＣ fullwidth', 16],
      ['├── ★ → ± ° …', 13],
      ['abcd\t', 8],
      ['abc😀\t', 8],
      ['😀😀\t', 8],
      ['x😀😀😀\t', 8],
      ['ab中\t', 8],
      ['中中中\t', 8],
    ] as const
  ).map(([text, columns]) => `${text}${' '.repeat(40 - columns)}|`),
];

export function barsOffGrid(code: readonly Element[]): number[] {
  const lefts: number[] = [];
  for (const element of code) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let left = Number.NaN;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Text && node.data.includes('|')) {
        const range = document.createRange();
        const at = node.data.lastIndexOf('|');
        range.setStart(node, at);
        range.setEnd(node, at + 1);
        left = range.getBoundingClientRect().left;
      }
    }
    lefts.push(left);
  }
  const [ruler, ...rows] = lefts;
  return rows.map((left) => Math.round((left - ruler) * 10) / 10 + 0);
}

export function linesOffGrid(code: Element): number[] {
  const lefts: number[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  let line = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text)) {
      continue;
    }
    for (let at = 0; at < node.length; at++) {
      if (node.data[at] === '\n') {
        line++;
      } else if (node.data[at] === '|') {
        range.setStart(node, at);
        range.setEnd(node, at + 1);
        lefts[line] = range.getBoundingClientRect().left;
      }
    }
  }
  const [ruler, ...rows] = lefts;
  return rows.map((left) => Math.round((left - ruler) * 10) / 10);
}

export async function scrollPlaces(
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

export function waitForCount(
  locator: Locator,
  count: number,
  what: string,
): Promise<void> {
  return waitFor(
    async () => (await locator.count()) === count,
    `${count} ${what}`,
  );
}

function boxSides(text: string): readonly number[] {
  const [top = 0, right = top, bottom = top, left = right] = text
    .trim()
    .split(/\s+/)
    .map(parseFloat);
  return [top, right, bottom, left];
}

function atEdge(inset = 0): boolean {
  return Math.abs(inset) < 0.01;
}

export function clippedCorner(clipPath: string): number {
  const shape = /^inset\(([^)]*?)(?: round ([^)]*))?\)$/.exec(clipPath);
  if (shape === null) {
    return 0;
  }
  const [, right, bottom] = boxSides(shape[1] ?? '');
  const [, , corner = 0] = boxSides(shape[2] ?? '0px');
  return atEdge(right) && atEdge(bottom) ? corner : 0;
}

export function within<T>(
  promise: Promise<T>,
  what: string,
  timeout = 10_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Timed out waiting for ${what}`)),
        timeout,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function closeOrKill(app: ElectronApplication): Promise<void> {
  const closing = app.close();
  try {
    await within(closing, 'the app to close');
  } catch {
    killWithChildren(app.process());
    closing.catch(() => undefined);
  }
}

function killWithChildren(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid !== undefined) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f']);
    return;
  }
  child.kill('SIGKILL');
}

export function waitForFocus(locator: Locator, what: string): Promise<void> {
  return waitFor(
    () => locator.evaluate((element) => element === document.activeElement),
    `${what} to be focused`,
  );
}

export const baseSettings = {
  scrolling: { smooth: true },
  text: { wordWrap: false },
  tools: { git: { diffLayout: 'inline' } },
};

export function savedTabs(
  roots: readonly string[],
  active: string,
): { tabs: unknown[]; activeTab: string } {
  return {
    tabs: roots.map((root, index) => ({
      id: String(index + 1),
      tool: 'git',
      root,
    })),
    activeTab: String(roots.indexOf(active) + 1),
  };
}

export function appArguments(profile: string, ...after: string[]): string[] {
  return [appFolder, `--user-data-dir=${profile}`, ...after];
}

export async function launchApp(
  profile: string,
  {
    before = [],
    after = [],
    env,
  }: {
    readonly before?: readonly string[];
    readonly after?: readonly string[];
    readonly env?: Record<string, string>;
  } = {},
): Promise<ElectronApplication> {
  return _electron.launch({
    args: [...before, ...appArguments(profile, ...after)],
    cwd: appFolder,
    ...(env === undefined ? {} : { env }),
  });
}

export let folder: string;
export let profile: string;
export let repository: TempRepository;
export let app: ElectronApplication;
export let page: Page;

export function sharedApp(files: Readonly<Record<string, string>>): void {
  let resetFailed = false;
  let launched: ElectronApplication | undefined;

  beforeAll(async () => {
    folder = tempFolder('app');
    profile = path.join(folder, 'profile');
    repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first', {
      ...files,
      'changed.txt': 'one\ntwo\nthree\n',
    });
    await repository.commit('second', { 'changed.txt': 'one\n2\nthree\n' });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify(savedTabs([repository.root], repository.root)),
    );
    launched = await launchApp(profile);
    app = launched;
    page = await app.firstWindow();
    await waitForSettingsToBeWatched();
  });

  afterAll(async () => {
    if (launched !== undefined) {
      await closeOrKill(launched);
    }
    removeFolder(folder);
  });

  beforeEach(async (context) => {
    context.skip(
      resetFailed,
      'the app could not be reset for an earlier test of this file',
    );
    try {
      await resetApp();
    } catch (error) {
      resetFailed = true;
      throw error;
    }
  });
}

function waitForSettingsToBeWatched(): Promise<void> {
  return page.locator('.commit', { hasText: 'second' }).waitFor();
}

async function resetApp(): Promise<void> {
  await resetSettings();
  await page.locator('.commit', { hasText: 'second' }).waitFor();
  for (const [popup, focused] of [
    ['.context-menu', '.context-menu .menu-item'],
    ['.locations-popup', '.locations-search'],
    ['.shortcuts-popup', '.shortcuts-popup'],
    ['.search-row', '.search-row input'],
  ]) {
    if ((await page.locator(popup).count()) > 0) {
      await page.locator(focused).first().focus();
      await page.keyboard.press('Escape');
      await page.locator(popup).waitFor({ state: 'detached' });
    }
  }
  const notice = page.locator('.notice-close').first();
  while ((await notice.count()) > 0) {
    await notice.click({ timeout: 1000 }).catch(() => undefined);
  }
  await page.locator('.virtual-rows.list').focus();
  await page.keyboard.press('Home');
  await page.locator('.commit.working-tree.selected').waitFor();
}

function userSettings(): unknown {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(profile, 'settings.user.json'), 'utf8'),
    );
  } catch (error) {
    return error instanceof SyntaxError ? error : {};
  }
}

export function savedSetting(name: string): unknown {
  const settings = userSettings();
  const tools: unknown =
    typeof settings === 'object' && settings !== null
      ? Reflect.get(settings, 'tools')
      : undefined;
  const git: unknown =
    typeof tools === 'object' && tools !== null
      ? Reflect.get(tools, 'git')
      : undefined;
  return typeof git === 'object' && git !== null
    ? Reflect.get(git, name)
    : undefined;
}

function savedText(name: string): unknown {
  const settings: unknown = JSON.parse(
    fs.readFileSync(path.join(profile, 'settings.user.json'), 'utf8'),
  );
  const text: unknown =
    typeof settings === 'object' && settings !== null
      ? Reflect.get(settings, 'text')
      : undefined;
  return typeof text === 'object' && text !== null
    ? Reflect.get(text, name)
    : undefined;
}

export function wrapsSaved(): boolean {
  return (savedText('wordWrap') ?? defaultSettings().text.wordWrap) === true;
}

export function whitespaceShownSaved(): boolean {
  return (
    (savedText('showWhitespace') ?? defaultSettings().text.showWhitespace) ===
    true
  );
}

export function viewSaved(wordWrap: boolean, diffLayout: string): boolean {
  const defaults = defaultSettings();
  return (
    (savedText('wordWrap') ?? defaults.text.wordWrap) === wordWrap &&
    (savedSetting('diffLayout') ?? defaults.tools.git.diffLayout) === diffLayout
  );
}

async function resetSettings(): Promise<void> {
  const settings = userSettings();
  const expected = { ...defaultSettings(), ...baseSettings };
  if (
    typeof settings === 'object' &&
    settings !== null &&
    !(settings instanceof Error) &&
    Object.entries(settings).every(([name, value]) =>
      isDeepStrictEqual(value, Reflect.get(expected, name)),
    ) &&
    Object.keys(baseSettings).every((name) => name in settings)
  ) {
    return;
  }
  const reloaded = page.waitForEvent('load');
  fs.writeFileSync(
    path.join(profile, 'settings.user.json'),
    `${JSON.stringify(baseSettings)}\n`,
  );
  await reloaded;
}

export async function openChangedFile(): Promise<void> {
  await page.locator('.commit', { hasText: 'second' }).click();
  await page.locator('.row.file', { hasText: 'changed.txt' }).click();
  await page.locator('.diff-line.added', { hasText: '2' }).waitFor();
}
