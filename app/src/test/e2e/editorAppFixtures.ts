import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { closeOrKill, launchApp } from './appLaunch';
import { waitFor } from '../helpers/fixtures';
import { removeFolder, tempFolder } from '../helpers/tempFolders';

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
const rowIndexOf = (name: string) =>
  right()
    .locator('.commander-row')
    .evaluateAll(
      (rows, wanted) =>
        rows.findIndex((row) => {
          const base = row.querySelector('.commander-name')?.textContent ?? '';
          const extension =
            row.querySelector('.commander-extension')?.textContent ?? '';
          return (extension === '' ? base : `${base}.${extension}`) === wanted;
        }),
      name,
    );
const selectedIndex = () =>
  right()
    .locator('.commander-row')
    .evaluateAll((rows) =>
      rows.findIndex((row) => row.classList.contains('selected')),
    );
export const select = async (name: string) => {
  await waitFor(async () => (await rowIndexOf(name)) !== -1, `${name} listed`);
  await right()
    .locator('.commander-row')
    .nth(await rowIndexOf(name))
    .click();
  await waitFor(
    async () => (await rowIndexOf(name)) === (await selectedIndex()),
    `${name} to be selected`,
  );
};
export const backToCommander = async () => {
  await page.locator('.tabs [role="tab"]').first().click();
  await right().locator('.commander-row').first().waitFor();
};
export const written = (name: string, text: string | Buffer) =>
  fs.writeFileSync(path.join(opened, name), text);
const shownPath = (tool: 'viewer' | 'editor') =>
  page.locator(`.${tool} .viewer-path`).first().textContent();
const showsPathOf = async (tool: 'viewer' | 'editor', name: string) =>
  (await shownPath(tool))?.endsWith(name) === true;
export const edit = async (name: string) => {
  await select(name);
  await page.keyboard.press('F4');
  await content().waitFor();
  await waitFor(
    () => showsPathOf('editor', `${path.sep}${name}`),
    `the editor to name ${name}`,
  );
};
export const backAndEdit = async (name: string) => {
  await backToCommander();
  await edit(name);
};
export const textShown = async (text: string, what: string) => {
  await waitFor(async () => (await editedText()) === text, what, 5000).catch(
    async (error: unknown) => {
      throw new Error(
        `${String(error)}, showing ${JSON.stringify(await editedText())}`,
      );
    },
  );
};
export const tabCount = () => page.locator('.tabs [role="tab"]').count();
export const closeShownTab = async () => {
  const count = await tabCount();
  await page.keyboard.press('Escape');
  await waitFor(async () => (await tabCount()) === count - 1, 'the tab closed');
};
const viewerText = () =>
  page
    .locator('.viewer .viewer-rows .viewer-row')
    .evaluateAll((rows) => rows.map((row) => row.textContent ?? '').join('\n'));
export const backAndView = async (name: string) => {
  await backToCommander();
  await select(name);
  await page.keyboard.press('F3');
  await page.locator('.viewer').waitFor();
};
export const shownInViewer = async (name: string, text: string) => {
  const lines = text.replace(/\n$/, '');
  await waitFor(
    async () =>
      (await showsPathOf('viewer', `${path.sep}${name}`)) &&
      (await viewerText()) === lines,
    `the viewer to show ${name}`,
    5000,
  ).catch(async (error: unknown) => {
    throw new Error(
      `${String(error)}, showing ${JSON.stringify(await viewerText())} of ${JSON.stringify(await shownPath('viewer'))}`,
    );
  });
};
export const activeTabName = () =>
  page.locator('.tabs .tab.active .tab-name').textContent();
export const toTabNamed = async (name: string) => {
  await page.locator('.tabs .tab', { hasText: name }).first().click();
  await waitFor(async () => (await activeTabName()) === name, `${name} shown`);
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
