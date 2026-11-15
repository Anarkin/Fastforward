import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { closeOrKill, launchApp } from './appLaunch';
import { waitFor } from '../helpers/fixtures';
import { removeFolder, tempFolder } from '../helpers/repositories';

let folder: string;
export let opened: string;
export let profile: string;
let app: ElectronApplication;
export let page: Page;

export const right = () => page.locator('.commander-pane').nth(1);
export const content = () => page.locator('.editor .cm-content');
export const activeTab = () => page.locator('.tabs .tab.active');
export const editedText = () =>
  content().evaluate((element) =>
    Array.from(
      element.querySelectorAll('.cm-line'),
      (line) => line.textContent ?? '',
    ).join('\n'),
  );
export const select = async (file: string) => {
  const name = file.replace(/\.[^.]*$/, '');
  await right().locator('.commander-row', { hasText: name }).first().click();
  await waitFor(
    async () =>
      (
        await right().locator('.commander-row.selected').textContent()
      )?.includes(name) === true,
    `${name} to be selected`,
  );
};
export const backToCommander = async () => {
  await page.locator('.tabs [role="tab"]').first().click();
  await right().locator('.commander-row').first().waitFor();
};
export const edit = async (name: string) => {
  await select(name);
  await page.keyboard.press('F4');
  await content().waitFor();
};
export const toStart = () =>
  content()
    .locator('.cm-line')
    .first()
    .click({ position: { x: 0, y: 2 } });
export const toEnd = async () => {
  await content().locator('.cm-line').last().click();
  await page.keyboard.press('End');
};
export const activeIndex = () =>
  page
    .locator('.tabs [role="tab"]')
    .evaluateAll((tabs) =>
      tabs.findIndex((tab) => tab.classList.contains('active')),
    );
export const topLine = () =>
  page.locator('.editor .cm-scroller').evaluate((scroller) => {
    const top = scroller.getBoundingClientRect().top;
    return (
      Array.from(scroller.querySelectorAll('.cm-line')).find(
        (line) => line.getBoundingClientRect().bottom > top + 1,
      )?.textContent ?? ''
    );
  });
export const scrolledDown = async (rows: number) => {
  await page.locator('.editor .cm-scroller').evaluate((scroller, by) => {
    const row =
      scroller.querySelector('.cm-line')?.getBoundingClientRect().height ?? 1;
    scroller.scrollTop = row * by;
  }, rows);
  let shown = '';
  await waitFor(async () => {
    const was = shown;
    shown = await topLine();
    await new Promise((resolve) => setTimeout(resolve, 200));
    return (
      shown === was &&
      shown !== '' &&
      shown !== (await editedText()).split('\n')[0]
    );
  }, 'the text to stop scrolling');
  return shown;
};
export const notices = () => page.locator('.notice').allTextContents();
const closeNotices = async () => {
  const close = page.locator('.notice-close').first();
  while ((await close.count()) > 0) {
    await close.click({ timeout: 1000 }).catch(() => undefined);
  }
};

export function sharedEditorApp(): void {
  beforeAll(async () => {
    folder = tempFolder('app-editor');
    profile = path.join(folder, 'profile');
    opened = path.join(folder, 'opened');
    fs.mkdirSync(path.join(opened, 'folder'), { recursive: true });
    fs.writeFileSync(path.join(opened, 'notes.txt'), 'one\r\ntwo\r\n');
    fs.writeFileSync(
      path.join(opened, 'mixed.txt'),
      Buffer.from('caf\xe9\nline\r\nend', 'latin1'),
    );
    fs.writeFileSync(path.join(opened, 'image.bin'), Buffer.alloc(64));
    fs.writeFileSync(
      path.join(opened, 'code.ts'),
      'const a = 1;\nlet b = 2;\n',
    );
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

  beforeEach(async () => {
    await closeNotices();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });
}
