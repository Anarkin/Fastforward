import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import {
  opened,
  page,
  right,
  content,
  editedText,
  backToCommander,
  edit,
  toStart,
  sharedEditorApp,
} from './editorAppFixtures';

const status = () => page.locator('.editor .column-status-text').textContent();

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

  test('indents on Tab, comments a line out on Ctrl+K, moves it on Alt+Down, goes to a line on Ctrl+G and types at every occurrence Ctrl+D selected, telling the line, column and cursors below', async () => {
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
    await waitFor(async () => (await status()) === 'Ln 1, Col 1', 'the place');
    await page.keyboard.press('Tab');
    await waitFor(async () => (await status()) === 'Ln 1, Col 5', 'the indent');
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
    await waitFor(async () => (await status()) === 'Ln 1, Col 1', 'line 1');
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

  test('finds the text typed on Ctrl+F, going to the next match on Enter, and replaces every match on Ctrl+H', async () => {
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
    const field = page.locator('.editor .find-field .find-field-input');
    await field.waitFor();
    await field.fill('one');
    const count = page.locator('.editor .find-field-count');
    await waitFor(
      async () => (await count.textContent()) === '1 of 3',
      'the first match',
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
      .locator('.editor .find-field .find-field-input')
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
    const field = page.locator('.editor .find-field .find-field-input');
    await field.waitFor();
    await field.fill('needle');
    const count = page.locator('.editor .find-field-count');
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
});
