import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../shared/strings';
import { waitFor } from './fixtures';
import { pdfOf } from './pdfs';
import {
  barsOffGrid,
  clippedCorner,
  gridLines,
  gridRuler,
  waitForFocus,
} from './appFixtures';
import {
  opened,
  profile,
  page,
  dotted,
  savedText,
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

const layout = () =>
  page.locator('.viewer-body').evaluate((body) => {
    const shown = body.querySelector('.viewer-rows');
    const leftOf = (row: Element | undefined, offset: number) => {
      const walker = document.createTreeWalker(
        row ?? body,
        NodeFilter.SHOW_TEXT,
      );
      let node = walker.nextNode();
      let at = offset;
      while (node instanceof Text && at >= node.length) {
        at -= node.length;
        node = walker.nextNode();
      }
      if (!(node instanceof Text)) {
        return Number.NaN;
      }
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      return range.getBoundingClientRect().left;
    };
    const each = [...body.querySelectorAll('.viewer-rows .viewer-row')];
    const edge = body.getBoundingClientRect().right;
    return {
      fits:
        (shown?.getBoundingClientRect().width ?? Infinity) <=
        body.clientWidth + 0.5,
      marks: [...body.querySelectorAll('.viewer-break')].map(
        (mark) => mark.getBoundingClientRect().right <= edge,
      ),
      indented: Math.abs(leftOf(each[2], 0) - leftOf(each[1], 4)) < 0.5,
    };
  });

const laidOut = () =>
  page.locator('.viewer-body').evaluate((body) =>
    [...body.querySelectorAll('.viewer-rows .viewer-row')].map((row) => {
      const texts: Text[] = [];
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node instanceof Text && node.length > 0) {
          texts.push(node);
        }
      }
      const range = document.createRange();
      let textEnd = Number.NaN;
      let visibleEnd = Number.NaN;
      for (const node of texts) {
        for (let at = 0; at < node.length; at++) {
          range.setStart(node, at);
          range.setEnd(node, at + 1);
          const cell = node.parentElement?.closest('.cell');
          textEnd = (cell ?? range).getBoundingClientRect().right;
          if (node.data[at] !== ' ') {
            visibleEnd = textEnd;
          }
        }
      }
      const mark = row.querySelector('.viewer-break')?.getBoundingClientRect();
      return {
        inside: visibleEnd <= row.getBoundingClientRect().right + 0.5,
        marked:
          mark === undefined ||
          (mark.left > visibleEnd - mark.width / 2 &&
            mark.left < textEnd + mark.width / 2),
      };
    }),
  );

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

  test('wraps the long lines of a file viewed as the diff wraps its lines, indenting the rows they wrap onto and marking where they wrap and the spaces they wrap at, copies a wrapped line as one line, stops on W or its button for the diff too, and shows whitespace, as it does by default, until a dot', async () => {
    const words = Array.from({ length: 80 }, (_, index) => `word${index}`).join(
      ' ',
    );
    const line = `    ${words}`;
    fs.writeFileSync(
      path.join(opened, 'long.txt'),
      ['short', line, 'after'].join(String.fromCharCode(10)),
    );
    const rows = page.locator('.viewer-rows .viewer-row');
    try {
      await select('long');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === 'short',
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      await waitFor(async () => (await rows.count()) > 4, 'the line to wrap');
      const wrapped = await rows.allTextContents();
      assert.strictEqual(wrapped.slice(1, -1).join(''), line);
      assert.strictEqual(wrapped.at(-1), 'after');
      assert.deepStrictEqual(await layout(), {
        fits: true,
        marks: wrapped.slice(2, -1).map(() => true),
        indented: true,
      });
      await page.evaluate(() => {
        const shown = [
          ...document.querySelectorAll('.viewer-rows .viewer-row'),
        ];
        const range = document.createRange();
        range.setStartBefore(shown[1] ?? document.body);
        range.setEnd(shown.at(-1)?.firstChild ?? document.body, 3);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
        window.addEventListener(
          'copy',
          (event) =>
            Reflect.set(
              window,
              'copied',
              event.clipboardData?.getData('text/plain'),
            ),
          { once: true },
        );
      });
      await page.keyboard.press('ControlOrMeta+C');
      assert.strictEqual(
        await page.evaluate((): unknown => Reflect.get(window, 'copied')),
        `${line}${String.fromCharCode(10)}aft`,
      );

      await page.keyboard.press('w');
      await waitFor(async () => (await rows.count()) === 3, 'the line whole');
      const unwrapped = await rows.allTextContents();
      assert.deepStrictEqual(
        [unwrapped[0], line.startsWith(unwrapped[1] ?? '-'), unwrapped[2]],
        ['short', true, 'after'],
      );
      assert.strictEqual((await layout()).fits, false);
      assert.strictEqual(await page.locator('.viewer-break').count(), 0);
      await waitFor(
        () => savedText(profile, 'wordWrap') === false,
        'no wrapping saved',
      );

      await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
      await waitFor(async () => (await rows.count()) > 4, 'the line wrapped');
      await waitFor(
        () => savedText(profile, 'wordWrap') === undefined,
        'the wrapping left to the default',
      );

      const spaces = page.locator('.viewer-rows .spaces');
      const hanging = page.locator('.viewer-rows .viewer-wrap-spaces');
      await waitFor(
        async () => (await spaces.count()) > 0,
        'the spaces drawn, as whitespace is shown by default',
      );
      assert.strictEqual(await dotted(spaces), true);
      assert.strictEqual(await hanging.count(), 0);
      await page.keyboard.press('.');
      await waitFor(
        async () => (await hanging.count()) > 0,
        'only the spaces the rows wrap at marked once whitespace is hidden',
      );
      assert.strictEqual(await dotted(hanging), true);
      assert.strictEqual(await spaces.count(), 0);
      await waitFor(
        () => savedText(profile, 'showWhitespace') === false,
        'whitespace hidden saved',
      );
      assert.strictEqual(savedText(profile, 'wordWrap'), undefined);
      await page.keyboard.press('.');
      await waitFor(
        async () => (await spaces.count()) > 0,
        'the spaces drawn again',
      );
      await waitFor(
        () => savedText(profile, 'showWhitespace') === undefined,
        'whitespace left to the default',
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'long.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('long.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('keeps a line longer than 4 KiB whole in a file viewed, as the diff shows it, on one row without wrapping and wrapped onto rows that each start at a word, rather than broken where the file is read in pieces', async () => {
    const line = `    ${Array.from({ length: 620 }, (_, index) => `word${index}`).join(' ')}`;
    const pieceEnd = 4096 - 'short\n'.length;
    assert.ok(
      line.length > pieceEnd &&
        /\w\w/.test(line.slice(pieceEnd - 1, pieceEnd + 1)),
    );
    fs.writeFileSync(
      path.join(opened, 'longer.txt'),
      ['short', line, 'after'].join(String.fromCharCode(10)),
    );
    const rows = page.locator('.viewer-rows .viewer-row');
    try {
      await select('longer');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === 'short',
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      await page.keyboard.press('End');
      await waitFor(
        async () => (await rows.allTextContents()).at(-1) === 'after',
        'the last row',
      );
      const wrapped = (await rows.allTextContents()).filter(
        (row) => row !== 'short' && row !== 'after',
      );
      assert.ok(wrapped.length > 1, String(wrapped.length));
      assert.deepStrictEqual(
        wrapped.filter((row) => !/^( {4})?word\d+( |$)/.test(row)),
        [],
      );

      await page.keyboard.press('w');
      await page.keyboard.press('Home');
      await waitFor(
        async () => (await firstViewerRow()) === 'short',
        'the first row again',
      );
      const whole = await rows.allTextContents();
      assert.deepStrictEqual(
        [whole.length, whole[0], line.startsWith(whole[1] ?? '-'), whole[2]],
        [3, 'short', true, 'after'],
      );
      await page.keyboard.press('w');
      await waitFor(
        () => savedText(profile, 'wordWrap') === undefined,
        'the wrapping left to the default',
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'longer.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('longer.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('keeps a file viewed with its lines wrapped as wide as the viewer, the runs of spaces hanging past its edge out of sight rather than scrolled to, whether whitespace is shown or not, and back at its left edge once wrapped after scrolling sideways', async () => {
    const padded = `| a${' '.repeat(300)}| b${' '.repeat(300)}|`;
    fs.writeFileSync(
      path.join(opened, 'padded.txt'),
      ['short', padded, ' '.repeat(400), 'after'].join(String.fromCharCode(10)),
    );
    const rows = page.locator('.viewer-rows .viewer-row');
    const sideways = page.locator('.viewer-sideways');
    const overflow = () =>
      sideways.evaluate((element) => ({
        wider: element.scrollWidth > element.clientWidth,
        left: element.scrollLeft,
      }));
    try {
      await select('padded');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === 'short',
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      await waitFor(
        async () => (await rows.count()) > 5,
        'the padded line to wrap',
      );
      await page.locator('.viewer-rows .spaces').first().waitFor();
      assert.deepStrictEqual(await overflow(), { wider: false, left: 0 });
      await page.keyboard.press('.');
      await page
        .locator('.viewer-rows .spaces')
        .first()
        .waitFor({ state: 'detached' });
      assert.deepStrictEqual(await overflow(), { wider: false, left: 0 });
      await page.keyboard.press('.');
      await page.locator('.viewer-rows .spaces').first().waitFor();
      await page.keyboard.press('w');
      await waitFor(
        async () => (await overflow()).wider,
        'the lines whole, wider than the viewer',
      );
      await sideways.evaluate((element) => element.scrollBy({ left: 400 }));
      await waitFor(async () => (await overflow()).left > 0, 'scrolled away');
      await page.keyboard.press('w');
      await waitFor(async () => {
        const { wider, left } = await overflow();
        return !wider && left === 0;
      }, 'the lines wrapped again, from the left edge');
      await waitFor(
        () =>
          savedText(profile, 'showWhitespace') === undefined &&
          savedText(profile, 'wordWrap') === undefined,
        'the choices left to the defaults',
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'padded.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('padded.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('wraps a line of Chinese and emoji in a file viewed by the columns our terminal gives them, as the diff does, so every row ends inside the viewer with its mark after its text, at most past the spaces hanging there, a character in a box ending where its box does, as a glyph drawn narrower is centered in it', async () => {
    const line = `${'中文'.repeat(150)} ${'✅ ok '.repeat(60)}end`;
    fs.writeFileSync(
      path.join(opened, 'chinese.txt'),
      ['short', line, 'after'].join(String.fromCharCode(10)),
    );
    const rows = page.locator('.viewer-rows .viewer-row');
    try {
      await select('chinese');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === 'short',
        'the first row',
      );
      await waitFor(async () => (await rows.count()) > 4, 'the line to wrap');
      const shown = await laidOut();
      assert.deepStrictEqual(
        shown,
        shown.map(() => ({ inside: true, marked: true })),
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'chinese.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('chinese.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('marks the carriage return of each Windows line end of a file viewed once whitespace is shown, as the diff does', async () => {
    fs.writeFileSync(path.join(opened, 'crlf.txt'), 'one\r\ntwo\r\n');
    const returns = page.locator(
      `.viewer-rows .blank[data-glyph="${strings.symbols.carriageReturn}"]`,
    );
    try {
      await select('crlf');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()).startsWith('one'),
        'the first row',
      );
      await waitFor(
        async () => (await returns.count()) === 2,
        'a sign at the end of each line, as whitespace is shown by default',
      );
      await page.keyboard.press('.');
      await waitFor(
        async () => (await returns.count()) === 0,
        'no sign once whitespace is hidden',
      );
      await page.keyboard.press('.');
      await waitFor(
        () => savedText(profile, 'showWhitespace') === undefined,
        'whitespace left to the default',
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'crlf.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('crlf.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('draws a file viewed on the grid of our terminal, an emoji or a Chinese, Japanese or Korean character two columns, an emoji joined from several one too, so text padded for a terminal lines up, a tab stopping on it, and keeps it there while a match found ends inside a character of several code points', async () => {
    fs.writeFileSync(
      path.join(opened, 'grid.txt'),
      gridLines.join(String.fromCharCode(10)),
    );
    const rows = page.locator('.viewer-rows .viewer-row');
    try {
      await select('grid');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === gridRuler,
        'the first row',
      );
      await waitFor(
        async () => (await rows.count()) === gridLines.length,
        'every row',
      );
      assert.deepStrictEqual(
        await rows.evaluateAll(barsOffGrid),
        gridLines.slice(1).map(() => 0),
      );
      await page.keyboard.press('ControlOrMeta+F');
      await waitForFocus(
        page.locator('.viewer .find-field-input'),
        'the search',
      );
      await page.keyboard.type('Cafe');
      await page.locator('.viewer .find-match').first().waitFor();
      assert.deepStrictEqual(
        await rows.evaluateAll(barsOffGrid),
        gridLines.slice(1).map(() => 0),
      );
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
      fs.rmSync(path.join(opened, 'grid.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('grid.txt'),
        'the file to be gone from the list',
      );
    }
  });
});
