import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { cellsOf } from './cellsSeen';
import { untilSettled } from './waits';

const escape = String.fromCharCode(0x1b);

const lines = [
  'alpha beta  gamma',
  `beta alpha${escape} delta`,
  'gamma delta alpha',
];

const escapeAt = lines[0].length + 1 + lines[1].indexOf(escape);

const hexCharacters = 62;

const fainter = 0.75;

interface View {
  readonly tab: number;
  readonly cells: string;
  readonly hex?: true;
  readonly copies: readonly string[];
  readonly escape: { readonly row: number; readonly column: number };
}

const inText = { row: 1, column: lines[1].indexOf(escape) };

const views: Readonly<Record<string, View>> = {
  viewer: {
    tab: 1,
    cells: '.viewer-rows .cell-rows',
    copies: [' '],
    escape: inText,
  },
  editor: {
    tab: 2,
    cells: '.editor .editor-cells',
    copies: [' '],
    escape: inText,
  },
  diff: {
    tab: 3,
    cells: '.compare-view .diff-cells',
    copies: [' '],
    escape: inText,
  },
  'Markdown code': {
    tab: 4,
    cells: '.markdown pre > code .cell-rows',
    copies: [' '],
    escape: inText,
  },
  hex: {
    tab: 5,
    cells: '.viewer-rows .cell-rows',
    hex: true,
    copies: ['20', ' '],
    escape: { row: 1, column: hexCharacters + (escapeAt % 16) },
  },
  bytes: {
    tab: 6,
    cells: '.viewer-rows .cell-rows',
    copies: [' '],
    escape: { row: 0, column: escapeAt },
  },
};

