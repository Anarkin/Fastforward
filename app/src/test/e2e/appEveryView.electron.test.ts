import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { tempFolder } from '../helpers/tempFolders';
import { tempRepository } from '../helpers/repositories';
import { closeOrKill, launchApp } from './appLaunch';
import { cellsOf } from './cellsSeen';
import { inkSeen, type Box } from './inkAlike';
import { diffTexts } from './diffSeen';
import { untilSettled } from './waits';
import { strings } from '../../lib/shared/strings';
import { byteText, hexPairs } from '../../tools/viewer/shared/byteText';
import { commitRow } from './commitRows';

const escape = String.fromCharCode(0x1b);

const lines = [
  'alpha beta  gamma',
  `beta alpha${escape} delta`,
  'gamma delta alpha',
];

const escapeAt = lines[0].length + 1 + lines[1].indexOf(escape);

const hexCharacters = 62;

const fainter = 0.75;

const encodedLines = ['naïve café', 'second line'];

const encodedChange = 'third ü';

const encoded = {
  wide: {
    bytes: (text: string) =>
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]),
    tabs: 7,
    label: 'UTF-16 LE',
  },
  latin: {
    bytes: (text: string) => Buffer.from(text, 'latin1'),
    tabs: 10,
    label: '1252',
  },
} as const;

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
    const encodedTabs = Object.entries(encoded).flatMap(
      ([name, { bytes, tabs }]) => {
        const file = path.join(opened, `${name}.txt`);
        const changedFile = path.join(opened, `${name}-changed.txt`);
        fs.writeFileSync(file, bytes(`${encodedLines.join('\n')}\n`));
        fs.writeFileSync(
          changedFile,
          bytes(`${[...encodedLines, encodedChange].join('\n')}\n`),
        );
        return [
          { id: `${tabs + 1}`, tool: 'viewer', root: file },
          { id: `${tabs + 2}`, tool: 'editor', root: file },
          {
            id: `${tabs + 3}`,
            tool: 'diff',
            compare: { old: file, new: changedFile },
          },
        ];
      },
    );
    const endings = path.join(opened, 'endings.txt');
    const endingsChanged = path.join(opened, 'endings-changed.txt');
    fs.writeFileSync(endings, 'one\r\ntwo\nlone\rthree');
    fs.writeFileSync(endingsChanged, 'one\r\ntwo\nlone\rthree!');
    const endingTabs = [
      { id: '15', tool: 'viewer', root: endings },
      { id: '16', tool: 'editor', root: endings },
      {
        id: '17',
        tool: 'diff',
        compare: { old: endings, new: endingsChanged },
      },
    ];
    const repository = await tempRepository(path.join(folder, 'repository'));
    const committed = async (content: string, message: string) => {
      for (const [name, { bytes }] of Object.entries(encoded)) {
        fs.writeFileSync(
          path.join(repository.root, `${name}.txt`),
          bytes(content),
        );
      }
      await repository.git('add', '.');
      await repository.git('commit', '-m', message);
    };
    await committed(`${encodedLines.join('\n')}\n`, 'first');
    await committed(
      `${[...encodedLines, encodedChange].join('\n')}\n`,
      'second',
    );
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
          ...encodedTabs,
          { id: '14', tool: 'git', root: repository.root },
          ...endingTabs,
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

  const clipboard = () =>
    app.evaluate(({ clipboard: board }) => board.readText());

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
      async () => (await drawn.glyphs(strings.symbols.invisible)).length > 0,
      'the escape drawn',
    );
    await page.mouse.move(2, 2);
    const row = (await drawn.rows())[view.escape.row];
    assert.ok(row);
    const png = await page.screenshot();
    const taken = await app.evaluate(({ nativeImage }, shot) => {
      const image = nativeImage.createFromBuffer(Buffer.from(shot, 'base64'));
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

  test('draws the sign of a control character in the muted color of the signs of whitespace in every view, the viewer, the editor, the diff, a block of Markdown code, Hex and the bytes, fainter than the letter before it, rather than in the color of the text around it', async () => {
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

  const firstRow = async (cells: string) => {
    const drawn = cellsOf(page, cells);
    await waitFor(
      async () => ((await drawn.rows())[0]?.text ?? '') !== '',
      `the rows of ${cells}`,
    );
    return (await drawn.rows())[0]?.text;
  };

  const readIn = async (tabs: number) => {
    const tab = (at: number) =>
      page
        .locator('.tabs [role="tab"]')
        .nth(tabs + at)
        .click();
    await tab(0);
    const viewer = {
      row: await firstRow('.viewer-rows .cell-rows'),
      encoding: await page
        .locator('.viewer .viewer-encoding .menu-button-label')
        .textContent(),
    };
    await tab(1);
    const editor = {
      row: await firstRow('.editor .editor-cells'),
      encoding: await page
        .locator('.editor .viewer-encoding .menu-button-trigger')
        .first()
        .textContent(),
    };
    await tab(2);
    await waitFor(
      async () => (await diffTexts(page, 'added', '.compare-view')).length > 0,
      'the lines added in the diff',
    );
    const diff = {
      added: await diffTexts(page, 'added', '.compare-view'),
      notes: await page
        .locator('.compare-view .file-header-note')
        .allTextContents(),
    };
    return { viewer, editor, diff };
  };

  const signsIn = async (tab: number, cells: string) => {
    await page.locator('.tabs [role="tab"]').nth(tab).click();
    const drawn = cellsOf(page, cells);
    await waitFor(
      async () => ((await drawn.rows())[0]?.text ?? '').startsWith('one'),
      `the lines of tab ${tab}`,
    );
    return untilSettled(
      async () =>
        Object.fromEntries(
          await Promise.all(
            ['␍', '␊'].map(async (sign) => [
              sign,
              (await drawn.glyphs(sign)).map(({ row, column }) => [
                row,
                column,
              ]),
            ]),
          ),
        ),
      `the signs of tab ${tab}`,
    );
  };

  test('signs the line break that ends each line while whitespace is shown, a carriage return and a line feed in columns of their own, and none after a last line without one, and ends a line at a carriage return alone, in the viewer, the editor and the diff alike, as the line feed went unsigned and the viewer and the diff ran a line on past a carriage return alone', async () => {
    const seen = {
      viewer: await signsIn(14, '.viewer-rows .cell-rows'),
      editor: await signsIn(15, '.editor .editor-cells'),
      diff: await signsIn(16, '.compare-view .diff-cells'),
    };
    const signed = {
      '␍': [
        [0, 3],
        [2, 4],
      ],
      '␊': [
        [0, 4],
        [1, 3],
      ],
    };
    assert.deepStrictEqual(seen, {
      viewer: signed,
      editor: signed,
      diff: signed,
    });
  });

  test('diffs the files of a commit in the encodings every other tool reads them in, in the git tab too, naming the encoding on the header of each, rather than taking a file of UTF-16 for binary and the bytes of a code page for UTF-8', async () => {
    const inGit = '.repository:not(.compare-view)';
    await page.locator('.tabs [role="tab"]').nth(13).click();
    await commitRow(page, 'second').first().click();
    await waitFor(
      async () => (await diffTexts(page, 'added', inGit)).length === 2,
      'the lines added to both files',
    );
    assert.deepStrictEqual(
      {
        added: await diffTexts(page, 'added', inGit),
        notes: await page
          .locator(`${inGit} .file-header-note`)
          .allTextContents(),
      },
      {
        added: [encodedChange, encodedChange],
        notes: ['Read as 1252', 'Read as UTF-16 LE'],
      },
    );
  });

  test('reads a file of UTF-16 and a file of the code page of the system alike in every tool, the viewer and the editor naming the encoding they read it in, and the diff comparing its text and naming the encoding on its header, rather than taking a file of UTF-16 for binary and the bytes of a code page for UTF-8', async () => {
    const seen: Record<string, unknown> = {};
    for (const [name, { tabs }] of Object.entries(encoded)) {
      seen[name] = await readIn(tabs);
    }
    assert.deepStrictEqual(
      seen,
      Object.fromEntries(
        Object.entries(encoded).map(([name, { label }]) => [
          name,
          {
            viewer: { row: encodedLines[0], encoding: label },
            editor: { row: encodedLines[0], encoding: `${label} (read)` },
            diff: { added: [encodedChange], notes: [`Read as ${label}`] },
          },
        ]),
      ),
    );
  });

  test('selects the whole of every view on Mod+A and copies it, the file viewed as text, in hex and as bytes, read whole by the main process rather than from the rows the page holds, the file edited, the side of the diff the keyboard is in and a Markdown preview with the text of its code, which is in no element of the page', async () => {
    const copied: Record<string, string> = {};
    for (const [name, view] of Object.entries(views)) {
      await shown(view);
      if (name === 'diff') {
        const [, side] = await page.locator(view.cells).all();
        await side?.click();
      } else if (name === 'editor') {
        await page.locator('.editor .editor-content').first().focus();
      } else {
        await page.locator('.viewer-body').first().focus();
      }
      await app.evaluate(({ clipboard: board }) => board.writeText(''));
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press('ControlOrMeta+c');
      await waitFor(async () => (await clipboard()) !== '', `${name} copied`);
      copied[name] = await clipboard();
    }
    const text = `${lines.join('\n')}\n`;
    assert.deepStrictEqual(copied, {
      viewer: text,
      editor: text,
      diff: `${text}omega`,
      'Markdown code': lines.join('\n'),
      hex: hexPairs(Buffer.from(text)),
      bytes: byteText(Buffer.from(`${lines.join('\n')}\u0000`)),
    });
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

  test('draws every view again with the device the GPU gives it once the one it had is lost while its window was down, a block of Markdown code too, which kept drawing with the device lost once the new one came before its next frame', async () => {
    const inked: Record<string, boolean> = {};
    for (const [name, view] of Object.entries(views)) {
      await shown(view);
      const area = async (): Promise<Box> => {
        const box = await page
          .locator(`${view.cells} >> visible=true`)
          .first()
          .boundingBox();
        assert.ok(box !== null, name);
        return {
          left: box.x,
          top: box.y,
          width: Math.min(box.width, 200),
          height: Math.min(box.height, 40),
        };
      };
      const inkNow = () =>
        area().then(
          async (box) => (await inkSeen(app, page, box)).inked,
          () => 0,
        );
      const before = await inkNow();
      assert.ok(before > 0, `${name} drawn no ink before its device is lost`);
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.minimize(),
      );
      const lost = await page
        .locator(`${view.cells} >> visible=true`)
        .first()
        .evaluate((host) => {
          const canvas = host.querySelector('canvas');
          const context: unknown = canvas?.getContext('webgpu') ?? null;
          const device =
            context instanceof GPUCanvasContext
              ? context.getConfiguration()?.device
              : undefined;
          device?.destroy();
          return device !== undefined;
        });
      assert.ok(lost, `${name} has no device to lose`);
      await waitFor(
        () => page.evaluate(() => navigator.gpu.requestAdapter().then(Boolean)),
        'a GPU to ask again',
      );
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.restore(),
      );
      inked[name] = await waitFor(
        async () => (await inkNow()) >= before * 0.9,
        `${name} drawn again`,
      ).then(
        () => true,
        () => false,
      );
    }
    assert.deepStrictEqual(
      inked,
      Object.fromEntries(Object.keys(views).map((name) => [name, true])),
    );
  });
});
