import * as assert from 'node:assert';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import {
  cellPoint,
  cellsOf,
  copied,
  dragOver,
  keepCopied,
  seenMarked,
  seenRows,
  seenSelected,
} from './cellsSeen';
import { writeSettings } from './settingsWritten';
import { untilSettled, waitForFocus } from './waits';

const lines = [
  '// the cursor of the editor stands in this line',
  "import { useMemo } from 'react';",
  '',
  '// a comment with a tab\tin it and  two spaces',
  'export function sized(count: number): string {',
  "\tconst label = count > 9000 ? 'many' : `few ${count}`;",
  "  return ['画鼻唏埒', '한국어', 'ｆｕｌｌ'].join(label) + 42;",
  '}',
  "const controls = 'a\u0001b\u000bc\u001bd\u007f';",
  `const long = '${'word '.repeat(60)}';`,
  ...Array.from(
    { length: 80 },
    (_, line) => `const value${line} = ${line} * 2; // line ${line}`,
  ),
];

const longLines = Array.from(
  { length: 1000 },
  (_, line) => `const total = compute(total, value${line}); // line ${line}`,
);

const edgeLevels = 16;

const mostUnlike = 0.01;

const leastInk = 2000;

const halfUp = 0.01;

const comparedRows = 14;

const comparedWidth = 560;

interface Seen {
  readonly brightness: Float32Array;
  readonly inked: number;
  readonly hash: string;
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface From {
  readonly left: number;
  readonly top: number;
  readonly row: number;
}

function blurredBrightness(
  pixels: Buffer,
  width: number,
  box: Box,
): Float32Array {
  const plain = new Float32Array(box.width * box.height);
  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      const at = ((box.top + y) * width + box.left + x) * 4;
      plain[y * box.width + x] =
        (pixels[at] + pixels[at + 1] + pixels[at + 2]) / 3;
    }
  }
  const blurred = new Float32Array(plain.length);
  for (let y = 0; y < box.height; y++) {
    for (let x = 1; x < box.width - 1; x++) {
      const at = y * box.width + x;
      blurred[at] = (plain[at - 1] + plain[at] + plain[at + 1]) / 3;
    }
  }
  return blurred;
}

function groundOf(brightness: Float32Array): number {
  const counts = new Map<number, number>();
  for (const value of brightness) {
    const level = Math.round(value);
    counts.set(level, (counts.get(level) ?? 0) + 1);
  }
  return [...counts].toSorted((one, other) => other[1] - one[1])[0]?.[0] ?? 0;
}

function inkedIn(brightness: Float32Array): number {
  const ground = groundOf(brightness);
  return brightness.filter((value) => Math.abs(value - ground) > edgeLevels)
    .length;
}

function unlikeShare(one: Seen, other: Seen): number {
  let unlike = 0;
  for (let at = 0; at < one.brightness.length; at++) {
    if (Math.abs(one.brightness[at] - other.brightness[at]) > edgeLevels) {
      unlike++;
    }
  }
  return unlike / Math.max(1, one.inked);
}

