import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { assertFillsRows } from './markRows';
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

const status = () => page.locator('.editor .column-status-text').textContent();

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

  test('marks a matched bracket on the very box of the cursor standing on it, its text in the color of a find match whatever color its syntax gives it, so the cursor covers the mark whole and a bracket in the first column is marked whole, as the outline it had stood a pixel out on every side of its text', async () => {
    fs.writeFileSync(path.join(opened, 'block.json'), '{\n}\n');
    await backToCommander();
    await edit('block.json');
    await waitFor(async () => (await editedText()) === '{\n}\n', 'the text');
    await content().locator('.cm-line [class^="syntax-"]').first().waitFor();
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
      const found = document.createElement('span');
      found.style.color = 'var(--color-search-match-foreground)';
      mark?.parentElement?.append(found);
      const wanted = getComputedStyle(found).color;
      found.remove();
      return {
        glyph: glyph === null ? '' : getComputedStyle(glyph).color,
        wanted,
      };
    });
    assert.strictEqual(colors.glyph, colors.wanted);
  });
});
