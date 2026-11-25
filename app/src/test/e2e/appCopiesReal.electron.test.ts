import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { cellsOf } from './cellsSeen';

const character = (code: number) => String.fromCharCode(code);
const bell = character(7);
const formFeed = character(12);
const tab = character(9);
const zeroWidth = '​';
const noBreak = ' ';
const leftToRight = '‎';

const written =
  `a b${tab}c\r\n` +
  `controls ${bell}${formFeed}|\n` +
  `invisible ${zeroWidth}${noBreak}${leftToRight}|\n` +
  `wide 中 😀 👍🏽 é\n` +
  `long ${'word '.repeat(40)}\n` +
  'lone\r' +
  'end';

const prose = `A bell ${bell} rings, fed${formFeed}on.`;
const code = `code ${bell}${tab}x`;
const markdown = `${prose}\n\n\`\`\`\n${code}\n\`\`\`\n`;

const legible = (text: string) =>
  text.replace(
    /[^ -~]/g,
    (each) => `<${each.codePointAt(0)?.toString(16) ?? ''}>`,
  );

suite('App copies what a file holds', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('copies-real');
    const profile = path.join(folder, 'profile');
    const opened = path.join(folder, 'opened');
    fs.mkdirSync(opened, { recursive: true });
    fs.mkdirSync(profile, { recursive: true });
    const file = path.join(opened, 'signs.txt');
    const older = path.join(opened, 'signs-old.txt');
    const document = path.join(opened, 'signs.md');
    fs.writeFileSync(file, written);
    fs.writeFileSync(older, written.replace(/end$/, 'END'));
    fs.writeFileSync(document, markdown);
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'viewer', root: file },
          { id: '2', tool: 'editor', root: file },
          { id: '3', tool: 'diff', compare: { old: older, new: file } },
          { id: '4', tool: 'viewer', root: document },
        ],
        activeTab: '1',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({
        scrolling: { smooth: false },
        text: {
          showWhitespace: true,
          wordWrap: true,
          highlightOccurrences: false,
        },
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
  });

  afterAll(async () => {
    await closeOrKill(app);
    removeFolder(folder);
  });

  const clipboard = () =>
    app.evaluate(({ clipboard: board }) => board.readText());

  const cleared = () =>
    app.evaluate(({ clipboard: board }) => board.writeText(''));

  const showTab = async (index: number, rows: string) => {
    await page.locator('.tabs [role="tab"]').nth(index).click();
    await waitFor(
      async () => (await cellsOf(page, rows).rows()).length > 0,
      `the rows of tab ${index}`,
    );
  };

  const copiedBy = async (name: string, select: () => Promise<void>) => {
    await cleared();
    await select();
    await page.keyboard.press('ControlOrMeta+c');
    await waitFor(async () => (await clipboard()) !== '', `${name} copied`);
    return legible(await clipboard());
  };

  test('puts on the clipboard the characters the file holds, never the signs drawn for them, its spaces, tab, control and invisible characters, its line endings as they are, CRLF, LF and a carriage return alone, and a wrapped line as one line, from the viewer, a selection in it, the editor, the diff and the prose and code of a Markdown preview', async () => {
    const copied: Record<string, string> = {};
    const viewerRows = '.viewer-rows .cell-rows';

    await showTab(0, viewerRows);
    copied['viewer, all'] = await copiedBy('the viewer', async () => {
      await page.locator('.viewer-body').first().focus();
      await page.keyboard.press('ControlOrMeta+a');
    });

    copied['viewer, selected'] = await copiedBy(
      'a selection in the viewer',
      async () => {
        const cells = cellsOf(page, viewerRows);
        const rows = await cells.rows();
        const start = await cells.point(0, 0);
        const end = await cells.point(rows.length - 1, 12);
        await page.mouse.move(start.x - 2, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 6 });
        await page.mouse.up();
      },
    );

    await showTab(1, '.editor .editor-cells');
    copied.editor = await copiedBy('the editor', async () => {
      await page.locator('.editor .editor-content').first().focus();
      await page.keyboard.press('ControlOrMeta+a');
    });

    await showTab(2, '.compare-view .diff-cells');
    copied['diff, new side'] = await copiedBy('the diff', async () => {
      const [, side] = await page.locator('.compare-view .diff-cells').all();
      await side?.click();
      await page.keyboard.press('ControlOrMeta+a');
    });

    await page.locator('.tabs [role="tab"]').nth(3).click();
    await waitFor(
      async () =>
        (await cellsOf(page, '.markdown pre > code .cell-rows').rows()).length >
        0,
      'the code block drawn',
    );
    copied['Markdown, prose and code'] = await copiedBy(
      'the Markdown preview',
      async () => {
        await page.locator('.viewer-body').first().focus();
        await page.keyboard.press('ControlOrMeta+a');
      },
    );

    assert.deepStrictEqual(copied, {
      'viewer, all': legible(written),
      'viewer, selected': legible(written),
      editor: legible(written),
      'diff, new side': legible(written),
      'Markdown, prose and code': legible(`${prose}\n\n${code}`),
    });
  });
});
