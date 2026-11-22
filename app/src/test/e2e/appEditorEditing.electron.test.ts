import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { assertFillsRows } from './markRows';
import { barOf, barParts } from './scrollbarsShown';
import {
  opened,
  profile,
  page,
  right,
  content,
  activeTab,
  editedText,
  backToCommander,
  edit,
  toStart,
  cursorLine,
  sharedEditorApp,
} from './editorAppFixtures';
import { writeSettings } from './settingsWritten';
import { untilSettled } from './waits';
import { strings } from '../../lib/shared/strings';

const status = () => page.locator('.editor .column-status-text').textContent();

const shows = (column: number, selected = 0) =>
  [
    strings.editor.column(column),
    ...(selected > 0 ? [strings.editor.selected(selected)] : []),
  ].join(strings.editor.between);

const reaches = async (
  key: string,
  columns: readonly number[],
  selected = 0,
) => {
  for (const column of columns) {
    await page.keyboard.press(key);
    await waitFor(
      async () => (await status()) === shows(column, selected),
      `${key} to column ${column}`,
      3000,
    );
  }
};

const occurrencesMarked = async () =>
  (await content().locator('.occurrence-match').allTextContents()).join();

const bracketAndCursor = async () => {
  const [bracket = [], cursor = []] = await page.evaluate(() =>
    ['.editor .cm-line .cm-matchingBracket', '.editor .cm-cursor-primary'].map(
      (selector) => {
        const box = document.querySelector(selector)?.getBoundingClientRect();
        return box === undefined
          ? []
          : [box.left, box.top, box.right, box.bottom].map((edge) =>
              Math.round(Math.round(edge * devicePixelRatio * 64) / 64),
            );
      },
    ),
  );
  return { bracket, cursor };
};

const shownWhole = () =>
  page.locator('.editor .cm-scroller').evaluate((scroller) => {
    const top = scroller.getBoundingClientRect().top;
    const bottom = top + scroller.clientHeight;
    const match = scroller.querySelector('.find-match.current');
    const rect = match?.getBoundingClientRect();
    const row = parseFloat(getComputedStyle(scroller).lineHeight);
    return {
      match: match?.textContent ?? '',
      whole:
        rect !== undefined &&
        rect.top >= top - 0.5 &&
        rect.bottom <= bottom + 0.5,
      onRows:
        Math.abs(
          scroller.scrollTop / row - Math.round(scroller.scrollTop / row),
        ) < 0.01,
    };
  });

