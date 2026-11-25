import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { barOf, barParts } from './scrollbarsShown';
import { untilSettled, waitForFocus } from './waits';
import {
  opened,
  profile,
  page,
  rowNames,
  select,
  right,
  sharedCommanderApp,
} from './commanderAppFixtures';
import { cellPoint, seenSelected, viewerRows, viewerShows } from './cellsSeen';
import { firstViewerRow, rowTexts } from './viewerAppFixtures';

const firstRowText = () => rowTexts().then((texts) => texts[0]);

const nextFrame = () =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

const viewerBar = '.viewer-body .scroll-proxy.vertical';

const viewerThumb = async () => {
  const { box } = await barOf(page, viewerBar, 'vertical');
  const { start, end, thumb } = await barParts(page, box, 'vertical');
  assert.ok(thumb, 'the scrollbar of the file viewed has no thumb');
  return {
    top: thumb.top,
    height: thumb.height,
    fromEnd: end.top - thumb.top - thumb.height,
    track: end.top - start.top - start.height,
  };
};

const thumbHeld = () =>
  page.evaluate(() => {
    const thumb = document.querySelector<HTMLElement>(
      '.scrollbar-cover.vertical.shown .scrollbar-thumb',
    );
    if (thumb === null || thumb.hidden) {
      return undefined;
    }
    const { top, height } = thumb.getBoundingClientRect();
    return { top, height };
  });

const insideLines = () =>
  page.locator('.viewer').evaluate((viewer) => {
    const line = parseFloat(
      getComputedStyle(viewer).getPropertyValue('--column-line'),
    );
    const edge = viewer.getBoundingClientRect();
    return { right: edge.right - line, bottom: edge.bottom - line };
  });

const placesOf = () =>
  page.locator('.viewer').evaluate((viewer) => {
    const box = (selector: string) => {
      const found = viewer.querySelector(selector);
      if (found === null) {
        throw new Error(selector);
      }
      return found.getBoundingClientRect();
    };
    const header = box('.column-title');
    const start = box('.column-title .column-start');
    const text = box('.path-text');
    const row = box('.viewer-rows .cell-rows');
    const layoutUnit = 1 / 64;
    return {
      inHeader: viewer.querySelector('.column-title .path-title') !== null,
      underHeader: text.top >= header.bottom - layoutUnit,
      aboveText: text.bottom <= row.top + layoutUnit,
      fromText: Math.round(text.left - row.left) + 0,
      start: Math.round(start.left - header.left) + 0,
      actions: viewer.querySelector('.column-title .column-actions') !== null,
    };
  });

function watchKeptRow(text: string): void {
  const seen: number[] = [];
  Reflect.set(window, 'keptRowSeen', seen);
  Reflect.set(window, 'keptRowWatched', true);
  const frame = () => {
    const host = document.querySelector('.viewer-rows .cell-rows');
    const row =
      host instanceof HTMLElement
        ? host.seenRows?.().find((each) => each.text === text)
        : undefined;
    if (row !== undefined) {
      seen.push(Math.round(row.top));
    }
    if (Reflect.get(window, 'keptRowWatched') === true) {
      requestAnimationFrame(frame);
    }
  };
  frame();
}

function keptRowSeen(): number[] {
  Reflect.set(window, 'keptRowWatched', false);
  const seen: unknown = Reflect.get(window, 'keptRowSeen');
  return Array.isArray(seen)
    ? seen.filter((each) => typeof each === 'number')
    : [];
}

const restingAt = () =>
  page.locator('.viewer-sideways').evaluate((box) => {
    const host = box.querySelector('.cell-rows');
    const height =
      host instanceof HTMLElement ? host.seenRows?.()[0]?.height : undefined;
    return height === undefined
      ? NaN
      : Math.round((box.scrollTop / height) * 100) / 100;
  });

