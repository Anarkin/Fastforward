import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { pdfOf } from './pdfs';
import { clippedCorner, waitForFocus } from './appFixtures';
import {
  opened,
  profile,
  page,
  rowNames,
  firstViewerRow,
  findMarks,
  findCount,
  viewerThumb,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';

const count = () => page.locator('.viewer .find-field-count').textContent();

const firstRowText = () =>
  page.locator('.viewer-rows .viewer-row').first().textContent();

const nextFrame = () =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

suite('App commander', () => {
  sharedCommanderApp();

  test('previews a PDF, searching it on Ctrl+F without leaving the preview, and opens it again where it was left', async () => {
    fs.writeFileSync(
      path.join(opened, 'book.pdf'),
      pdfOf(
        Array.from({ length: 12 }, (_page, pageIndex) =>
          Array.from({ length: 40 }, (_line, line) =>
            line === 20 && (pageIndex === 2 || pageIndex === 8)
              ? `Needle on page ${pageIndex + 1}`
              : `Page ${pageIndex + 1}, line ${line + 1}`,
          ),
        ),
      ),
    );
    const scroller = page.locator('.viewer .pdf-scroll');
    const shownPage = () =>
      scroller.evaluate((element) => {
        const top = element.getBoundingClientRect().top;
        const pages = [...element.querySelectorAll('.page')];
        return (
          pages.findIndex(
            (each) => each.getBoundingClientRect().bottom > top + 40,
          ) + 1
        );
      });
    try {
      await select('book');
      await page.keyboard.press('F3');
      await page
        .locator('.viewer .textLayer', { hasText: 'Page 1, line 1' })
        .waitFor();
      await waitForFocus(scroller, 'the PDF');
      assert.strictEqual(
        await page.locator('.viewer .page').first().getAttribute('aria-label'),
        'Page 1',
      );

      await page.keyboard.press('ControlOrMeta+F');
      await waitForFocus(
        page.locator('.viewer .find-field-input'),
        'the search',
      );
      await page.keyboard.type('needle');
      await waitFor(
        async () => (await count()) === '1 of 2',
        'the matches counted',
      );
      await page.locator('.viewer .textLayer .highlight.selected').waitFor();
      await page.keyboard.press('Enter');
      await waitFor(async () => (await count()) === '2 of 2', 'the next match');
      await waitFor(
        async () => (await shownPage()) === 9,
        'the page of the match',
      );
      await page.keyboard.press('Escape');
      await page.locator('.viewer .find-field').waitFor({ state: 'detached' });
      assert.strictEqual(await page.locator('.viewer .pdf-pane').count(), 1);

      await scroller.evaluate((element) => {
        const seventh = element.querySelectorAll('.page')[6];
        if (seventh instanceof HTMLElement) {
          element.scrollTop = seventh.offsetTop + 20;
        }
      });
      const pdfState = () =>
        scroller.evaluate((element) => ({
          scrollTop: element.scrollTop,
          seventh: [...element.querySelectorAll('.page')].map((each) =>
            each instanceof HTMLElement ? each.offsetTop : -1,
          )[6],
          count: element.querySelectorAll('.page').length,
        }));
      await waitFor(
        async () => (await shownPage()) === 7,
        'page 7 shown',
      ).catch(async (error: unknown) => {
        throw new Error(
          `${String(error)}: page ${await shownPage()} shown, ${JSON.stringify(await pdfState())}`,
        );
      });
      await scroller.focus();
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });

      await select('book');
      await page.keyboard.press('F3');
      await page.locator('.viewer .textLayer').first().waitFor();
      await waitFor(
        async () => (await shownPage()) === 7,
        'the PDF opened at page 7 again',
      ).catch(async (error: unknown) => {
        throw new Error(
          `${String(error)}: page ${await shownPage()} shown, ${JSON.stringify(await pdfState())}, places ${fs.existsSync(path.join(profile, 'pdf-places.json')) ? fs.readFileSync(path.join(profile, 'pdf-places.json'), 'utf8') : 'none saved'}`,
        );
      });
    } finally {
      if (await page.locator('.viewer .find-field').isVisible()) {
        await page.keyboard.press('Escape');
      }
      if (await page.locator('.viewer').isVisible()) {
        await scroller.focus();
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'book.pdf'));
      await waitFor(
        async () => !(await rowNames()).includes('book.pdf'),
        'the file to be gone from the list',
      );
    }
  });

  test('searches a file viewed on Ctrl+F as the diff does, counting the matches, stepping to them with Enter and Shift+Enter, and closes the search on Esc, then the viewer', async () => {
    const lines = Array.from({ length: 300 }, (_, index) =>
      index % 100 === 50 ? `Needle ${index}` : `row ${index}`,
    );
    fs.writeFileSync(
      path.join(opened, 'haystack.txt'),
      lines.join(String.fromCharCode(10)),
    );
    try {
      await select('haystack');
      await page.keyboard.press('F3');
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');

      await page.keyboard.press('ControlOrMeta+F');
      await waitForFocus(
        page.locator('.viewer .find-field-input'),
        'the search',
      );
      assert.ok(
        (await page
          .locator('.viewer .search-row')
          .evaluate(
            (row) =>
              row.getBoundingClientRect().left -
              (row.closest('.viewer')?.getBoundingClientRect().left ?? 0),
          )) < 8,
        'The search starts at the start of the header, as in the diff',
      );
      await page.keyboard.type('needle');
      await waitFor(async () => (await findCount()) === '1 of 3', 'the count');
      await waitFor(
        async () =>
          JSON.stringify(await findMarks()) ===
          JSON.stringify([['Needle', true]]),
        'the first match marked as current',
      );
      await page.keyboard.press('Enter');
      await waitFor(
        async () => (await findCount()) === '2 of 3',
        'the next match',
      );
      await waitFor(
        async () =>
          JSON.stringify(await findMarks()) ===
            JSON.stringify([['Needle', true]]) &&
          ((await page
            .locator('.viewer-rows .viewer-row', {
              has: page.locator('.find-match.current'),
            })
            .textContent()) ?? '') === 'Needle 150',
        'the view at the second match',
      );
      await page.keyboard.press('Shift+Enter');
      await waitFor(
        async () => (await findCount()) === '1 of 3',
        'the previous match',
      );
      await page.keyboard.press('1');
      assert.strictEqual(
        await page.locator('.viewer .find-field-input').inputValue(),
        'needle1',
      );
      await page.keyboard.press('Backspace');

      await page.keyboard.press('Escape');
      await page.locator('.viewer .find-field').waitFor({ state: 'detached' });
      await waitForFocus(page.locator('.viewer-body'), 'the viewer again');
      assert.deepStrictEqual(await findMarks(), []);
      assert.strictEqual(await page.locator('.viewer').count(), 1);
    } finally {
      if (await page.locator('.viewer .find-field').isVisible()) {
        await page.keyboard.press('Escape');
        await page
          .locator('.viewer .find-field')
          .waitFor({ state: 'detached' });
      }
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'haystack.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('haystack.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('runs the thumb of a Markdown preview all the way down to the line its column draws, rounding its corner as the column rounds its own, though the body of the preview is rounded itself', async () => {
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
      const preview = page.locator('.viewer-preview');
      await preview.evaluate((body) => {
        body.scrollTop = body.scrollHeight;
      });
      await preview.hover();
      const edges = () =>
        preview.evaluate((body) => {
          const column = body.closest('.column');
          const bar = document.querySelector(
            '.overlay-scrollbar.vertical.shown',
          );
          if (column === null || bar === null) {
            return undefined;
          }
          const style = getComputedStyle(column);
          const line = parseFloat(style.getPropertyValue('--column-line'));
          const edge = column.getBoundingClientRect();
          const thumb = bar.getBoundingClientRect();
          return {
            right: Math.round(edge.right - line - thumb.right) + 0,
            bottom: Math.round(edge.bottom - line - thumb.bottom) + 0,
            clip: getComputedStyle(bar).clipPath,
            corner: Math.round(
              parseFloat(style.borderBottomRightRadius) - line,
            ),
          };
        });
      await waitFor(async () => (await edges()) !== undefined, 'the thumb');
      const placed = await edges();

      assert.deepStrictEqual(
        [
          placed?.right,
          placed?.bottom,
          Math.round(clippedCorner(placed?.clip ?? '')),
        ],
        [0, 0, placed?.corner],
        JSON.stringify(placed),
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

  test('keeps the thumb of a file viewed as tall wherever it is scrolled to, though its lines grow long further down, moves it down as the rows do, and ends it at the end of its track without a jump, against the line its column draws on the right and where the rounded corner of the column starts', async () => {
    const lines = Array.from({ length: 300 }, (_, index) =>
      index < 150
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
      await waitFor(
        async () => (await firstViewerRow()).startsWith('long 2'),
        'the end',
      );
      seen.push(await viewerThumb());
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
      const edges = await page.locator('.viewer-thumb').evaluate((thumb) => {
        const column = thumb.closest('.column');
        const track = thumb.parentElement;
        if (column === null || track === null) {
          return undefined;
        }
        const style = getComputedStyle(column);
        const clip = getComputedStyle(track);
        const line = parseFloat(style.getPropertyValue('--column-line'));
        const edge = column.getBoundingClientRect();
        const box = thumb.getBoundingClientRect();
        return {
          right: Math.round(edge.right - line - box.right) + 0,
          bottom: Math.round(edge.bottom - line - box.bottom) + 0,
          corner: Math.round(parseFloat(style.borderBottomRightRadius) - line),
          clipped: clip.overflow,
          rounded: Math.round(parseFloat(clip.borderBottomRightRadius)),
        };
      });
      assert.deepStrictEqual(
        [edges?.right, edges?.bottom, edges?.clipped, edges?.rounded],
        [0, 0, 'hidden', edges?.corner],
        JSON.stringify(edges),
      );
      const atEnd = seen.at(-1)?.top ?? 0;
      const lastTop = await firstViewerRow();
      await page.keyboard.press('ArrowUp');
      await waitFor(
        async () => (await firstViewerRow()) !== lastTop,
        'a row up',
      );
      const track = await page
        .locator('.viewer-thumb')
        .evaluate(
          (element) =>
            element.parentElement?.getBoundingClientRect().height ?? 0,
        );
      assert.ok(
        atEnd - (await viewerThumb()).top < track / 50,
        JSON.stringify({ atEnd, up: await viewerThumb(), track }),
      );
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

  test('shows the rows of a file viewed, moving a page with PageDown, to its end with End and anywhere with its scrollbar, centering its thumb where its track is pressed, its thumb moving with the rows while dragged rather than under the pointer and then jumping to them once let go', async () => {
    const lines = Array.from({ length: 200 }, (_, index) => `row ${index}`);
    fs.writeFileSync(
      path.join(opened, 'rows.txt'),
      lines.join(String.fromCharCode(10)),
    );
    await select('rows');
    await page.keyboard.press('F3');
    await waitFor(
      async () => (await firstRowText()) === 'row 0',
      'the first row',
    );
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');

    await page
      .locator('.viewer-rows .viewer-row')
      .nth(3)
      .dblclick({ position: { x: 12, y: 4 } });
    assert.strictEqual(
      await page.evaluate(() => getSelection()?.toString().trim()),
      'row',
    );
    const thumb = page.locator('.viewer-thumb');
    assert.match(
      (await thumb.getAttribute('class')) ?? '',
      /overlay-scrollbar/,
    );
    assert.strictEqual(
      await thumb.evaluate((element) => element.getBoundingClientRect().width),
      await page.evaluate(() =>
        parseFloat(
          getComputedStyle(document.body).getPropertyValue('--scrollbar-size'),
        ),
      ),
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
      async () =>
        (await page
          .locator('.viewer-rows .viewer-row')
          .last()
          .textContent()) === 'row 199',
      'the last row',
    );
    const bar = await page.locator('.viewer-scrollbar').boundingBox();
    assert.ok(bar);
    await page.mouse.click(bar.x + bar.width / 2, bar.y + 1);
    await waitFor(
      async () => (await firstRowText()) === 'row 0',
      'the start again',
    );

    const middle = bar.y + bar.height / 2;
    await page.mouse.move(bar.x + bar.width / 2, bar.y + 1);
    await page.mouse.down();
    await page.mouse.move(bar.x + bar.width / 2, middle, { steps: 10 });
    await waitFor(async () => {
      const row = Number((await firstRowText())?.split(' ')[1]);
      return row > 60 && row < 140;
    }, 'the middle rows while the thumb is still held');
    const held = await thumb.boundingBox();
    assert.ok(held && held.y <= middle && middle <= held.y + held.height);
    await page.mouse.up();

    await thumb.evaluate((element) => {
      const frames: { top: number; row: string }[] = [];
      Reflect.set(window, 'thumbFrames', frames);
      const record = () => {
        frames.push({
          top: element.getBoundingClientRect().top,
          row:
            document.querySelector('.viewer-rows .viewer-row')?.textContent ??
            '',
        });
        if (Reflect.get(window, 'thumbFrames') === frames) {
          requestAnimationFrame(record);
        }
      };
      requestAnimationFrame(record);
    });
    const x = bar.x + bar.width / 2;
    await page.mouse.move(x, middle);
    await page.mouse.down();
    for (let step = 1; step <= 30; step++) {
      await page.mouse.move(x, middle + step);
      await nextFrame();
      await nextFrame();
    }
    await page.mouse.up();
    for (let frame = 0; frame < 10; frame++) {
      await nextFrame();
    }
    const frames = await page.evaluate(() => {
      const recorded: unknown = Reflect.get(window, 'thumbFrames');
      Reflect.set(window, 'thumbFrames', undefined);
      return Array.isArray(recorded)
        ? recorded.map((frame: unknown) => ({
            top: Number(Reflect.get(Object(frame), 'top')),
            row: String(Reflect.get(Object(frame), 'row')),
          }))
        : [];
    });
    assert.ok(new Set(frames.map((frame) => frame.row)).size > 1);
    assert.deepStrictEqual(
      frames.filter(
        (frame, index) =>
          index > 0 &&
          frame.row === frames[index - 1]?.row &&
          Math.abs(frame.top - (frames[index - 1]?.top ?? 0)) > 0.5,
      ),
      [],
    );

    const thumbHeight = (await thumb.boundingBox())?.height ?? 0;
    assert.ok(thumbHeight > 0);
    const pressed = bar.y + thumbHeight * 1.5;
    await page.mouse.click(x, pressed);
    await waitFor(async () => {
      const box = await thumb.boundingBox();
      return (
        box !== null &&
        Math.abs(box.y + box.height / 2 - pressed) < box.height / 10
      );
    }, 'the thumb centered where its track was pressed');

    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'rows.txt'));
    await waitFor(
      async () => !(await rowNames()).includes('rows.txt'),
      'the file to be gone from the list',
    );
  });
});
