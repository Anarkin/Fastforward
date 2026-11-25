import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import {
  copied,
  dragOver,
  cellsOf,
  keepCopied,
  rightOfCell,
  seenDots,
  seenGlyphs,
  seenRows,
  viewerMarks,
} from './cellsSeen';
import { gridLines, gridRuler } from './gridLines';
import { waitForFocus } from './waits';
import { editorLinesSeen } from './editorSeen';
import { writeSettings } from './settingsWritten';
import {
  opened,
  profile,
  page,
  savedText,
  rowNames,
  select,
  sharedCommanderApp,
  wrapLongLines,
} from './commanderAppFixtures';
import { firstViewerRow, rowTexts } from './viewerAppFixtures';

const edge = async () => {
  const body = await page.locator('.viewer-body').boundingBox();
  return body === null ? Number.NaN : body.x + body.width;
};

const breaks = () => seenGlyphs(page, strings.symbols.breaks);

const dots = async () => (await seenDots(page)).length;

const returns = async () =>
  (await seenGlyphs(page, strings.symbols.carriageReturn)).length;

const layout = async () => {
  const seen = await seenRows(page);
  const right = await edge();
  const marks = await Promise.all(
    (await breaks()).map(
      async ({ column }) => (await rightOfCell(page, column)) <= right,
    ),
  );
  return {
    fits: await page
      .locator('.viewer-body')
      .evaluate(
        (body) =>
          (body.querySelector('.viewer-rows')?.getBoundingClientRect().width ??
            Infinity) <=
          body.clientWidth + 0.5,
      ),
    marks,
    indented:
      Math.abs(
        (seen[2]?.left ?? Number.NaN) -
          ((seen[1]?.left ?? 0) + 4 * (seen[1]?.advance ?? 0)),
      ) < 0.5,
  };
};

const laidOut = async () => {
  const seen = await seenRows(page);
  const right = await edge();
  const wide = await seenGlyphs(page, '中');
  const inside = await Promise.all(
    wide.map(
      async ({ column }) =>
        (await rightOfCell(page, column + 1)) <= right + 0.5,
    ),
  );
  const marked = await Promise.all(
    (await breaks()).map(async ({ row, column }) => ({
      inside: (await rightOfCell(page, column)) <= right + 0.5,
      marked: column === seen[row]?.breakAt,
    })),
  );
  return [
    ...inside.map((within) => ({ inside: within, marked: true })),
    ...marked,
  ];
};

const lastBars = async () => {
  const columns: number[] = [];
  for (const { row, column } of await seenGlyphs(page, '|')) {
    columns[row] = Math.max(columns[row] ?? 0, column);
  }
  const [ruler, ...rows] = columns;
  return rows.map((column) => column - (ruler ?? Number.NaN));
};

const barsOf = async () => {
  await waitFor(
    async () => (await lastBars()).length === 1,
    'the bar of the tabbed row',
  );
  return lastBars();
};

const menuOf = async (button: string) => {
  await page.locator(`${button} .menu-button-trigger`).click();
  const menu = page.locator(`${button} .menu`);
  await menu.waitFor();
  return menu;
};

