import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { editorMarked, editorRowsSeen, untilEditorLine } from './editorSeen';
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
  clickRow,
  cursorLine,
  sharedEditorApp,
} from './editorAppFixtures';
import { writeSettings } from './settingsWritten';
import { untilSettled } from './waits';
import { strings } from '../../lib/shared/strings';
import { linesCount } from './commanderRows';

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
  (await editorMarked(page, 'occurrence')).join();

const markedRow = async (named: 'current' | 'occurrence') => {
  const row = (await editorRowsSeen(page)).find(({ marks }) =>
    marks.some(({ name }) => name === named),
  );
  return { row, mark: row?.marks.find(({ name }) => name === named) };
};

const bracketAndCursor = async () => {
  const { row, mark } = await markedRow('occurrence');
  const ratio = await page.evaluate(() => devicePixelRatio);
  const onPixels = (edges: readonly number[]) =>
    edges.map((edge) => Math.round(Math.round(edge * ratio * 64) / 64));
  return {
    bracket:
      row === undefined || mark === undefined
        ? []
        : onPixels([
            row.left + mark.from * row.advance,
            row.top,
            row.left + mark.to * row.advance,
            row.top + row.height,
          ]),
    cursor: onPixels(
      await page.evaluate(() => {
        const box = document
          .querySelector('.editor .editor-cursor-primary')
          ?.getBoundingClientRect();
        return box === undefined
          ? []
          : [box.left, box.top, box.right, box.bottom];
      }),
    ),
  };
};

const shownWhole = async () => {
  const view = await page
    .locator('.editor .editor-scroller')
    .evaluate((scroller) => {
      const top = scroller.getBoundingClientRect().top;
      return {
        top,
        bottom: top + scroller.clientHeight,
        at: scroller.scrollTop,
        row: parseFloat(getComputedStyle(scroller).lineHeight),
      };
    });
  const { row, mark } = await markedRow('current');
  return {
    at: view.at,
    match:
      row === undefined || mark === undefined
        ? ''
        : row.text.slice(mark.from, mark.to),
    whole:
      row !== undefined &&
      row.top >= view.top - 0.5 &&
      row.top + row.height <= view.bottom + 0.5,
    onRows:
      Math.abs(view.at / view.row - Math.round(view.at / view.row)) < 0.01,
  };
};

