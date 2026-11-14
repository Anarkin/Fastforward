import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import { waitForFocus } from './appFixtures';
import {
  opened,
  page,
  right,
  rowNames,
  groupStartsShown,
  statusShown,
  sortedRows,
  markedSorted,
  selected,
  select,
  openFolder,
  sharedCommanderApp,
} from './commanderAppFixtures';

const focusIn = (selector: string) =>
  page.evaluate(
    (wanted) => Boolean(document.activeElement?.closest(wanted)),
    selector,
  );

const choose = async (menu: string, item: string) => {
  await page.locator(menu).locator('.menu-button-trigger').click();
  await page.locator(menu).locator(item).first().click();
};

suite('App commander', () => {
  sharedCommanderApp();

  test('hands the focus to the list of a side once a layout or a bookmark is chosen with the pointer from the menus of its header, and to the text of a file viewed once an encoding or a language is, so their keys work at once', async () => {
    const inList = '.commander-pane:nth-child(2) .column-body';
    await select('notes');

    const chosen: boolean[] = [];
    await choose(
      `.commander-pane:nth-child(2) .commander-layout`,
      `.menu-item:has-text("${strings.commander.layouts.details}")`,
    );
    chosen.push(await focusIn(inList));
    const bookmarks = right().locator(
      `button[title="${strings.commander.bookmarks}"]`,
    );
    const addOrRemove = page.locator('.menu-item', {
      hasText: new RegExp(
        `^(${strings.commander.addBookmark}|${strings.commander.removeBookmark})$`,
      ),
    });
    const toggleBookmark = async () => {
      await bookmarks.click();
      await addOrRemove.click();
      return focusIn(inList);
    };
    chosen.push(await toggleBookmark(), await toggleBookmark());

    await page.keyboard.press('F3');
    await page.locator('.viewer .viewer-rows .viewer-row').first().waitFor();
    await choose('.viewer-encoding', '.menu-item[aria-checked="true"]');
    chosen.push(await focusIn('.viewer-body'));
    await choose('.viewer .language-button', '.menu-item[aria-checked="true"]');
    chosen.push(await focusIn('.viewer-body'));

    assert.deepStrictEqual(chosen, [true, true, true, true, true]);
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
  });

  test('shows only the files of a side that have a copy of the same content on Ctrl+Shift+G, whatever their names, a line above the first of each group that moves no row and adds no space, in flat view too, follows a delete, says when it found none, and shows every file again on Ctrl+Shift+G', async () => {
    const dupes = path.join(opened, 'dupes');
    fs.mkdirSync(path.join(dupes, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dupes, 'one.txt'), 'same content');
    fs.writeFileSync(path.join(dupes, 'two.log'), 'same content');
    fs.writeFileSync(path.join(dupes, 'other.txt'), 'same contenX');
    fs.writeFileSync(path.join(dupes, 'sub', 'three.md'), 'same content');
    try {
      await openFolder('dupes', dupes);

      await page.keyboard.press('Control+Shift+G');
      await waitFor(
        async () => (await sortedRows()) === '..,one.txt,two.log',
        'the files with a copy',
      );
      assert.strictEqual((await groupStartsShown()).length, 1);
      const spacing = await right()
        .locator('.commander-row')
        .evaluateAll((rows) =>
          rows
            .map((row) => row.getBoundingClientRect())
            .map((box, index, boxes) => ({
              height: box.height,
              gap: index === 0 ? 0 : box.top - (boxes[index - 1]?.bottom ?? 0),
            })),
        );
      assert.ok(
        spacing.every(
          ({ height, gap }) =>
            Math.abs(height - (spacing[0]?.height ?? 0)) < 0.01 &&
            Math.abs(gap) < 0.01,
        ),
        JSON.stringify(spacing),
      );
      assert.match(
        (await right().locator('.path-title').textContent()) ?? '',
        new RegExp(`${strings.commander.duplicatesTag}$`),
      );

      await page.keyboard.press('Control+B');
      await waitFor(
        async () => (await sortedRows()) === '..,one.txt,three.md,two.log',
        'the files with a copy under the folder',
      );
      await page.keyboard.press('Control+B');
      await waitFor(
        async () => (await sortedRows()) === '..,one.txt,two.log',
        'the files of the folder alone again',
      );

      fs.rmSync(path.join(dupes, 'two.log'));
      await waitFor(
        async () => (await rowNames()).join() === '..',
        'the group left with one file to go',
      );
      await waitFor(
        async () => (await statusShown()) === strings.commander.noDuplicates,
        'the side to say it found none',
      );

      await page.keyboard.press('Control+Shift+G');
      await waitFor(
        async () => (await sortedRows()) === '..,one.txt,other.txt,sub',
        'every file again',
      );
      assert.strictEqual(
        await groupStartsShown().then((starts) => starts.length),
        0,
      );
    } finally {
      await page.keyboard.press('Backspace');
      fs.rmSync(dupes, { recursive: true, force: true });
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent()) === opened,
        'the folder opened',
      );
    }
  });

  test('marks the files and folders whose names match a pattern typed on Num+, saying how many it matches as it is typed, inverts the marks on Num*, marks those of the extension of the file selected on Alt and Num+, and unmarks by the last pattern on Num-', async () => {
    const marking = path.join(opened, 'marking');
    fs.mkdirSync(path.join(marking, 'album.jpg'), { recursive: true });
    for (const name of ['a.jpg', 'b.jpg', 'c.png', 'd.png']) {
      fs.writeFileSync(path.join(marking, name), name);
    }
    const field = page.locator('.prompt-input');
    try {
      await openFolder('marking', marking);

      await page.keyboard.press('NumpadAdd');
      await field.waitFor();
      await field.fill('*.jpg');
      await waitFor(
        async () =>
          (await page.locator('.prompt-note').textContent()) ===
          strings.commander.patternMatches(3),
        'the count of what the pattern matches',
      );
      await page.keyboard.press('Enter');
      await field.waitFor({ state: 'detached' });
      await waitFor(
        async () => (await markedSorted()) === 'a,album.jpg,b',
        'the files and the folder the pattern matches to be marked',
      );

      await page.keyboard.press('NumpadMultiply');
      await waitFor(
        async () => (await markedSorted()) === 'c,d',
        'the marks to be inverted',
      );

      await page.keyboard.press('NumpadSubtract');
      await field.waitFor();
      assert.strictEqual(await field.inputValue(), '*.jpg');
      await field.fill('*.png');
      await page.keyboard.press('Enter');
      await field.waitFor({ state: 'detached' });
      await waitFor(
        async () => (await markedSorted()) === '',
        'the marks gone',
      );

      await select('c');
      await page.keyboard.press('Alt+NumpadAdd');
      await waitFor(
        async () => (await markedSorted()) === 'c,d',
        'the files of the extension of the one selected to be marked',
      );
    } finally {
      await page.keyboard.press('Backspace');
      fs.rmSync(marking, { recursive: true, force: true });
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent()) === opened,
        'the folder opened',
      );
    }
  });

  test('lists the files of every folder in the folder of a side on Ctrl+B, saying how many it read in how many folders and the folder of the file selected, following changes in them, and the folder alone again on Ctrl+B', async () => {
    const later = path.join(opened, 'src', 'later.ts');
    try {
      await select('notes');
      await page.keyboard.press('Control+B');
      await waitFor(
        async () =>
          JSON.stringify((await rowNames()).toSorted()) ===
          JSON.stringify(['..', 'big.bin', 'main.ts', 'notes.txt']),
        'the files of every folder',
      );
      await waitFor(
        async () =>
          (await right().locator('.column-status-text').textContent()) ===
          strings.commander.flatRead(3, 2),
        'the count of what was read',
      );
      assert.strictEqual(
        await right().locator('.path-title').textContent(),
        `${opened}${path.sep}**`,
      );
      assert.ok((await selected()).includes('notes'));
      assert.strictEqual(
        await right().locator('.column-status-end').count(),
        0,
      );
      await select('main');
      assert.strictEqual(
        await right().locator('.column-status-end').textContent(),
        'src',
      );

      if (process.platform !== 'linux') {
        fs.writeFileSync(later, '');
        await waitFor(
          async () =>
            (await rowNames()).includes('later.ts') &&
            (await right().locator('.column-status-text').textContent()) ===
              strings.commander.flatRead(4, 2),
          'the file made in a folder under the side',
        );
      }

      await page.keyboard.press('Control+B');
      await waitFor(
        async () => (await rowNames()).join() === '..,src,notes.txt,big.bin',
        'the folder alone again',
      );
      assert.strictEqual(await right().locator('.column-status').count(), 0);
      assert.strictEqual(await right().locator('.path-flat').count(), 0);
    } finally {
      fs.rmSync(later, { force: true });
    }
  });

  test('filters the files of a side on Ctrl+F or Alt and a letter by every word anywhere in their names, moving among them with the arrows as one types, and clears the filter on Esc or once a folder opens', async () => {
    const names = ['alpha-report.txt', 'beta.txt', 'Report-gamma.md'];
    for (const name of names) {
      fs.writeFileSync(path.join(opened, name), name);
    }
    fs.mkdirSync(path.join(opened, 'reports-folder'));
    try {
      await waitFor(
        async () => (await rowNames()).includes('reports-folder'),
        'the files to be listed',
      );
      await select('beta');
      await page.keyboard.press('ControlOrMeta+F');
      await waitForFocus(
        right().locator('.commander-filter-input'),
        'the filter',
      );
      await page.keyboard.type('rep gam');
      await waitFor(
        async () =>
          JSON.stringify((await rowNames()).filter((name) => name !== '..')) ===
          JSON.stringify(['Report-gamma.md']),
        'only the file with both words',
      );
      assert.ok((await selected()).includes('Report-gamma'));
      await page.keyboard.press('ControlOrMeta+F');
      await page.keyboard.type('report');
      await waitFor(
        async () =>
          JSON.stringify(
            (await rowNames()).filter((name) => name !== '..').toSorted(),
          ) ===
          JSON.stringify([
            'Report-gamma.md',
            'alpha-report.txt',
            'reports-folder',
          ]),
        'the files and the folder with the word',
      );
      assert.match(
        (await right().locator('.find-field-count').textContent()) ?? '',
        /^3 of \d+$/,
      );
      assert.strictEqual(
        await right().locator('.commander-row .match').first().textContent(),
        'report',
      );
      await page.keyboard.press('ArrowDown');
      await waitFor(
        async () => (await selected()).includes('alpha-report'),
        'the next match selected',
      );

      await page.keyboard.press('Enter');
      await waitForFocus(right().locator('.virtual-rows'), 'the list');
      assert.ok(await right().locator('.commander-filter-input').isVisible());
      await page.keyboard.press('Escape');
      await right()
        .locator('.commander-filter-input')
        .waitFor({ state: 'detached' });
      await waitFor(
        async () => (await rowNames()).includes('beta.txt'),
        'every file again',
      );
      assert.ok((await selected()).includes('alpha-report'));

      await page.keyboard.press('ControlOrMeta+F');
      await page.keyboard.type('folder');
      await waitFor(
        async () => (await selected()).includes('reports-folder'),
        'the folder selected',
      );
      await page.keyboard.press('Enter');
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent())?.endsWith(
            'reports-folder',
          ) === true,
        'the folder opened',
      );
      await waitForFocus(
        right().locator('.virtual-rows'),
        'the list in the folder',
      );
      assert.strictEqual(
        await right().locator('.commander-filter-input').count(),
        0,
      );
      await page.keyboard.press('Backspace');
      await waitFor(
        async () => (await rowNames()).includes('beta.txt'),
        'the folder left',
      );

      await page.keyboard.press('Alt+b');
      await waitForFocus(
        right().locator('.commander-filter-input'),
        'the filter from Alt and a letter',
      );
      await page.keyboard.press('Alt+e');
      await waitFor(
        async () =>
          (await right().locator('.commander-filter-input').inputValue()) ===
            'be' &&
          JSON.stringify((await rowNames()).filter((name) => name !== '..')) ===
            JSON.stringify(['beta.txt']),
        'the files with the letters typed with Alt',
      );
      await page.keyboard.press('Escape');
      await right()
        .locator('.commander-filter-input')
        .waitFor({ state: 'detached' });
    } finally {
      if (await right().locator('.commander-filter-input').isVisible()) {
        await right().locator('.commander-filter-input').press('Escape');
        await right()
          .locator('.commander-filter-input')
          .waitFor({ state: 'detached' });
      }
      for (const name of names) {
        fs.rmSync(path.join(opened, name));
      }
      fs.rmSync(path.join(opened, 'reports-folder'), { recursive: true });
      await waitFor(
        async () => !(await rowNames()).includes('beta.txt'),
        'the files to be gone from the list',
      );
    }
  });
});