const labelOf = (button: string) =>
  page.locator(`${button} .menu-button-trigger`).textContent();

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
    try {
      await select('long');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === 'short',
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      await wrapLongLines();
      await waitFor(
        async () => (await rowTexts()).length > 4,
        'the line to wrap',
      );
      const wrapped = await rowTexts();
      assert.strictEqual(wrapped.slice(1, -1).join(''), line);
      assert.strictEqual(wrapped.at(-1), 'after');
      assert.deepStrictEqual(await layout(), {
        fits: true,
        marks: wrapped.slice(2, -1).map(() => true),
        indented: true,
      });
      await dragOver(page, [1, 0], [wrapped.length - 1, 3]);
      await keepCopied(page);
      await page.keyboard.press('ControlOrMeta+C');
      assert.strictEqual(
        await copied(page),
        `${line}${String.fromCharCode(10)}aft`,
      );

      await page.keyboard.press('w');
      await waitFor(
        async () => (await rowTexts()).length === 3,
        'the line whole',
      );
      const unwrapped = await rowTexts();
      assert.deepStrictEqual(
        [unwrapped[0], line.startsWith(unwrapped[1] ?? '-'), unwrapped[2]],
        ['short', true, 'after'],
      );
      assert.strictEqual((await layout()).fits, false);
      assert.deepStrictEqual(await breaks(), []);
      await waitFor(
        () => savedText(profile, 'wordWrap') === undefined,
        'the wrapping left to the default',
      );

      await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
      await waitFor(
        async () => (await rowTexts()).length > 4,
        'the line wrapped',
      );
      await waitFor(
        () => savedText(profile, 'wordWrap') === true,
        'the wrapping saved',
      );

      const every = line.split(' ').length - 1;
      await waitFor(
        async () => (await seenDots(page)).length === every,
        'every space dotted, as whitespace is shown by default',
      );
      await page.keyboard.press('.');
      const wraps = (await breaks()).length;
      await waitFor(
        async () => (await seenDots(page)).length === wraps,
        'only the spaces the rows wrap at marked once whitespace is hidden',
      );
      await waitFor(
        () => savedText(profile, 'showWhitespace') === false,
        'whitespace hidden saved',
      );
      assert.strictEqual(savedText(profile, 'wordWrap'), true);
      await page.keyboard.press('.');
      await waitFor(
        async () => (await seenDots(page)).length === every,
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
    try {
      await select('longer');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === 'short',
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      await wrapLongLines();
      await page.keyboard.press('End');
      await waitFor(
        async () => (await rowTexts()).at(-1) === 'after',
        'the last row',
      );
      const wrapped = (await rowTexts()).filter(
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
      const whole = await rowTexts();
      assert.deepStrictEqual(
        [whole.length, whole[0], line.startsWith(whole[1] ?? '-'), whole[2]],
        [3, 'short', true, 'after'],
      );
      await page.keyboard.press('w');
      await waitFor(
        () => savedText(profile, 'wordWrap') === true,
        'the wrapping saved',
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
      await wrapLongLines();
      await waitFor(
        async () => (await rowTexts()).length > 5,
        'the padded line to wrap',
      );
      await waitFor(async () => (await dots()) > 0, 'the spaces dotted');
      const shown = await dots();
      assert.deepStrictEqual(await overflow(), { wider: false, left: 0 });
      await page.keyboard.press('.');
      await waitFor(async () => (await dots()) < shown, 'whitespace hidden');
      assert.deepStrictEqual(await overflow(), { wider: false, left: 0 });
      await page.keyboard.press('.');
      await waitFor(
        async () => (await dots()) === shown,
        'the spaces dotted again',
      );
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
          savedText(profile, 'wordWrap') === true,
        'whitespace left to the default and the wrapping saved',
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
    try {
      await select('chinese');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === 'short',
        'the first row',
      );
      await wrapLongLines();
      await waitFor(
        async () => (await rowTexts()).length > 4,
        'the line to wrap',
      );
      await waitFor(async () => (await breaks()).length > 2, 'its breaks');
      const shown = await laidOut();
      assert.ok(shown.length > 150, String(shown.length));
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
    try {
      await select('crlf');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()).startsWith('one'),
        'the first row',
      );
      await waitFor(
        async () => (await returns()) === 2,
        'a sign at the end of each line, as whitespace is shown by default',
      );
      await page.keyboard.press('.');
      await waitFor(
        async () => (await returns()) === 0,
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
    try {
      await select('grid');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === gridRuler,
        'the first row',
      );
      await waitFor(
        async () => (await rowTexts()).length === gridLines.length,
        'every row',
      );
      await waitFor(
        async () => (await lastBars()).length === gridLines.length - 1,
        'the bar of every row drawn',
      );
      assert.deepStrictEqual(
        await lastBars(),
        gridLines.slice(1).map(() => 0),
      );
      await page.keyboard.press('ControlOrMeta+F');
      await waitForFocus(
        page.locator('.viewer .search-box-input'),
        'the search',
      );
      await page.keyboard.type('Cafe');
      await waitFor(
        async () => (await viewerMarks(page)).length > 0,
        'the match marked',
      );
      assert.deepStrictEqual(
        await lastBars(),
        gridLines.slice(1).map(() => 0),
      );
    } finally {
      if (await page.locator('.viewer .search-box').isVisible()) {
        await page.keyboard.press('Escape');
        await page
          .locator('.viewer .search-box')
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

  test('draws a tab to the next stop of the tab size of the settings, 4 columns by default and as many as text.tabSize says, the page laying it out anew once the settings are saved', async () => {
    const file = path.join(profile, 'settings.user.json');
    const saved = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{}';
    const settings: { text?: object } = JSON.parse(saved);
    fs.writeFileSync(
      path.join(opened, 'tabbed.txt'),
      ['        |', String.fromCharCode(9) + '|'].join(String.fromCharCode(10)),
    );
    try {
      await select('tabbed');
      await page.keyboard.press('F3');
      const byDefault = await barsOf();
      await writeSettings(page, profile, {
        ...settings,
        text: { ...settings.text, tabSize: 8 },
      });
      const set = await barsOf();
      assert.deepStrictEqual({ byDefault, set }, { byDefault: [-4], set: [0] });
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      await writeSettings(page, profile, JSON.parse(saved));
      fs.rmSync(path.join(opened, 'tabbed.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('tabbed.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('draws a tab as wide as tab_width of the .editorconfig of the file, over the tab size of the settings, in the viewer and in the editor alike', async () => {
    const config = path.join(opened, '.editorconfig');
    fs.writeFileSync(
      config,
      ['[*.tsv]', 'tab_width = 8', ''].join(String.fromCharCode(10)),
    );
    fs.writeFileSync(
      path.join(opened, 'wide.tsv'),
      ['        |', String.fromCharCode(9) + '|'].join(String.fromCharCode(10)),
    );
    try {
      await select('wide');
      await page.keyboard.press('F3');
      const viewed = await barsOf();
      await page.keyboard.press('F4');
      const edited = cellsOf(page, '.editor .editor-cells');
      await waitFor(
        async () => (await edited.glyphs('|')).length === 2,
        'the bars in the editor',
      );
      const columns = (await edited.glyphs('|')).map(({ column }) => column);
      assert.deepStrictEqual(
        { viewed, edited: columns },
        { viewed: [0], edited: [8, 8] },
      );
    } finally {
      for (const shown of ['.editor', '.viewer']) {
        if (await page.locator(shown).isVisible()) {
          await page.keyboard.press('Escape');
          await page.locator(shown).waitFor({ state: 'detached' });
        }
      }
      fs.rmSync(config);
      fs.rmSync(path.join(opened, 'wide.tsv'));
      await waitFor(
        async () => !(await rowNames()).includes('wide.tsv'),
        'the file to be gone from the list',
      );
    }
  });

  test('tells in a menu of the viewer and of the editor how wide a tab is drawn and where from, and converts the indentation of the editor to spaces by the tab stops', async () => {
    const tab = String.fromCharCode(9);
    fs.writeFileSync(
      path.join(opened, 'tabs.txt'),
      ['        |', tab + '|', tab + 'a', tab + 'b'].join(
        String.fromCharCode(10),
      ),
    );
    try {
      await select('tabs');
      await page.keyboard.press('F3');
      const before = await barsOf();
      const viewerLabel = await labelOf('.viewer-tab-size');
      const viewerMenu = await menuOf('.viewer-tab-size');
      const viewerRows = (
        await viewerMenu.locator('.menu-item').allTextContents()
      ).map((row) => row.replace('✓', '').trim());
      await page.keyboard.press('Escape');
      await viewerMenu.waitFor({ state: 'detached' });
      await page.keyboard.press('F4');
      await page.locator('.editor .editor-indentation').waitFor();
      const editorLabel = await labelOf('.editor-indentation');
      const editorMenu = await menuOf('.editor-indentation');
      const rows = (
        await editorMenu.locator('.menu-item').allTextContents()
      ).map((row) => row.replace('✓', '').trim());
      await editorMenu
        .locator('.menu-item', { hasText: 'Convert indentation to spaces' })
        .click();
      await waitFor(
        async () => (await editorLinesSeen(page))[1]?.text === '    |',
        'the tab converted to spaces',
      );
      await page.keyboard.press('ControlOrMeta+Z');
      await waitFor(
        async () => (await editorLinesSeen(page))[1]?.text === tab + '|',
        'the conversion undone',
      );
      assert.deepStrictEqual(
        {
          before,
          viewerLabel,
          viewerRows,
          editorLabel,
          rows: rows.filter(
            (row) =>
              row.startsWith('A tab') ||
              row.startsWith('No .editorconfig') ||
              row.includes('text.tabSize'),
          ),
        },
        {
          before: [-4],
          viewerLabel: 'Tab Size: 4',
          viewerRows: [
            'Tab width rules:',
            'No .editorconfig sets tab_width or indent_size',
            '4 columns, from text.tabSize in the settings',
          ],
          editorLabel: 'Tab Size: 4',
          rows: [
            'No .editorconfig sets indent_style or indent_size',
            'A tab, as most indented lines of the file start with one',
            'No .editorconfig sets tab_width or indent_size',
            '4 columns, from text.tabSize in the settings',
          ],
        },
      );
    } finally {
      for (const shown of ['.editor', '.viewer']) {
        if (await page.locator(shown).isVisible()) {
          await page.keyboard.press('Escape');
          await page.locator(shown).waitFor({ state: 'detached' });
        }
      }
      fs.rmSync(path.join(opened, 'tabs.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('tabs.txt'),
        'the file to be gone from the list',
      );
    }
  });
});
