import * as assert from 'node:assert';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { writeSettings } from './settingsWritten';
import { untilSettled, waitForFocus } from './waits';

const text = [
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
].join('\n');

const edgeLevels = 16;

const mostUnlike = 0.01;

const leastInk = 2000;

interface Seen {
  readonly brightness: Float32Array;
  readonly inked: number;
}

function blurredBrightness(
  pixels: Buffer,
  width: number,
  box: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  },
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

  const colored = {
    elements:
      '.viewer-rows .viewer-row[class*="syntax-"], .viewer-rows .viewer-row [class*="syntax-"]',
    cells: '.viewer-rows .cell-rows[data-rows][data-colored]',
  };

  const shot = async (): Promise<Seen & { readonly hash: string }> => {
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
    const area = await page
      .locator('.viewer-sideways')
      .first()
      .evaluate((element) => {
        const { left, top } = element.getBoundingClientRect();
        return {
          left,
          top,
          width: element.clientWidth,
          height: element.clientHeight,
        };
      });
    const brightness = blurredBrightness(
      Buffer.from(taken.pixels, 'base64'),
      taken.width,
      {
        left: Math.ceil(area.left * ratio),
        top: Math.ceil(area.top * ratio),
        width: Math.floor(area.width * ratio) - 1,
        height: Math.floor(area.height * ratio) - 1,
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

  const drawn = async (cells: boolean, wordWrap: boolean): Promise<Seen> => {
    await writeSettings(page, profile, {
      scrolling: { smooth: false },
      text: { wordWrap, highlightOccurrences: false, webgl: cells },
    });
    await page
      .locator(cells ? colored.cells : colored.elements)
      .first()
      .waitFor({ state: 'attached', timeout: 30_000 });
    let last = await shot();
    await untilSettled(
      async () => {
        last = await shot();
        return last.hash;
      },
      `the viewer drawn as ${cells ? 'cells' : 'elements'}`,
    );
    return last;
  };

  const bothWays = async (wordWrap: boolean) => {
    const elements = await drawn(false, wordWrap);
    const cells = await drawn(true, wordWrap);
    return {
      elementsInked: elements.inked > leastInk,
      cellsInked: cells.inked > leastInk,
      alike: unlikeShare(elements, cells) < mostUnlike,
      unlike: unlikeShare(elements, cells),
    };
  };

  const alike = { elementsInked: true, cellsInked: true, alike: true };

  const at = async (line: number, column: number) => {
    const { advance, row, left, top } = await page.evaluate(() => {
      const probe = document.querySelector('.viewer-probe');
      const area = document.querySelector('.viewer-sideways');
      if (probe === null || area === null) {
        throw new Error('The viewer shows no text');
      }
      const style = getComputedStyle(probe);
      const box = probe.getBoundingClientRect();
      const shown = area.getBoundingClientRect();
      return {
        advance:
          (box.width -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight)) /
          1000,
        row: box.height,
        left: shown.left,
        top: shown.top,
      };
    });
    return { x: left + column * advance + 1, y: top + (line + 0.5) * row };
  };

  const copied = async () => {
    await waitForFocus(page.locator('.viewer-body').first(), 'the viewer');
    return page.evaluate(() => {
      const clipboardData = new DataTransfer();
      const copy = new ClipboardEvent('copy', {
        clipboardData,
        bubbles: true,
        cancelable: true,
      });
      document.activeElement?.dispatchEvent(copy);
      return copy.defaultPrevented
        ? clipboardData.getData('text/plain')
        : (getSelection()?.toString() ?? '');
    });
  };

  const settled = async () => {
    let last = await shot();
    await untilSettled(async () => {
      last = await shot();
      return last.hash;
    }, 'the selection drawn');
    return last;
  };

  const selectedBothWays = async (select: () => Promise<void>) => {
    const ways: { copied: string; seen: Seen }[] = [];
    for (const cells of [false, true]) {
      await drawn(cells, false);
      await select();
      ways.push({ seen: await settled(), copied: await copied() });
    }
    const [elements, cells] = ways;
    return {
      elements: elements.copied,
      cells: cells.copied,
      alike: unlikeShare(elements.seen, cells.seen) < mostUnlike,
      unlike: unlikeShare(elements.seen, cells.seen),
    };
  };

  beforeAll(async () => {
    const folder = tempFolder('viewer-cells');
    profile = path.join(folder, 'profile');
    const file = path.join(folder, 'opened', 'cells.ts');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(file, text);
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [{ id: '1', tool: 'viewer', root: file }],
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

  test('draws a file as cells where its elements stood, alike to the brightness of every pixel but for the edges of glyphs: code in its colors, a tab signed and spaces dotted, wide characters in two cells, control characters as their pictures and a line longer than the window', async () => {
    const { unlike, ...seen } = await bothWays(false);

    assert.deepStrictEqual(seen, alike, `${unlike} of the ink unlike`);
  });

  test('draws wrapped lines as cells where their elements stood, each break marked', async () => {
    const { unlike, ...seen } = await bothWays(true);

    assert.deepStrictEqual(seen, alike, `${unlike} of the ink unlike`);
  });

  test('selects the text the pointer is dragged over, from the character it was pressed before to the one it was let go before, through a tab and whole rows, drawn as the selection of the elements is, and copies it with its line breaks', async () => {
    const dragged = [
      'function sized(count: number): string {',
      "\tconst label = count > 9000 ? 'many' : `few ${count}`;",
      '  return [',
    ].join('\n');
    const { unlike, ...seen } = await selectedBothWays(async () => {
      const from = await at(3, 7);
      const to = await at(5, 10);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 6 });
      await page.mouse.up();
    });

    assert.deepStrictEqual(
      seen,
      { elements: dragged, cells: dragged, alike: true },
      `${unlike} of the ink unlike`,
    );
  });

  test('selects the word a double click is on and marks its other occurrences once it rested, as the elements do', async () => {
    const { unlike, ...seen } = await selectedBothWays(async () => {
      const word = await at(3, 24);
      await page.mouse.dblclick(word.x, word.y);
    });

    assert.deepStrictEqual(
      seen,
      { elements: 'count', cells: 'count', alike: true },
      `${unlike} of the ink unlike`,
    );
  });

  test('draws its cells again once the GPU gave its context back after losing it, as nothing else draws the text', async () => {
    const before = await drawn(true, false);
    await page.evaluate(async () => {
      const canvas = document.querySelector('.cell-canvas');
      const lost =
        canvas instanceof HTMLCanvasElement
          ? canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')
          : undefined;
      await new Promise((resolve) => {
        canvas?.addEventListener('webglcontextlost', resolve, { once: true });
        lost?.loseContext();
      });
      await new Promise((resolve) => setTimeout(resolve));
      lost?.restoreContext();
    });
    let after = await shot();
    await untilSettled(
      async () => {
        after = await shot();
        return after.hash;
      },
      'the cells drawn again',
      { accepted: () => after.inked > leastInk },
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

  test('follows the theme as it changes while the cells are shown, drawing them in the colors the elements take', async () => {
    const dark = await page.evaluate(
      () => matchMedia('(prefers-color-scheme: dark)').matches,
    );
    await drawn(true, false);
    try {
      await page.emulateMedia({ colorScheme: dark ? 'light' : 'dark' });
      let cells = await shot();
      await untilSettled(async () => {
        cells = await shot();
        return cells.hash;
      }, 'the cells in the colors of the other theme');
      const elements = await drawn(false, false);

      assert.deepStrictEqual(
        {
          elementsInked: elements.inked > leastInk,
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
