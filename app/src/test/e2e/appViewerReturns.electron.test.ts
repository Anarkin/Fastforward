import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { seenRows, viewerRows } from './cellsSeen';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import {
  comesBackAsLeft,
  comesBackFromEach,
  settledLooks,
  showTab,
  tabs,
  type TabLooks,
} from './tabReturns';

const envText = Array.from({ length: 300 }, (_, index) =>
  index % 30 === 11 ? `NAME_${index}=adam` : `KEY_${index}=value ${index}`,
).join(String.fromCharCode(10));

const otherText = Array.from(
  { length: 50 },
  (_, index) => `other adam ${index}`,
).join(String.fromCharCode(10));

const commanderTab = 0;
const envTab = 1;
const terminalTab = 2;
const otherTab = 3;
const wideTab = 4;
const imageTab = 5;
const markdownTab = 6;

const wideText = Array.from(
  { length: 200 },
  (_, index) => `${index} ${'wide '.repeat(120)}`,
).join(String.fromCharCode(10));

const imageText = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="3000">',
  '<rect width="3000" height="3000" fill="#336"/>',
  '<circle cx="1500" cy="1500" r="1400" fill="#c63"/>',
  '</svg>',
].join('');

const markdownText = Array.from(
  { length: 200 },
  (_, index) => `Paragraph ${index}, adam.${String.fromCharCode(10)}`,
).join(String.fromCharCode(10));

suite('App viewer tabs shown again', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('app-viewer-returns');
    const profile = path.join(folder, 'profile');
    const opened = path.join(folder, 'opened');
    fs.mkdirSync(opened, { recursive: true });
    fs.writeFileSync(path.join(opened, '.env'), envText);
    fs.writeFileSync(path.join(opened, 'other.txt'), otherText);
    fs.writeFileSync(path.join(opened, 'wide.txt'), wideText);
    fs.writeFileSync(path.join(opened, 'image.svg'), imageText);
    fs.writeFileSync(path.join(opened, 'readme.md'), markdownText);
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'commander', root: opened },
          {
            id: '2',
            tool: 'viewer',
            root: path.join(opened, '.env'),
          },
          { id: '3', tool: 'terminal', root: opened },
          {
            id: '4',
            tool: 'viewer',
            root: path.join(opened, 'other.txt'),
          },
          ...['wide.txt', 'image.svg', 'readme.md'].map((name, index) => ({
            id: String(index + 5),
            tool: 'viewer',
            root: path.join(opened, name),
          })),
        ],
        activeTab: '2',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ text: { wordWrap: true } }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await waitFor(async () => (await tabs(page).count()) === 7, 'every tab');
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  const count = () =>
    page.locator('.viewer .search-count').textContent({ timeout: 1000 });
  const currentRow = async () =>
    (await seenRows(page)).find(({ marks }) =>
      marks.some(({ name }) => name === 'current'),
    )?.text ?? null;

  test('brings back a file viewed with its find open, its query, the second match counted, marked and shown, and the caret where it was in the box, from a commander tab, the tab of another tool and the viewer of another file, which shows no find of it', async () => {
    await showTab(page, envTab);
    await page.locator(viewerRows).first().click();
    await page.keyboard.press('ControlOrMeta+F');
    await page.keyboard.type('adam');
    await waitFor(async () => (await count()) === '1 of 10', 'the count').catch(
      async (error: unknown) => {
        throw new Error(`${String(error)}, counting ${await count()}`);
      },
    );
    await page.keyboard.press('Enter');
    await waitFor(
      async () =>
        (await count()) === '2 of 10' &&
        (await currentRow()) === 'NAME_41=adam',
      'the second match shown',
    );
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');

    let settled: TabLooks | undefined;
    for (const away of [commanderTab, terminalTab, otherTab]) {
      settled = await comesBackAsLeft(
        page,
        away,
        `The viewer left for tab ${away}`,
        settled,
      );
      assert.strictEqual(await count(), '2 of 10');
      assert.strictEqual(await currentRow(), 'NAME_41=adam');
      assert.strictEqual(
        await page.locator('.viewer .search-box-input').inputValue(),
        'adam',
      );
      assert.deepStrictEqual(
        await page
          .locator('.viewer .search-box-input')
          .evaluate((box: HTMLInputElement) => [
            document.activeElement === box,
            box.selectionStart,
            box.selectionEnd,
          ]),
        [true, 2, 2],
      );
    }

    await showTab(page, otherTab);
    await settledLooks(page);
    assert.strictEqual(await page.locator('.viewer .search-box').count(), 0);
    assert.strictEqual(await page.locator('.viewer .find-match').count(), 0);

    await showTab(page, envTab);
    await page.keyboard.press('Escape');
    await page.locator('.viewer .search-box').waitFor({ state: 'detached' });
    await comesBackAsLeft(page, otherTab, 'The viewer once its find closed');
    assert.strictEqual(await page.locator('.viewer .search-box').count(), 0);
    assert.strictEqual(await page.locator('.viewer .find-match').count(), 0);
  });

  const throughOthers = async (shown: number, what: string) => {
    await comesBackFromEach(
      page,
      [commanderTab, terminalTab, otherTab],
      (away) => `${what} left for tab ${away}`,
    );
    assert.strictEqual(
      await tabs(page).nth(shown).getAttribute('aria-selected'),
      'true',
    );
  };

  test('brings back a file viewed with its long lines unwrapped, scrolled down and sideways, from every other tab', async () => {
    await showTab(page, wideTab);
    await page.locator(viewerRows).first().click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    await page
      .getByRole('button', { name: 'Wrap Long Lines', pressed: false })
      .waitFor();
    await page
      .locator('.viewer-sideways')
      .evaluate((area) => area.scrollTo({ left: 1234 }));
    await page.keyboard.press('PageDown');
    await throughOthers(wideTab, 'The viewer scrolled sideways');
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
  });

  test('brings back an image viewed at its real size where it was scrolled to, rather than centered again, from every other tab', async () => {
    await showTab(page, imageTab);
    await page.locator('.viewer-preview img').waitFor();
    await page.locator('.viewer-preview').click();
    await page.keyboard.press('f');
    await page.locator('.viewer-image.real-size').waitFor();
    await page
      .locator('.viewer-preview')
      .evaluate((scroller) => scroller.scrollTo({ top: 321, left: 456 }));
    await throughOthers(imageTab, 'The image at its real size');
    await page.keyboard.press('f');
  });

  test('brings back a Markdown preview where it was scrolled to, from every other tab', async () => {
    await showTab(page, markdownTab);
    await page.locator('.markdown p').first().waitFor();
    await page.locator('.viewer-preview').evaluate((scroller) =>
      scroller.scrollTo({
        top: (scroller.scrollHeight - scroller.clientHeight) / 2,
      }),
    );
    await throughOthers(markdownTab, 'The Markdown preview');
  });
});