suite('App commander', () => {
  sharedCommanderApp();

  test('views a file in a tab of its own with F3, saved as one, and goes back to the commander with Escape, its row still selected', async () => {
    await select('notes');
    await page.keyboard.press('F3');
    await page.locator('.tabs .tab.active', { hasText: 'notes.txt' }).waitFor();
    await page.locator('.viewer').waitFor();
    await page.locator('.tabs .tab.active .tool-icon.tool-viewer').waitFor();
    await waitFor(() => {
      const state: unknown = JSON.parse(
        fs.readFileSync(path.join(profile, 'state.json'), 'utf8'),
      );
      return JSON.stringify(state).includes('"tool":"viewer"');
    }, 'the viewing tab to be saved');

    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    await page.locator('.tabs .tab.active:has(.tool-commander)').waitFor();
    assert.strictEqual(
      await page
        .locator('.tabs [role="tab"]', { hasText: 'notes.txt' })
        .count(),
      0,
    );
    assert.match(
      (await right().locator('.commander-row.selected').textContent()) ?? '',
      /^notes/,
    );
    await page.keyboard.press('ArrowUp');
    await waitFor(
      async () =>
        !(
          (await right().locator('.commander-row.selected').textContent()) ?? ''
        ).startsWith('notes'),
      'the keys to move the selection again',
    );
  });

  test('puts the path of a file viewed on a line of its own under the buttons of its header, starting where the editor starts its path, the empty column of line numbers before its text, its buttons at the start of the header and none at its end, as its search opens on Mod+F', async () => {
    await select('notes');
    await page.keyboard.press('F3');
    await page.locator(viewerRows).first().waitFor();
    assert.deepStrictEqual(await placesOf(), {
      inHeader: false,
      underHeader: true,
      aboveText: true,
      fromText: 8 - 56 - 6,
      start: 0,
      actions: false,
    });

    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    await page.locator('.tabs .tab.active:has(.tool-commander)').waitFor();
  });

  test('keeps the scrollbar of a Markdown preview beside the line its column draws on the right, so it shows as wide as that of a file viewed as text, and runs it all the way down to the line its column draws below', async () => {
    const lines = Array.from(
      { length: 200 },
      (_, index) => `Paragraph ${index}.`,
    );
    fs.writeFileSync(
      path.join(opened, 'long.md'),
      lines.join(`${String.fromCharCode(10)}${String.fromCharCode(10)}`),
    );
    try {
      await select('long');
      await page.keyboard.press('F3');
      await page.locator('.viewer .markdown').waitFor();
      await waitFor(
        () =>
          page
            .locator('.viewer-preview')
            .evaluate((body) => body.scrollHeight > body.clientHeight),
        'the preview to outgrow its column',
      );
      const { box } = await barOf(page, '.viewer-preview', 'vertical');
      const inside = await insideLines();

      assert.deepStrictEqual(
        {
          right: Math.round(inside.right - box.left - box.width) + 0,
          reachesBelow: box.top + box.height > inside.bottom - 0.5,
        },
        { right: 0, reachesBelow: true },
        JSON.stringify({ box, inside }),
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'long.md'));
      await waitFor(
        async () => !(await rowNames()).includes('long.md'),
        'the file to be gone from the list',
      );
    }
  });

  test('keeps the thumb of a file viewed as tall wherever it is scrolled to, though its lines grow long further down, moves it down as the rows do, and ends it at the end of its track without a jump, its scrollbar against the line its column draws on the right and ending above the one under the text, which runs along the line its column draws below', async () => {
    const lines = Array.from({ length: 200 }, (_, index) =>
      index < 100
        ? `short ${index}`.padEnd(19, '.')
        : `long ${index}`.padEnd(59, '.'),
    );
    fs.writeFileSync(
      path.join(opened, 'uneven.txt'),
      lines.join(String.fromCharCode(10)),
    );
    try {
      await select('uneven');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === 'short 0............',
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      const first = await viewerThumb();
      const smallestThumb = 24;
      assert.ok(first.height > smallestThumb + 1, JSON.stringify(first));
      const seen = [first];
      await waitFor(async () => {
        seen.push(await viewerThumb());
        if ((await firstViewerRow()).startsWith('long')) {
          return true;
        }
        await page.keyboard.press('PageDown');
        return false;
      }, 'the long rows');
      await page.keyboard.press('End');
      await viewerShows(page, `long ${lines.length - 1}.`);
      seen.push(await untilSettled(viewerThumb, 'the thumb to rest'));
      assert.ok(
        seen.every((each) => Math.abs(each.height - first.height) < 0.5),
        JSON.stringify(seen),
      );
      assert.ok(
        seen.every(
          (each, index) =>
            index === 0 || each.top >= (seen[index - 1]?.top ?? 0),
        ),
        JSON.stringify(seen),
      );
      assert.ok(
        Math.abs(seen.at(-1)?.fromEnd ?? 1) < 0.5,
        JSON.stringify(seen),
      );
      const inside = await insideLines();
      const beside = (await barOf(page, viewerBar, 'vertical')).box;
      const below = (await barOf(page, '.viewer-sideways', 'horizontal')).box;
      assert.deepStrictEqual(
        {
          right: Math.round(inside.right - beside.left - beside.width) + 0,
          above: Math.round(below.top - beside.top - beside.height) + 0,
          bottom: Math.round(inside.bottom - below.top - below.height) + 0,
        },
        { right: 0, above: 0, bottom: 0 },
        JSON.stringify({ inside, beside, below }),
      );
      const atEnd = seen.at(-1)?.top ?? 0;
      const lastTop = await firstViewerRow();
      await page.keyboard.press('ArrowUp');
      await waitFor(
        async () => (await firstViewerRow()) !== lastTop,
        'a row up',
      );
      const up = await untilSettled(viewerThumb, 'the thumb a row up');
      assert.ok(atEnd - up.top < up.track / 50, JSON.stringify({ atEnd, up }));
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'uneven.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('uneven.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('shows the rows of a file viewed, moving a page with PageDown, to its end with End and anywhere with its scrollbar, as wide as the settings say, centering its thumb where its track is pressed, its thumb moving with the rows while dragged rather than under the pointer and then jumping to them once let go', async () => {
    const lines = Array.from({ length: 200 }, (_, index) => `row ${index}`);
    fs.writeFileSync(
      path.join(opened, 'rows.txt'),
      lines.join(String.fromCharCode(10)),
    );
    try {
      await select('rows');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstRowText()) === 'row 0',
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');

      const inWord = await cellPoint(page, 3, 1);
      await page.mouse.dblclick(inWord.x, inWord.y);
      assert.deepStrictEqual(await seenSelected(page), ['row']);
      const { box: bar } = await barOf(page, viewerBar, 'vertical');
      const styled = await page.evaluate(() =>
        parseFloat(
          getComputedStyle(
            document.querySelector('.viewer-body') ?? document.body,
            '::-webkit-scrollbar',
          ).width,
        ),
      );
      assert.ok(
        Math.abs(bar.width - styled) < 1 / 64,
        JSON.stringify({ drawn: bar.width, styled }),
      );

      for (let press = 0; press < 30; press++) {
        void page.keyboard.press('ArrowDown');
      }
      await waitFor(
        async () => (await firstRowText()) === 'row 30',
        'every press of a key held down to move a row',
      );

      await page.keyboard.press('PageDown');
      await waitFor(
        async () => /^row [4-9]/.test((await firstRowText()) ?? ''),
        'a page further down',
      );
      await page.keyboard.press('End');
      await waitFor(
        async () => (await rowTexts()).at(-1) === 'row 199',
        'the last row',
      );
      const x = bar.left + bar.width / 2;
      const { start } = await barParts(page, bar, 'vertical');
      const trackTop = start.top + start.height;
      await page.mouse.click(x, trackTop + 1);
      await waitFor(
        async () => (await firstRowText()) === 'row 0',
        'the start again',
      );

      const atStart = await untilSettled(viewerThumb, 'the thumb to rest');
      const middle = bar.top + bar.height / 2;
      await page.mouse.move(x, atStart.top + atStart.height / 2);
      await page.mouse.down();
      try {
        await page.mouse.move(x, middle, { steps: 10 });
        await waitFor(async () => {
          const row = Number((await firstRowText())?.split(' ')[1]);
          return row > 60 && row < 140;
        }, 'the middle rows while the thumb is still held');
        const held = await untilSettled(thumbHeld, 'the thumb held to rest');
        assert.ok(
          held && held.top <= middle && middle <= held.top + held.height,
          JSON.stringify({ held, middle }),
        );
      } finally {
        await page.mouse.up();
      }

      await page.locator(viewerBar).evaluate((proxy) => {
        const frames: { share: number; row: string }[] = [];
        Reflect.set(window, 'thumbFrames', frames);
        const record = () => {
          const host = document.querySelector('.viewer-rows .cell-rows');
          frames.push({
            share: proxy.scrollTop / (proxy.scrollHeight - proxy.clientHeight),
            row:
              (host instanceof HTMLElement
                ? host.seenRows?.()[0]?.text
                : undefined) ?? '',
          });
          if (Reflect.get(window, 'thumbFrames') === frames) {
            requestAnimationFrame(record);
          }
        };
        requestAnimationFrame(record);
      });
      await page.mouse.move(x, middle);
      await page.mouse.down();
      try {
        for (let step = 1; step <= 30; step++) {
          await page.mouse.move(x, middle + step);
          await nextFrame();
          await nextFrame();
        }
      } finally {
        await page.mouse.up();
      }
      for (let frame = 0; frame < 10; frame++) {
        await nextFrame();
      }
      const room = atStart.track - atStart.height;
      const frames = await page.evaluate(() => {
        const recorded: unknown = Reflect.get(window, 'thumbFrames');
        Reflect.set(window, 'thumbFrames', undefined);
        return Array.isArray(recorded)
          ? recorded.map((frame: unknown) => ({
              share: Number(Reflect.get(Object(frame), 'share')),
              row: String(Reflect.get(Object(frame), 'row')),
            }))
          : [];
      });
      assert.ok(new Set(frames.map((frame) => frame.row)).size > 1);
      assert.ok(new Set(frames.map((frame) => frame.share)).size > 1);
      assert.deepStrictEqual(
        frames.filter(
          (frame, index) =>
            index > 0 &&
            frame.row === frames[index - 1]?.row &&
            Math.abs(frame.share - (frames[index - 1]?.share ?? 0)) * room >
              0.5,
        ),
        [],
      );

      const pressed = trackTop + atStart.height * 1.5;
      await page.mouse.click(x, pressed);
      await waitFor(async () => {
        const thumb = await viewerThumb();
        return (
          Math.abs(thumb.top + thumb.height / 2 - pressed) < thumb.height / 10
        );
      }, 'the thumb centered where its track was pressed');
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'rows.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('rows.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('glides the rows of a file viewed by as its box scrolls, and leaves the box scrolled by the same 64 rows whenever it rests, wherever in the file', async () => {
    const lines = Array.from({ length: 200 }, (_, index) => `kept ${index}`);
    fs.writeFileSync(
      path.join(opened, 'kept.txt'),
      lines.join(String.fromCharCode(10)),
    );
    await select('kept');
    await page.keyboard.press('F3');
    await waitFor(
      async () => (await firstRowText()) === 'kept 0',
      'the first row',
    );
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');
    const atFirst = await restingAt();
    const body = await page.locator('.viewer-body').boundingBox();
    assert.ok(body);
    await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
    await page.evaluate(watchKeptRow, 'kept 14');
    await page.mouse.wheel(0, 100);
    await waitFor(
      async () => (await firstRowText()) !== 'kept 0',
      'the file to scroll',
    );
    const rested = await untilSettled(restingAt, 'the rows to rest');
    const seen = await page.evaluate(keptRowSeen);

    assert.deepStrictEqual([atFirst, rested], [64, 64]);
    assert.ok(new Set(seen).size >= 2, JSON.stringify(seen));
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
  });
});
