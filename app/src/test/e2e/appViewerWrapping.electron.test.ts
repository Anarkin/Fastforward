import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import { barsOffGrid, gridLines, gridRuler, waitForFocus } from './appFixtures';
import {
  opened,
  profile,
  page,
  dotted,
  savedText,
  rowNames,
  firstViewerRow,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';

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