suite('App editor', () => {
  sharedEditorApp();

  test('indents on Tab, comments a line out on Ctrl+K, moves it on Alt+Down, goes to a line on Ctrl+G and types at every occurrence Ctrl+D selected, telling the column and cursors below', async () => {
    fs.writeFileSync(path.join(opened, 'keys.ts'), 'let a = 1;\nlet b = 2;\n');
    await backToCommander();
    await waitFor(
      async () => (await linesCount(right(), 'keys')) > 0,
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

  test('finds the text typed on Ctrl+F, marking every match and the one the search is at apart from the others, going to the next match on Enter, and replaces every match on Ctrl+H', async () => {
    fs.writeFileSync(path.join(opened, 'find.txt'), 'one two one\nthree one\n');
    await backToCommander();
    await waitFor(
      async () => (await linesCount(right(), 'find')) > 0,
      'the file listed',
    );
    await edit('find.txt');
    await waitFor(
      async () => (await editedText()).startsWith('one'),
      'the text',
    );
    await toStart();
    await page.keyboard.press('ControlOrMeta+F');
    const field = page.locator(
      '.editor .search-box-input:not(.editor-replace-input)',
    );
    await field.waitFor();
    await field.fill('one');
    const count = page.locator('.editor .search-count');
    await waitFor(
      async () => (await count.textContent()) === '1 of 3',
      'the first match',
    );
    await waitFor(
      async () => (await editorMarked(page, 'current')).join() === 'one',
      'the match the search is at marked',
    );
    await field.press('Enter');
    await waitFor(
      async () => (await count.textContent()) === '2 of 3',
      'the next match',
    );
    assert.deepStrictEqual(
      [await editorMarked(page, 'current'), await editorMarked(page, 'match')],
      [['one'], ['one', 'one']],
    );
    await field.press('Control+H');
    const replacing = page.locator('.editor-replace-input');
    await replacing.waitFor();
    await replacing.fill('ONE');
    await page
      .locator('.replace-bar .nav-button[data-tip="Replace All"]')
      .click();
    await waitFor(
      async () => (await editedText()) === 'ONE two ONE\nthree ONE\n',
      'every match replaced',
    );
    await field.press('Escape');
    await page
      .locator('.editor .search-box-input:not(.editor-replace-input)')
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
      async () => (await linesCount(right(), 'needles')) > 0,
      'the file listed',
    );
    await edit('needles.txt');
    await waitFor(
      async () => (await editedText()).startsWith('line 1\n'),
      'the text',
    );
    await toStart();
    await page.keyboard.press('ControlOrMeta+F');
    const field = page.locator(
      '.editor .search-box-input:not(.editor-replace-input)',
    );
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
      const shown = await untilSettled(
        shownWhole,
        'the text to stop scrolling',
      );
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
      await clickRow(0);
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
    await clickRow(0);
    await page.keyboard.press('End');
    await waitFor(
      async () => (await editorMarked(page, 'occurrence')).join('') === '()',
      'the brackets around the call matched',
    );
    await clickRow(1);
    await page.keyboard.press('End');
    await waitFor(
      async () => (await editorMarked(page, 'occurrence')).length === 0,
      'the brackets of the call no longer marked, nor the bracket that matches none',
    );
  });

  test('marks a matched bracket on the very box of the cursor standing on it, so the cursor covers the mark whole and a bracket in the first column is marked whole, as the outline it had stood a pixel out on every side of its text', async () => {
    fs.writeFileSync(path.join(opened, 'block.json'), '{\n}\n');
    await backToCommander();
    await edit('block.json');
    await waitFor(async () => (await editedText()) === '{\n}\n', 'the text');
    await untilEditorLine(
      page,
      ({ kinds }) => Object.keys(kinds).some((kind) => kind !== 'plain'),
      'the code colored',
    );
    await clickRow(0);
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
  });

  test('marks every whole word of the word the cursor is in and every other copy of the text selected, as it marks a matched bracket, only while the editor has the focus, and nothing once the text is typed until the cursor moves', async () => {
    const words = 'total subtotal total Total\n';
    fs.writeFileSync(path.join(opened, 'words.txt'), words);
    await backToCommander();
    await edit('words.txt');
    await waitFor(async () => (await editedText()) === words, 'the text');
    await clickRow(0);
    await page.keyboard.press('Home');
    await waitFor(
      async () => (await occurrencesMarked()) === 'total,total',
      'the whole words of the word at the cursor marked',
    );
    await page.keyboard.press('ControlOrMeta+F');
    await waitFor(
      async () => (await occurrencesMarked()) === '',
      'nothing marked while the find has the focus rather than the editor',
    );
    await page.keyboard.press('Escape');
    await waitFor(
      async () => (await occurrencesMarked()) === 'total,total',
      'the whole words marked again once the editor has the focus back',
    );
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await waitFor(
      async () => (await occurrencesMarked()) === 'tot,tot',
      'the other copies of the text selected marked',
    );
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

  test('shows what an input method composes as it composes it, each step in place of the one before, and the text it settles on in place of them all, as the editor takes what is typed itself, its text being in no element of the page', async () => {
    fs.writeFileSync(path.join(opened, 'composed.txt'), 'one two\n');
    await backToCommander();
    await edit('composed.txt');
    await waitFor(async () => (await editedText()) === 'one two\n', 'the text');
    await toStart();
    await waitFor(async () => (await status()) === 'Col 1', 'the start');
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('Input.imeSetComposition', {
        text: 'n',
        selectionStart: 1,
        selectionEnd: 1,
      });
      await waitFor(
        async () => (await editedText()) === 'none two\n',
        'the first letter composed',
      );
      await session.send('Input.imeSetComposition', {
        text: 'ni',
        selectionStart: 2,
        selectionEnd: 2,
      });
      await waitFor(
        async () => (await editedText()) === 'nione two\n',
        'the second letter composed',
      );
      await session.send('Input.insertText', { text: '你' });
      await waitFor(
        async () =>
          (await editedText()) === '你one two\n' &&
          (await status()) === 'Col 3',
        'the character it settled on, two cells wide',
      );
      await page.keyboard.type(' x');
      await waitFor(
        async () => (await editedText()) === '你 xone two\n',
        'the text typed after it',
      );
      await page.keyboard.press('ControlOrMeta+S');
      await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
    } finally {
      await session.detach();
    }
  });

  test('deletes the character before and after every cursor on Backspace and Delete, the word before one on Ctrl+Backspace and after one on Ctrl+Delete, selects the whole text on Ctrl+A, and cuts it to the clipboard and pastes it back, a line copied whole with nothing selected pasted above the line of the cursor', async () => {
    const text = 'alpha beta\nalpha beta\n';
    fs.writeFileSync(path.join(opened, 'deleted.txt'), text);
    await backToCommander();
    await edit('deleted.txt');
    await waitFor(async () => (await editedText()) === text, 'the text');
    await toStart();
    await page.keyboard.press('End');
    await page.keyboard.press('Control+Alt+ArrowDown');
    await waitFor(
      async () => (await status())?.includes('2 cursors') === true,
      'a cursor at the end of both lines',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await editedText()) === 'alpha bet\nalpha bet\n',
      'a character deleted before both cursors',
    );
    await page.keyboard.press('Control+Backspace');
    await waitFor(
      async () => (await editedText()) === 'alpha \nalpha \n',
      'a word deleted before both cursors',
    );
    await page.keyboard.press('Home');
    await page.keyboard.press('Delete');
    await waitFor(
      async () => (await editedText()) === 'lpha \nlpha \n',
      'a character deleted after both cursors',
    );
    await page.keyboard.press('Control+Delete');
    await waitFor(
      async () => (await editedText()) === ' \n \n',
      'a word deleted after both cursors',
    );
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.type('one');
    await page.keyboard.press('ControlOrMeta+C');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ControlOrMeta+V');
    await waitFor(
      async () => (await editedText()) === 'one \none \n \n',
      'the line copied whole pasted above the line of the cursor',
    );
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ControlOrMeta+X');
    await waitFor(
      async () => (await editedText()) === '',
      'the whole text cut',
    );
    await page.keyboard.press('ControlOrMeta+V');
    await page.keyboard.press('ControlOrMeta+V');
    await waitFor(
      async () => (await editedText()) === 'one \none \n \none \none \n \n',
      'the text cut pasted twice',
    );
    await page.keyboard.press('ControlOrMeta+S');
    await activeTab().locator('.tab-unsaved').waitFor({ state: 'detached' });
  });
});
