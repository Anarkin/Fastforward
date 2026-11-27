import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { showTab } from './tabReturns';
import { untilSettled } from './waits';

suite('App canvas content', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  const seenBoard = () =>
    page
      .locator('.board-host')
      .evaluate((element: HTMLElement) => element.seenBoard?.());

  const kindsOf = async (words: string) =>
    (await seenBoard())?.pieces
      .find(({ kinds }) => kinds.map(([text]) => text).join('') === words)
      ?.kinds.map(([, kind]) => kind)
      .filter((kind) => kind !== '');

  const pointAt = async (cell: { column: number; row: number }) => {
    const seen = await seenBoard();
    const box = await page.locator('.board-host').boundingBox();
    const ratio = await page.evaluate(() => devicePixelRatio);
    assert.ok(seen !== undefined && box !== null);
    return {
      x:
        box.x +
        (cell.column - seen.origin.column + 0.5) * (seen.advance / ratio),
      y: box.y + (cell.row - seen.origin.row + 0.5) * (seen.rowHeight / ratio),
    };
  };

  beforeAll(async () => {
    folder = tempFolder('app-canvas-content');
    const profile = path.join(folder, 'profile');
    fs.mkdirSync(profile);
    const board = path.join(folder, 'notes.canvas');
    fs.writeFileSync(path.join(folder, 'note.md'), '# Note\nbody\n');
    fs.writeFileSync(
      board,
      JSON.stringify({
        nodes: [
          {
            id: 'marked',
            type: 'text',
            text: 'plain words\n# Heading',
            x: 0,
            y: 0,
            width: 210,
            height: 72,
          },
          {
            id: 'linked',
            type: 'link',
            url: 'https://example.invalid/linked',
            x: 0,
            y: 108,
            width: 210,
            height: 72,
          },
          {
            id: 'filed',
            type: 'file',
            file: 'note.md',
            x: 0,
            y: 216,
            width: 210,
            height: 72,
          },
          ...['from', 'to'].map((id, at) => ({
            id,
            type: 'text',
            text: id,
            x: 420 + at * 280,
            y: 0,
            width: 70,
            height: 54,
          })),
          {
            id: 'other',
            type: 'text',
            text: 'other',
            x: 700,
            y: 180,
            width: 70,
            height: 54,
          },
        ],
        edges: [
          {
            id: 'wired',
            fromNode: 'from',
            fromSide: 'right',
            toNode: 'to',
            toSide: 'left',
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'commander', root: folder },
          { id: '2', tool: 'canvas', root: board },
        ],
        activeTab: '2',
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  test('colors the text of a text node as Markdown, as the viewer colors a Markdown file, a heading in the colors of the theme and plain words in none', async () => {
    await page.locator('.board-host canvas').first().waitFor();
    await untilSettled(
      async () => JSON.stringify(await kindsOf('# Heading')),
      'the heading colored',
      { accepted: (kinds) => kinds !== undefined && kinds !== '[]' },
    );
    assert.deepStrictEqual(await kindsOf('plain words'), []);
  });

  test('draws a link node as its URL in the color of a link, and opens it outside the app on Enter once selected and on a double click', async () => {
    await page.locator('.board-host canvas').first().waitFor();
    await untilSettled(
      async () =>
        JSON.stringify(await kindsOf('https://example.invalid/linked')),
      'the link drawn',
      { accepted: (kinds) => kinds === JSON.stringify(['link']) },
    );
    await app.evaluate(({ shell }) => {
      const opened: string[] = [];
      Reflect.set(globalThis, 'openedLinks', opened);
      shell.openExternal = (url: string) => {
        opened.push(url);
        return Promise.resolve();
      };
    });
    const opened = () =>
      app.evaluate(() =>
        JSON.stringify(Reflect.get(globalThis, 'openedLinks')),
      );
    const inside = await pointAt({ column: 4, row: 7 });
    await page.mouse.click(inside.x, inside.y);
    await page.keyboard.press('Enter');
    await untilSettled(opened, 'the link opened on Enter', {
      accepted: (urls) =>
        urls === JSON.stringify(['https://example.invalid/linked']),
    });
    await page.mouse.dblclick(inside.x, inside.y);
    await untilSettled(opened, 'the link opened on a double click', {
      accepted: (urls) =>
        urls ===
        JSON.stringify([
          'https://example.invalid/linked',
          'https://example.invalid/linked',
        ]),
    });
  });

  test('draws a file node as its path over the head of its text, colored as the language of its name, and opens the file in a viewer tab on Enter once selected', async () => {
    await untilSettled(
      async () =>
        JSON.stringify([await kindsOf('note.md'), await kindsOf('# Note')]),
      'the file drawn',
      {
        accepted: (kinds) => {
          const [shownPath, heading]: unknown[] = JSON.parse(kinds);
          return (
            JSON.stringify(shownPath) === JSON.stringify(['link']) &&
            Array.isArray(heading) &&
            heading.length > 0
          );
        },
      },
    );
    const inside = await pointAt({ column: 4, row: 13 });
    await page.mouse.click(inside.x, inside.y);
    await page.keyboard.press('Enter');
    await page
      .locator('.tabs .tab.active .tab-name', { hasText: 'note.md' })
      .waitFor();
  });

  test('labels an edge selected on Enter, typing its label halfway along it, ends it on Enter and writes the label into the edge in its file', async () => {
    await showTab(page, 1);
    await page.locator('.board-host canvas').first().waitFor();
    const middle = await pointAt({ column: 85, row: 1 });
    await page.mouse.click(middle.x, middle.y);
    await page.keyboard.press('Enter');
    await page.keyboard.type('uses');
    await page.keyboard.press('Enter');
    await untilSettled(
      async () =>
        (await seenBoard())?.rows.some((row) => /[─═] uses [─═]/.test(row)) ??
        false,
      'the label of the edge drawn',
      { accepted: (drawn) => drawn },
    );
    await page.keyboard.press('ControlOrMeta+S');
    await untilSettled(
      () =>
        Promise.resolve(
          fs.readFileSync(path.join(folder, 'notes.canvas'), 'utf8'),
        ),
      'the label of the edge saved',
      { accepted: (text) => /"id":"wired"[^}]*"label":"uses"/.test(text) },
    );
  });

  test('moves the end of the edge selected dragged onto another node to the side of it nearest the pointer, writing it into the edge in its file', async () => {
    const end = await pointAt({ column: 99, row: 1 });
    const onto = await pointAt({ column: 104, row: 10 });
    await page.mouse.move(end.x, end.y);
    await page.mouse.down();
    await page.mouse.move(onto.x, onto.y, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.press('ControlOrMeta+S');
    await untilSettled(
      () =>
        Promise.resolve(
          fs.readFileSync(path.join(folder, 'notes.canvas'), 'utf8'),
        ),
      'the end of the edge moved and saved',
      {
        accepted: (text) =>
          /"id":"wired"[^}]*"toNode":"other","toSide":"top"/.test(text),
      },
    );
  });

  test('places a file dropped on the canvas as a file node where it fell, by its path from the folder of the canvas, writing it into its file once saved', async () => {
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.id = 'dropped-files';
      input.hidden = true;
      document.body.append(input);
    });
    await page.setInputFiles('#dropped-files', [path.join(folder, 'note.md')]);
    const at = await pointAt({ column: 40, row: 20 });
    await page.evaluate(({ x, y }) => {
      const data = new DataTransfer();
      for (const file of document.querySelector<HTMLInputElement>(
        '#dropped-files',
      )?.files ?? []) {
        data.items.add(file);
      }
      const body = document.querySelector('.board-body');
      for (const type of ['dragenter', 'dragover', 'drop']) {
        body?.dispatchEvent(
          new DragEvent(type, {
            dataTransfer: data,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          }),
        );
      }
    }, at);
    await page.keyboard.press('ControlOrMeta+S');
    await untilSettled(
      () =>
        Promise.resolve(
          fs.readFileSync(path.join(folder, 'notes.canvas'), 'utf8'),
        ),
      'the file dropped placed and saved',
      {
        accepted: (text) =>
          (text.match(/"type":"file","file":"note\.md"/g) ?? []).length === 2,
      },
    );
  });

  test('places a link node of a URL pasted on the canvas, writing it into its file once saved', async () => {
    await app.evaluate(({ clipboard }) =>
      clipboard.writeText('https://example.invalid/pasted'),
    );
    const empty = await pointAt({ column: 60, row: 25 });
    await page.mouse.click(empty.x, empty.y);
    await page.keyboard.press('ControlOrMeta+V');
    await page.keyboard.press('ControlOrMeta+S');
    await untilSettled(
      () =>
        Promise.resolve(
          fs.readFileSync(path.join(folder, 'notes.canvas'), 'utf8'),
        ),
      'the link pasted placed and saved',
      {
        accepted: (text) =>
          text.includes('"type":"link","url":"https://example.invalid/pasted"'),
      },
    );
  });

  test('makes a new canvas named on Shift+F4 in the commander, empty in a canvas tab of its own, writing its file once it is saved', async () => {
    const fresh = path.join(folder, 'fresh.canvas');
    await showTab(page, 0);
    await page.locator('.commander-pane').last().click();
    await page.keyboard.press('Shift+F4');
    const prompt = page.locator('.prompt-input');
    await prompt.waitFor();
    await prompt.fill('fresh.canvas');
    await prompt.press('Enter');
    await page
      .locator('.tabs .tab.active .tab-name', { hasText: 'fresh.canvas' })
      .waitFor();
    await page.locator('.board-host canvas').first().waitFor();
    assert.strictEqual(fs.existsSync(fresh), false);
    await page.keyboard.press('ControlOrMeta+S');
    await untilSettled(
      () => Promise.resolve(fs.existsSync(fresh)),
      'the new canvas written',
      { accepted: (written) => written },
    );
    assert.strictEqual(fs.readFileSync(fresh, 'utf8'), '{}');
  });
});