suite('App viewer drawn as cells', () => {
  let app: ElectronApplication;
  let page: Page;
  let profile: string;

  const editorRows = () => cellsOf(page, '.editor .editor-cells').rows();

  const show = async (tool: 'viewer' | 'editor') => {
    await page
      .locator('.tabs .tab')
      .nth(tool === 'viewer' ? 0 : 1)
      .click();
    if (tool === 'viewer') {
      await page
        .locator('.viewer-rows .cell-rows[data-rows][data-colored]:has(canvas)')
        .first()
        .waitFor({ state: 'attached', timeout: 30_000 });
      return;
    }
    await waitFor(
      async () =>
        (await editorRows()).some(({ pieces }) =>
          pieces.some(({ kind }) => kind !== 'plain'),
        ),
      'the code of the editor colored',
    );
  };

  const firstCompared = 1;

  const viewedFrom = async (): Promise<From> => {
    const row = (await seenRows(page))[firstCompared];
    assert.ok(row, 'the viewer draws no row to compare from');
    return {
      left: row.left - row.column * row.advance,
      top: row.top,
      row: row.height,
    };
  };

  const editedFrom = async (): Promise<From> => {
    const row = (await editorRows())[firstCompared];
    assert.ok(row, 'the editor draws no row to compare from');
    return {
      left: row.left - row.column * row.advance,
      top: row.top,
      row: row.height,
    };
  };

  const shot = async (from: From): Promise<Seen> => {
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
    const ratio = taken.width / (await page.evaluate(() => innerWidth));
    const brightness = blurredBrightness(
      Buffer.from(taken.pixels, 'base64'),
      taken.width,
      {
        left: Math.round(from.left * ratio + halfUp),
        top: Math.round(from.top * ratio + halfUp),
        width: Math.round(comparedWidth * ratio),
        height: Math.round(comparedRows * from.row * ratio),
      },
    );
    return {
      brightness,
      inked: inkedIn(brightness),
      hash: createHash('sha1')
        .update(Buffer.from(brightness.buffer))
        .digest('hex'),
    };
  };

  const settled = async (
    from: () => Promise<From>,
    what: string,
    accepted: (seen: Seen) => boolean = () => true,
  ): Promise<Seen> => {
    let last = await shot(await from());
    await untilSettled(
      async () => {
        last = await shot(await from());
        return last.hash;
      },
      what,
      { accepted: () => accepted(last) },
    );
    return last;
  };

  const drawn = async (wordWrap: boolean, highlightOccurrences = false) => {
    await writeSettings(page, profile, {
      scrolling: { smooth: false },
      text: { wordWrap, highlightOccurrences },
    });
    await show('viewer');
  };

  const bothTools = async (wordWrap: boolean) => {
    await drawn(wordWrap);
    const cells = await settled(viewedFrom, 'the viewer drawn as cells');
    await show('editor');
    const elements = await settled(editedFrom, 'the editor drawn');
    await show('viewer');
    return {
      editorInked: elements.inked > leastInk,
      cellsInked: cells.inked > leastInk,
      alike: unlikeShare(elements, cells) < mostUnlike,
      unlike: unlikeShare(elements, cells),
    };
  };

  const alike = { editorInked: true, cellsInked: true, alike: true };

  beforeAll(async () => {
    const folder = tempFolder('viewer-cells');
    profile = path.join(folder, 'profile');
    const file = path.join(folder, 'opened', 'cells.ts');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(file, lines.join('\n'));
    const long = path.join(folder, 'opened', 'long.ts');
    fs.writeFileSync(long, longLines.join('\n'));
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'viewer', root: file },
          { id: '2', tool: 'editor', root: file },
          { id: '3', tool: 'viewer', root: long },
        ],
        activeTab: '1',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ scrolling: { smooth: false } }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await page.locator('.viewer-sideways').first().waitFor();
  });

  afterAll(async () => {
    await closeOrKill(app);
  });

  test('draws a file viewed as the editor draws the same file, alike to the brightness of every pixel but for the edges of glyphs: code in its colors, a tab signed and spaces dotted, wide characters in two cells, control characters as their pictures and a line longer than the window', async () => {
    const { unlike, ...seen } = await bothTools(false);

    assert.deepStrictEqual(seen, alike, `${unlike} of the ink unlike`);
  });

  test('draws wrapped lines as the editor draws them, each break marked, the wide characters and the quotes around them too', async () => {
    const { unlike, ...seen } = await bothTools(true);

    assert.deepStrictEqual(seen, alike, `${unlike} of the ink unlike`);
  });

  test('selects the text the pointer is dragged over, from the character it was pressed before to the one it was let go before, through a tab and whole rows, and copies it with its line breaks', async () => {
    const dragged = [
      'function sized(count: number): string {',
      "\tconst label = count > 9000 ? 'many' : `few ${count}`;",
      '  return [',
    ];
    await drawn(false);

    await dragOver(page, [4, 7], [6, 10]);
    await waitForFocus(page.locator('.viewer-body').first(), 'the viewer');
    await keepCopied(page);
    await page.keyboard.press('ControlOrMeta+C');
    await waitFor(
      async () => (await copied(page)) !== undefined,
      'the selection copied',
    );

    assert.deepStrictEqual(
      [await copied(page), await seenSelected(page)],
      [dragged.join('\n'), dragged],
    );
  });

  test('selects the word a double click is on and marks its other occurrences once it rested, keeping none of the text it draws in elements, so nothing of the page is drawn over the cells, and tells what it shows when asked', async () => {
    await drawn(false, true);
    const word = await cellPoint(page, 4, 24);

    await page.mouse.dblclick(word.x, word.y);
    await waitFor(
      async () => (await seenMarked(page, 'occurrence')).length > 0,
      'the occurrences marked in the cells',
    );
    const held = await page
      .locator('.cell-rows')
      .first()
      .evaluate((host) => ({
        elements: [...host.children].map((child) => child.tagName),
        text: host.textContent,
      }));
    const rows = await seenRows(page);

    assert.deepStrictEqual(
      {
        held,
        second: rows[1]?.text,
        keyword: rows[4]?.pieces.find(({ kind }) => kind === 'keyword')?.text,
        selected: await seenSelected(page),
        marked: await seenMarked(page, 'occurrence'),
      },
      {
        held: { elements: ['CANVAS'], text: '' },
        second: "import { useMemo } from 'react';",
        keyword: 'export',
        selected: ['count'],
        marked: ['count', 'count', 'count'],
      },
    );
  });

  test('keeps the word selected and its copies marked while the file is scrolled to its end and back, and copies it from there, as the viewer holds only the rows around its screen and dropped the selection and the marks once the line selected was none of them', async () => {
    const shows = async (line: string | undefined) =>
      (await seenRows(page)).some(({ text }) => text === line);
    await drawn(false, true);
    await page.locator('.tabs .tab').nth(2).click();
    await waitFor(() => shows(longLines[0]), 'the long file drawn');
    const word = await cellPoint(page, 2, 8);

    await page.mouse.dblclick(word.x, word.y);
    await waitFor(
      async () => (await seenMarked(page, 'occurrence')).length > 0,
      'the occurrences marked in the cells',
    );
    await waitForFocus(page.locator('.viewer-body').first(), 'the viewer');
    await page.keyboard.press('End');
    await waitFor(() => shows(longLines.at(-1)), 'the end of the file shown');
    await untilSettled(
      async () => (await seenMarked(page, 'occurrence')).length,
      'the marks at the end of the file',
    );
    const far = {
      selected: await seenSelected(page),
      marked: [...new Set(await seenMarked(page, 'occurrence'))],
    };
    await keepCopied(page);
    await page.keyboard.press('ControlOrMeta+C');
    await waitFor(
      async () => (await copied(page)) !== undefined,
      'the selection copied',
    );
    const text = await copied(page);
    await page.keyboard.press('Home');
    await waitFor(() => shows(longLines[0]), 'the start of the file shown');

    assert.deepStrictEqual(
      { ...far, copied: text, back: await seenSelected(page) },
      { selected: [], marked: ['total'], copied: 'total', back: ['total'] },
    );
  });

  test('draws its cells again with the device the GPU gives it once the one it had is lost, as nothing else draws the text', async () => {
    await drawn(false);
    const before = await settled(viewedFrom, 'the viewer drawn as cells');
    const lost = await page.evaluate(() => {
      const canvas = document.querySelector('.cell-canvas');
      const context: unknown =
        canvas instanceof HTMLCanvasElement
          ? canvas.getContext('webgpu')
          : null;
      const device =
        context instanceof GPUCanvasContext
          ? context.getConfiguration()?.device
          : undefined;
      device?.destroy();
      return device !== undefined;
    });
    assert.ok(lost, 'the canvas of the cells has no device to lose');
    const after = await settled(
      viewedFrom,
      'the cells drawn again',
      (seen) => seen.inked > leastInk,
    );

    assert.deepStrictEqual(
      {
        inked: after.inked > leastInk,
        alike: unlikeShare(before, after) < mostUnlike,
      },
      { inked: true, alike: true },
      `${unlikeShare(before, after)} of the ink unlike`,
    );
  });

  test('follows the theme as it changes while the cells are shown, drawing them in the colors the editor takes', async () => {
    const dark = await page.evaluate(
      () => matchMedia('(prefers-color-scheme: dark)').matches,
    );
    await drawn(false);
    const before = await settled(viewedFrom, 'the viewer drawn as cells');
    try {
      await page.emulateMedia({ colorScheme: dark ? 'light' : 'dark' });
      const cells = await settled(
        viewedFrom,
        'the cells in the colors of the other theme',
        (seen) => seen.hash !== before.hash,
      );
      await show('editor');
      const elements = await settled(editedFrom, 'the editor drawn');
      await show('viewer');

      assert.deepStrictEqual(
        {
          editorInked: elements.inked > leastInk,
          cellsInked: cells.inked > leastInk,
          alike: unlikeShare(elements, cells) < mostUnlike,
        },
        alike,
        `${unlikeShare(elements, cells)} of the ink unlike`,
      );
    } finally {
      await page.emulateMedia({ colorScheme: null });
    }
  });
});
