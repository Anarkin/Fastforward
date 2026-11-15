import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import { waitForFocus } from './waits';
import { assertFillsRows } from './markRows';
import {
  opened,
  page,
  right,
  rowNames,
  groupStartsShown,
  statusShown,
  sortedRows,
  selected,
  select,
  openFolder,
  sharedCommanderApp,
} from './commanderAppFixtures';

const count = () => right().locator('.search-count').textContent();

const colorsOf = (selector: string) =>
  right()
    .locator(selector)
    .evaluateAll((parts) => parts.map((part) => getComputedStyle(part).color));

suite('App commander', () => {
  sharedCommanderApp();

  test('shows only the files of a side that have a copy of the same content on Ctrl+Shift+G, whatever their names, a line above the first of each group that moves no row and adds no space, in flat view too, the whole path of the file selected under the side, follows a delete, saying nothing under the side once it found none, and shows every file again on Ctrl+Shift+G', async () => {
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
      await select('two');
      await waitFor(
        async () => (await statusShown()) === path.join(dupes, 'two.log'),
        'the path of the file selected',
      );
      const headerColors = await colorsOf('.path-title .path-part');
      const rowColor = await right()
        .locator('.commander-row.selected')
        .evaluate((row) => getComputedStyle(row).color);
      await waitFor(
        async () =>
          JSON.stringify(await colorsOf('.column-status .path-part')) ===
          JSON.stringify([...headerColors, rowColor]),
        'the path of the file selected in the colors of the side and its row',
      );

      await page.keyboard.press('Control+B');
      await waitFor(
        async () => (await sortedRows()) === '..,one.txt,three.md,two.log',
        'the files with a copy under the folder',
      );
      await select('three');
      await waitFor(
        async () =>
          (await statusShown()) === path.join(dupes, 'sub', 'three.md'),
        'the path of the file selected in a folder under the side',
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
      assert.strictEqual(await right().locator('.column-status').count(), 0);

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

  test('lists the files of every folder in the folder of a side on Ctrl+B, giving the whole path of the file selected once read, following changes in them, and the folder alone again on Ctrl+B', async () => {
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
        async () => (await statusShown()) === path.join(opened, 'notes.txt'),
        'the path of the file selected',
      );
      assert.strictEqual(
        await right().locator('.path-title').textContent(),
        `${opened}${path.sep}**`,
      );
      assert.ok((await selected()).includes('notes'));
      await select('main');
      await waitFor(
        async () =>
          (await statusShown()) === path.join(opened, 'src', 'main.ts'),
        'the path of the file selected in a folder under the side',
      );

      if (process.platform !== 'linux') {
        fs.writeFileSync(later, '');
        await waitFor(
          async () => (await rowNames()).includes('later.ts'),
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

  test('filters the files of a side on Ctrl+F or Alt and a letter by every word anywhere in their names, marking what it found as tall as the selected row, counting the selected of those kept, moving among them with the arrows as one types, matching the case while its toggle is pressed, and clears the filter on Esc or once a folder opens', async () => {
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
      await waitForFocus(right().locator('.search-box-input'), 'the filter');
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
      assert.strictEqual(await count(), '2 of 3');
      assert.strictEqual(
        await right().locator('.commander-row .match').first().textContent(),
        'report',
      );
      await assertFillsRows(
        right().locator('.commander-row.selected .match').first(),
        '.commander-row.selected',
      );
      await page.keyboard.press('ArrowDown');
      await waitFor(
        async () => (await selected()).includes('alpha-report'),
        'the next match selected',
      );
      await waitFor(async () => (await count()) === '3 of 3', 'the count');
      const matchCase = right().locator('.search-toggle[title="Match Case"]');
      await matchCase.click();
      await waitFor(
        async () =>
          (await count()) === '2 of 2' &&
          !(await rowNames()).includes('Report-gamma.md'),
        'only the names in the case of the query',
      );
      await matchCase.click();
      await waitFor(async () => (await count()) === '3 of 3', 'every match');
      await waitForFocus(right().locator('.search-box-input'), 'the filter');

      await page.keyboard.press('Enter');
      await waitForFocus(right().locator('.virtual-rows'), 'the list');
      assert.ok(await right().locator('.search-box-input').isVisible());
      await page.keyboard.press('Escape');
      await right().locator('.search-box-input').waitFor({ state: 'detached' });
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
      assert.strictEqual(await right().locator('.search-box-input').count(), 0);
      await page.keyboard.press('Backspace');
      await waitFor(
        async () => (await rowNames()).includes('beta.txt'),
        'the folder left',
      );

      await page.keyboard.press('Alt+b');
      await waitForFocus(
        right().locator('.search-box-input'),
        'the filter from Alt and a letter',
      );
      await page.keyboard.press('Alt+e');
      await waitFor(
        async () =>
          (await right().locator('.search-box-input').inputValue()) === 'be' &&
          JSON.stringify((await rowNames()).filter((name) => name !== '..')) ===
            JSON.stringify(['beta.txt']),
        'the files with the letters typed with Alt',
      );
      await page.keyboard.press('Escape');
      await right().locator('.search-box-input').waitFor({ state: 'detached' });
    } finally {
      if (await right().locator('.search-box-input').isVisible()) {
        await right().locator('.search-box-input').press('Escape');
        await right()
          .locator('.search-box-input')
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