suite('App, every view alike', () => {
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    const folder = tempFolder('every-view');
    const profile = path.join(folder, 'profile');
    const opened = path.join(folder, 'opened');
    fs.mkdirSync(opened, { recursive: true });
    fs.mkdirSync(profile, { recursive: true });
    const text = path.join(opened, 'alike.txt');
    const changed = path.join(opened, 'changed.txt');
    const markdown = path.join(opened, 'alike.md');
    const binary = path.join(opened, 'alike.bin');
    fs.writeFileSync(text, `${lines.join('\n')}\n`);
    fs.writeFileSync(changed, `${lines.join('\n')}\nomega\n`);
    fs.writeFileSync(markdown, ['```', ...lines, '```', ''].join('\n'));
    fs.writeFileSync(binary, `${lines.join('\n')}\u0000`);
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'commander', root: opened },
          { id: '2', tool: 'viewer', root: text },
          { id: '3', tool: 'editor', root: text },
          { id: '4', tool: 'diff', compare: { old: text, new: changed } },
          { id: '5', tool: 'viewer', root: markdown },
          { id: '6', tool: 'viewer', root: text },
          { id: '7', tool: 'viewer', root: binary },
        ],
        activeTab: '2',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({
        scrolling: { smooth: false },
        text: { highlightOccurrences: true, wordWrap: false },
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
  });

  afterAll(async () => {
    await closeOrKill(app);
  });

  const shown = async ({ tab, cells, hex }: View) => {
    await page.locator('.tabs [role="tab"]').nth(tab).click();
    const drawn = cellsOf(page, cells);
    await waitFor(
      async () => ((await drawn.rows())[0]?.text ?? '') !== '',
      `the rows of tab ${tab}`,
    );
    if (hex === true) {
      await page.locator('.viewer-body').first().focus();
      await page.keyboard.press('1');
      await waitFor(
        async () => ((await drawn.rows())[0]?.text ?? '').startsWith('0000'),
        'the rows in hex',
      );
    }
    return drawn;
  };

  const selectSpace = async (view: View) => {
    const drawn = await shown(view);
    const [first] = await drawn.rows();
    assert.ok(first);
    const column =
      (view.hex === true ? hexCharacters : 0) + lines[0].indexOf(' ');
    const at = (cell: number) =>
      first.left + (cell - first.column + 0.2) * first.advance;
    const y = first.top + first.height / 2;
    await page.mouse.move(at(column), y);
    await page.mouse.down();
    await page.mouse.move(at(column + 1), y, { steps: 3 });
    await page.mouse.up();
    return drawn;
  };

  const markedCopies = async (view: View) => {
    const drawn = await selectSpace(view);
    const copies = await untilSettled(
      async () =>
        (await drawn.rows()).flatMap(({ text, marks }) =>
          marks
            .filter(({ name }) => name === 'occurrence')
            .map(({ from, to }) => text.slice(from, to)),
        ),
      'the copies of the space selected marked',
      { accepted: (found) => found.length > 1 },
    );
    return { copies: [...new Set(copies)].toSorted(), many: copies.length > 2 };
  };

  const inkAt = async (view: View) => {
    const drawn = await shown(view);
    await waitFor(
      async () =>
        (await drawn.glyphs(String.fromCharCode(0x241b))).length > 0 ||
        (await drawn.glyphs(escape)).length > 0,
      'the escape drawn',
    );
    await page.mouse.move(2, 2);
    const row = (await drawn.rows())[view.escape.row];
    assert.ok(row);
    const png = await page.screenshot();
    const taken = await app.evaluate(({ nativeImage }, encoded) => {
      const image = nativeImage.createFromBuffer(
        Buffer.from(encoded, 'base64'),
      );
      return {
        width: image.getSize().width,
        pixels: image.toBitmap().toString('base64'),
      };
    }, png.toString('base64'));
    const pixels = Buffer.from(taken.pixels, 'base64');
    const ratio = taken.width / (await page.evaluate(() => innerWidth));
    const pixelAt = (x: number, y: number) => {
      const at =
        (Math.round(y * ratio) * taken.width + Math.round(x * ratio)) * 4;
      return [pixels[at] ?? 0, pixels[at + 1] ?? 0, pixels[at + 2] ?? 0];
    };
    const ground = pixelAt(
      row.left + (row.text.length + 3 - row.column) * row.advance,
      row.top + row.height / 2,
    );
    const inkOf = (column: number) => {
      let most = 0;
      const left = row.left + (column - row.column) * row.advance;
      for (let x = left; x < left + row.advance; x += 1 / ratio) {
        for (let y = row.top; y < row.top + row.height; y += 1 / ratio) {
          const pixel = pixelAt(x, y);
          most = Math.max(
            most,
            pixel.reduce(
              (sum, value, at) => sum + Math.abs(value - (ground[at] ?? 0)),
              0,
            ),
          );
        }
      }
      return most;
    };
    return {
      escape: inkOf(view.escape.column),
      letter: inkOf(view.escape.column - 1),
    };
  };

  test('draws the picture of a control character in the muted color of the signs of whitespace in every view, the viewer, the editor, the diff, a block of Markdown code, Hex and the bytes, fainter than the letter before it, rather than in the color of the text around it', async () => {
    const seen: Record<string, string> = {};
    for (const [name, view] of Object.entries(views)) {
      const { escape: faint, letter } = await inkAt(view);
      seen[name] =
        faint > 0 && faint < letter * fainter
          ? 'muted'
          : `${faint} against ${letter}`;
    }
    assert.deepStrictEqual(
      seen,
      Object.fromEntries(Object.keys(views).map((name) => [name, 'muted'])),
    );
  });

  test('marks the other copies of a space selected alone in every view, the viewer, the editor, the diff, a block of Markdown code, Hex and the bytes, as of any text selected, rather than nothing in the views of text', async () => {
    const seen: Record<string, unknown> = {};
    for (const [name, view] of Object.entries(views)) {
      seen[name] = await markedCopies(view);
    }
    assert.deepStrictEqual(
      seen,
      Object.fromEntries(
        Object.entries(views).map(([name, { copies }]) => [
          name,
          { copies: [...copies].toSorted(), many: true },
        ]),
      ),
    );
  });
});