suite('App editor', () => {
  sharedEditorApp();

  test('indents on Tab, comments a line out on Ctrl+K, moves it on Alt+Down, goes to a line on Ctrl+G and types at every occurrence Ctrl+D selected, telling the column and cursors below', async () => {
    fs.writeFileSync(path.join(opened, 'keys.ts'), 'let a = 1;\nlet b = 2;\n');
    await backToCommander();
    await waitFor(
      async () =>
        (await right().locator('.commander-row', { hasText: 'keys' }).count()) >
        0,
      'the file listed',
    );
    await edit('keys.ts');
    await waitFor(
      async () => (await editedText()).startsWith('let a'),
      'the text',
    );
    await toStart();
    await waitFor(
      async () =>
        (await status()) === 'Col 1' && (await cursorLine()) === 'let a = 1;',
      'the place',
    );
    await page.keyboard.press('Tab');
    await waitFor(async () => (await status()) === 'Col 5', 'the indent');
    await page.keyboard.press('ControlOrMeta+K');
    await page.keyboard.press('Alt+ArrowDown');
    await waitFor(
      async () => (await editedText()) === 'let b = 2;\n    // let a = 1;\n',
      'the line commented out and moved down',
    );
    await page.keyboard.press('Control+G');
    const prompt = page.locator('.prompt-input');
    await prompt.waitFor();
    await prompt.fill('1');
    await prompt.press('Enter');
    await waitFor(
      async () =>
        (await status()) === 'Col 1' && (await cursorLine()) === 'let b = 2;',
      'line 1',
    );
    await page.keyboard.press('ControlOrMeta+D');
    await page.keyboard.press('ControlOrMeta+D');
    await waitFor(
      async () => (await status())?.includes('2 cursors') === true,
      'two cursors',
    );
    await page.keyboard.type('const');
    await waitFor(
      async () =>
        (await editedText()) === 'const b = 2;\n    // const a = 1;\n',
      'both occurrences typed over',
    );
    await page.keyboard.press('Escape');
    await waitFor(
      async () => (await status())?.includes('cursors') === false,
      'one cursor',
    );
  });

  test('finds the text typed on Ctrl+F, marking a match on the very rows of device pixels the selection of it fills, going to the next match on Enter, and replaces every match on Ctrl+H', async () => {
    fs.writeFileSync(path.join(opened, 'find.txt'), 'one two one\nthree one\n');
    await backToCommander();
    await waitFor(
      async () =>
        (await right().locator('.commander-row', { hasText: 'find' }).count()) >
        0,
      'the file listed',
    );
    await edit('find.txt');
    await waitFor(
      async () => (await editedText()).startsWith('one'),
      'the text',
    );
    await toStart();
    await page.keyboard.press('ControlOrMeta+F');
    const field = page.locator('.editor .search-box .search-box-input');
    await field.waitFor();
    await field.fill('one');
    const count = page.locator('.editor .search-count');
    await waitFor(
      async () => (await count.textContent()) === '1 of 3',
      'the first match',
    );
    await assertFillsRows(
      content().locator('.find-match.current'),
      '.editor .cm-selectionBackground',
    );
    await field.press('Enter');
    await waitFor(
      async () => (await count.textContent()) === '2 of 3',
      'the next match',
    );
    assert.strictEqual(await content().locator('.find-match').count(), 3);
    await field.press('Control+H');
    const replacing = page.locator('.editor-replace-input');
    await replacing.waitFor();
    await replacing.fill('ONE');
    await page
      .locator('.editor-replace .confirm-button', { hasText: 'Replace All' })
      .click();
    await waitFor(
      async () => (await editedText()) === 'ONE two ONE\nthree ONE\n',
      'every match replaced',
    );
    await field.press('Escape');
    await page
      .locator('.editor .search-box .search-box-input')
      .waitFor({ state: 'detached' });
  });

  test('shows each match whole as Enter goes from match to match, below the rows shown and back to the first, on whole rows, a match ending where a line may break too', async () => {
    const lines = Array.from({ length: 600 }, (_, at) => `line ${at + 1}`);
    for (const at of [39, 40, 299, 300, 564, 565]) {
      lines[at] = `  "cursor": "needle(--color-${at + 1})",`;
    }
    fs.writeFileSync(path.join(opened, 'needles.txt'), `${lines.join('\n')}\n`);
    await backToCommander();
    await waitFor(
      async () =>
        (await right()
          .locator('.commander-row', { hasText: 'needles' })
          .count()) > 0,
      'the file listed',
    );
    await edit('needles.txt');
    await waitFor(
      async () => (await editedText()).startsWith('line 1\n'),
      'the text',
    );
    await toStart();
    await page.keyboard.press('ControlOrMeta+F');
    const field = page.locator('.editor .search-box .search-box-input');
    await field.waitFor();
    await field.fill('needle');
    const count = page.locator('.editor .search-count');
    await waitFor(
      async () => (await count.textContent()) === '1 of 6',
      'the first match',
    );
    const wrong: string[] = [];
    for (let press = 1; press <= 8; press++) {
      await field.press('Enter');
      await waitFor(
        async () => (await count.textContent()) === `${(press % 6) + 1} of 6`,
        `match ${(press % 6) + 1}`,
      );
      let last = '';
      let shown = await shownWhole();
      await waitFor(async () => {
        shown = await shownWhole();
        const now = JSON.stringify(shown);
        const settled = now === last;
        last = now;
        await new Promise((resolve) => setTimeout(resolve, 150));
        return settled;
      }, 'the text to stop scrolling');
      if (!shown.whole || !shown.onRows) {
        wrong.push(`${(press % 6) + 1}: ${JSON.stringify(shown)}`);
      }
    }
    assert.deepStrictEqual(wrong, []);
  });

  test('closes the brackets and quotes typed once the settings say so, and types them alone otherwise', async () => {
    const settings = path.join(profile, 'settings.user.json');
    const before = fs.readFileSync(settings, 'utf8');
    fs.writeFileSync(path.join(opened, 'closing.txt'), '\n');
    await backToCommander();
    await edit('closing.txt');
    await toStart();
    await page.keyboard.type('a(');
    await waitFor(async () => (await editedText()) === 'a(\n', 'one bracket');
    await page.keyboard.press('ControlOrMeta+Z');
    await waitFor(async () => (await editedText()) === '\n', 'undone');
    try {
      await writeSettings(page, profile, {
        scrolling: { smooth: true },
        tools: { editor: { closeBrackets: true } },
      });
      await content().waitFor();
      await toStart();
      await page.keyboard.type('f([');
      await waitFor(
        async () => (await editedText()) === 'f([])\n',
        'the brackets closed',
      );
      await page.keyboard.type('])');
      await waitFor(
        async () => (await editedText()) === 'f([])\n',
        'the closing brackets typed over',
      );
      await page.keyboard.press('ControlOrMeta+S');
      await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    } finally {
      await writeSettings(page, profile, Object(JSON.parse(before)));
      await content().waitFor();
    }
  });

  test('leaves a line of thousands of characters as drawn while the cursor moves and text is typed in other lines, and draws its end once the cursor goes there, as CodeMirror drew the end of every such line above the cursor whenever the cursor was scrolled to, and its start again right after, a thousand elements of one line made twice a key', async () => {
    const end = 'the end of the wide line';
    const wide = `the start ${Array.from({ length: 900 }, (_, at) => `word${at}`).join(' ')} ${end}`;
    const lines = [
      wide,
      ...Array.from({ length: 60 }, (_, at) => `narrow ${at + 1}`),
    ];
    fs.writeFileSync(path.join(opened, 'wide.txt'), `${lines.join('\n')}\n`);
    await backToCommander();
    await edit('wide.txt');
    await waitFor(
      async () => (await editedText()).includes('\nnarrow 1\n'),
      'the text',
    );
    await toStart();
    for (let row = 0; row < 10; row++) {
      await page.keyboard.press('ArrowDown');
    }
    await waitFor(
      async () => (await cursorLine()) === 'narrow 10',
      'the cursor in a narrow line',
    );
    const wideLine = page.locator('.editor .cm-line').first();
    const drawn = await untilSettled(
      () => wideLine.evaluate((line) => line.textContent ?? ''),
      'the wide line drawn',
    );
    assert.ok(drawn.startsWith('the start word0 '), drawn.slice(0, 40));
    assert.ok(drawn.length < wide.length, 'part of the wide line left undrawn');
    await wideLine.evaluate((line) => {
      const changes = { count: 0 };
      Reflect.set(window, 'wideLineChanges', changes);
      new MutationObserver((seen) => {
        changes.count += seen.length;
      }).observe(line, { childList: true, subtree: true, characterData: true });
    });
    for (let row = 0; row < 4; row++) {
      await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.type('typed');
    await waitFor(
      async () => (await cursorLine()) === 'typednarrow 14',
      'the text typed in a narrow line',
    );
    const changes = await untilSettled(
      () =>
        page.evaluate((): unknown => Reflect.get(window, 'wideLineChanges')),
      'the wide line to rest',
    );
    assert.deepStrictEqual(changes, { count: 0 });
    assert.strictEqual(
      await wideLine.evaluate((line) => line.textContent ?? ''),
      drawn,
    );

    for (let key = 0; key < 'typed'.length; key++) {
      await page.keyboard.press('ControlOrMeta+Z');
    }
    await waitFor(
      async () => (await cursorLine()) === 'narrow 14',
      'the typing undone',
    );
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('End');
    await waitFor(
      async () =>
        (await wideLine.evaluate((line) => line.textContent ?? '')).endsWith(
          end,
        ),
      'the end of the wide line drawn',
    );
  });

  test('moves the cursor itself a character or a word left or right and to the start of the row, selecting with Shift, over the places a wrapped line may break, where the caret of the browser stood still, as right before an opening bracket', async () => {
    const settings = path.join(profile, 'settings.user.json');
    const before = fs.readFileSync(settings, 'utf8');
    const line = 'value.Func<T>(); a(b);';
    fs.writeFileSync(path.join(opened, 'breaks.txt'), `${line}\n`);
    try {
      await writeSettings(page, profile, {
        scrolling: { smooth: true },
        text: { wordWrap: true },
      });
      await backToCommander();
      await edit('breaks.txt');
      await waitFor(
        async () => (await editedText()) === `${line}\n`,
        'the text',
      );
      await content().locator('.cm-line').first().click();
      await reaches('End', [23]);
      await reaches(
        'ArrowLeft',
        Array.from({ length: 22 }, (_, at) => 22 - at),
      );
      await reaches(
        'ArrowRight',
        Array.from({ length: 22 }, (_, at) => at + 2),
      );
      await reaches('Control+ArrowLeft', [21, 20, 19, 18, 13, 12, 11, 7, 6, 1]);
      await reaches('Control+ArrowRight', [6, 7, 11, 12, 13, 17, 19]);
      await reaches('Home', [1]);
      await reaches('Control+ArrowRight', [6, 7, 11, 12, 13, 17, 19]);
      await reaches('Shift+ArrowLeft', [18], 1);
      await reaches('ArrowRight', [19]);
      await reaches('Control+Shift+ArrowLeft', [18], 1);
      await reaches('ArrowRight', [19]);
      await reaches('Shift+Home', [1], 18);
    } finally {
      await writeSettings(page, profile, Object(JSON.parse(before)));
      await content().waitFor();
    }
  });

  test('marks the bracket matching the one beside the cursor, and nothing beside one that matches none', async () => {
    fs.writeFileSync(path.join(opened, 'brackets.txt'), 'call(a[0])\nopen(\n');
    await backToCommander();
    await edit('brackets.txt');
    await waitFor(
      async () => (await editedText()) === 'call(a[0])\nopen(\n',
      'the text',
    );
    await content().locator('.cm-line').first().click();
    await page.keyboard.press('End');
    await waitFor(
      async () =>
        (await content().locator('.cm-matchingBracket').allTextContents()).join(
          '',
        ) === '()',
      'the brackets around the call matched',
    );
    await content().locator('.cm-line').nth(1).click();
    await page.keyboard.press('End');
    await waitFor(
      async () =>
        (await content().locator('.cm-matchingBracket').count()) === 0,
      'the brackets of the call no longer marked',
    );
    assert.strictEqual(
      await content().locator('.cm-nonmatchingBracket').count(),
      0,
      'a bracket matching none marked',
    );
  });

  test('marks a matched bracket on the very box of the cursor standing on it, on the yellow of a find match see-through at the share the theme gives the marks the editor makes on its own, its text in the color its syntax gives it, so the cursor covers the mark whole and a bracket in the first column is marked whole, as the outline it had stood a pixel out on every side of its text', async () => {
    fs.writeFileSync(path.join(opened, 'block.json'), '{\n}\n');
    await backToCommander();
    await edit('block.json');
    await waitFor(async () => (await editedText()) === '{\n}\n', 'the text');
    await content()
      .locator('.cm-line[class*="syntax-"], .cm-line [class^="syntax-"]')
      .first()
      .waitFor();
    await content().locator('.cm-line').first().click();
    await page.keyboard.press('Home');
    let seen = await bracketAndCursor();
    await waitFor(
      async () => {
        seen = await bracketAndCursor();
        return (
          seen.bracket.length === 4 &&
          seen.bracket.join() === seen.cursor.join()
        );
      },
      'the bracket marked on the box of the cursor',
      3000,
    ).catch(() => undefined);
    assert.deepStrictEqual(seen.bracket, seen.cursor, JSON.stringify(seen));
    const colors = await page.evaluate(() => {
      const mark = document.querySelector(
        '.editor .cm-line .cm-matchingBracket',
      );
      let glyph = mark;
      while (glyph?.firstElementChild) {
        glyph = glyph.firstElementChild;
      }
      const unmarked = document.createElement('span');
      unmarked.className = glyph?.className ?? '';
      const implicit = document.createElement('span');
      implicit.style.background =
        'color-mix(in srgb, var(--color-search-match) var(--color-search-match-implicit), transparent)';
      mark?.parentElement?.append(unmarked, implicit);
      const wanted = {
        glyph: getComputedStyle(unmarked).color,
        background: getComputedStyle(implicit).backgroundColor,
      };
      unmarked.remove();
      implicit.remove();
      return {
        seen: {
          glyph: glyph === null ? '' : getComputedStyle(glyph).color,
          background:
            mark === null ? '' : getComputedStyle(mark).backgroundColor,
        },
        wanted,
      };
    });
    assert.deepStrictEqual(colors.seen, colors.wanted);
    assert.notStrictEqual(colors.wanted.background, 'rgba(0, 0, 0, 0)');
  });

  test('marks every whole word of the word the cursor is in and every other copy of the text selected, as it marks a matched bracket, the text keeping its color, and nothing once the text is typed until the cursor moves', async () => {
    const words = 'total subtotal total Total\n';
    fs.writeFileSync(path.join(opened, 'words.txt'), words);
    await backToCommander();
    await edit('words.txt');
    await waitFor(async () => (await editedText()) === words, 'the text');
    await content().locator('.cm-line').first().click();
    await page.keyboard.press('Home');
    await waitFor(
      async () => (await occurrencesMarked()) === 'total,total',
      'the whole words of the word at the cursor marked',
    );
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await waitFor(
      async () => (await occurrencesMarked()) === 'tot,tot',
      'the other copies of the text selected marked',
    );
    const looks = await page.evaluate(() => {
      const mark = document.querySelector('.editor .cm-line .occurrence-match');
      const line = mark?.closest('.cm-line');
      const implicit = document.createElement('span');
      implicit.style.background =
        'color-mix(in srgb, var(--color-search-match) var(--color-search-match-implicit), transparent)';
      line?.append(implicit);
      const wanted = {
        color:
          line === null || line === undefined
            ? ''
            : getComputedStyle(line).color,
        background: getComputedStyle(implicit).backgroundColor,
      };
      implicit.remove();
      return {
        seen: {
          color: mark === null ? '' : getComputedStyle(mark).color,
          background:
            mark === null ? '' : getComputedStyle(mark).backgroundColor,
        },
        wanted,
      };
    });
    assert.deepStrictEqual(looks.seen, looks.wanted);
    await page.keyboard.type('x');
    await waitFor(
      async () => (await occurrencesMarked()) === '',
      'nothing marked once the text is typed',
    );
    await page.keyboard.press('ArrowLeft');
    await waitFor(
      async () => (await occurrencesMarked()) === 'xal',
      'the word at the cursor marked once the cursor moves',
    );
  });

  test('draws the lines in sight and only a few around them while its scrollbar is dragged by more than a view at a step, and as many around them as CodeMirror draws once it is dragged slowly and once it is let go', async () => {
    fs.writeFileSync(
      path.join(opened, 'tall.txt'),
      Array.from({ length: 3000 }, (_, index) => `line ${index}`).join('\n'),
    );
    await backToCommander();
    await edit('tall.txt');
    await content().locator('.cm-line').first().waitFor();
    const scroller = '.editor .cm-scroller';
    const seen = () =>
      page.evaluate((selector) => {
        const view = document.querySelector(selector);
        const lines = view?.querySelectorAll('.cm-line');
        const height = lines?.[0]?.getBoundingClientRect().height ?? 0;
        const room = view?.clientHeight ?? 0;
        return {
          drawn: lines?.length ?? 0,
          inSight: height > 0 ? Math.ceil(room / height) : 0,
          room,
          scrolls: (view?.scrollHeight ?? 0) - room,
        };
      }, scroller);
    const { box } = await barOf(page, scroller, 'vertical');
    const { thumb, start, end } = await barParts(page, box, 'vertical');
    assert.ok(thumb, 'the scrollbar of the editor has no thumb');
    const { room, scrolls } = await seen();
    const scrolledByPixel =
      scrolls / (box.height - start.height - end.height - thumb.height);
    const quick = Math.ceil((2 * room) / scrolledByPixel);
    const slow = Math.max(1, Math.floor(100 / scrolledByPixel));
    const across = thumb.left + thumb.width / 2;
    let down = thumb.top + thumb.height / 2;
    const dragBy = async (pixels: number) => {
      down += pixels;
      await page.mouse.move(across, down);
    };
    const draws = (around: 'few' | 'many', when: string) =>
      waitFor(async () => {
        const { drawn, inSight } = await seen();
        return around === 'few'
          ? drawn > 0 && drawn <= inSight + 14
          : drawn >= inSight + 40;
      }, `${around} lines around those in sight ${when}`).catch(
        async (error: unknown) => {
          throw new Error(JSON.stringify(await seen()), { cause: error });
        },
      );
    await page.mouse.move(across, down);
    await page.mouse.down();
    try {
      await dragBy(quick);
      await dragBy(quick);
      await draws('few', 'while dragged quickly');
      for (let step = 0; step < 6; step++) {
        await dragBy(slow);
      }
      await draws('many', 'once dragged slowly');
      await dragBy(quick);
      await draws('few', 'once dragged quickly again');
    } finally {
      await page.mouse.up();
    }
    await draws('many', 'once let go');
  });
});
