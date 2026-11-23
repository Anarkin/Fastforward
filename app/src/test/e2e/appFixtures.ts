import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { defaultSettings, waitFor } from '../helpers/fixtures';
import { tempRepository, type TempRepository } from '../helpers/repositories';
import { baseSettings, closeOrKill, launchApp, savedTabs } from './appLaunch';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { diffLinesSeen, untilDiffLine, type DiffLineSeen } from './diffSeen';
import { appSaving, markedSettings, writeSettings } from './settingsWritten';

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
    ['.locations-popup', '.locations-popup .search-box-input'],
    ['.shortcuts-popup', '.shortcuts-popup'],
    ['.column-title .search-bar', '.column-title .search-bar input'],
  ]) {
    if ((await page.locator(popup).count()) > 0) {
      await page.locator(focused).first().focus();
      await page.keyboard.press('Escape');
      await page.locator(popup).waitFor({ state: 'detached' });
    }
  }
  const notice = page.locator('.card-close').first();
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

export function savedSetting(tool: string, name: string): unknown {
  let saved: unknown = userSettings();
  for (const key of ['tools', tool, name]) {
    saved =
      typeof saved === 'object' && saved !== null
        ? Reflect.get(saved, key)
        : undefined;
  }
  return saved;
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
    (savedSetting('diff', 'diffLayout') ?? defaults.tools.diff.diffLayout) ===
      diffLayout
  );
}

let resets = 0;

async function resetSettings(): Promise<void> {
  const settings = userSettings();
  const reset = markedSettings(baseSettings, resets);
  const expected = { ...defaultSettings(), ...reset };
  if (
    typeof settings === 'object' &&
    settings !== null &&
    !(settings instanceof Error) &&
    Object.entries(settings).every(([name, value]) =>
      isDeepStrictEqual(value, Reflect.get(expected, name)),
    ) &&
    Object.keys(reset).every((name) => name in settings) &&
    !appSaving(profile)
  ) {
    return;
  }
  resets = await writeSettings(page, profile, baseSettings);
}

export async function diffLineNumbered(number: number): Promise<DiffLineSeen> {
  const list = page.locator('.diff-view .virtual-rows');
  let line: DiffLineSeen | undefined;
  await waitFor(async () => {
    line = (await diffLinesSeen(page)).find(({ numbers }) =>
      numbers.includes(String(number)),
    );
    const from = line?.top;
    return list.evaluate((element, top) => {
      const box = element.getBoundingClientRect();
      const before = element.scrollTop;
      if (top === undefined) {
        element.scrollTop += element.clientHeight / 2;
        return false;
      }
      if (top >= box.top && top <= box.top + box.height / 2) {
        return true;
      }
      element.scrollTop += top - box.top - box.height / 4;
      return element.scrollTop === before;
    }, from);
  }, `line ${number} of the diff`);
  assert.ok(line, `the diff shows no line ${number}`);
  return line;
}

export async function openChangedFile(): Promise<void> {
  await page.locator('.commit', { hasText: 'second' }).click();
  await page.locator('.row.file', { hasText: 'changed.txt' }).click();
  await untilDiffLine(
    page,
    ({ change, text }) => change === 'added' && text.includes('2'),
    'the added line of the changed file',
  );
}
