import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import {
  opened,
  page,
  hiding,
  looksOf,
  right,
  rowNames,
  markedNames,
  markingRow,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';

const selectedName = () =>
  right().locator('.commander-row.selected .commander-name').textContent();

suite('App commander', () => {
  sharedCommanderApp();

  test('marks files moving with Shift, with Space and Insert, with Ctrl+click and Shift+click, and with a click on their box, which leaves the selection where it was, never the parent row, checking their box and washing them gray in their own color, and drops the marks in another folder', async () => {
    const markingFolder = path.join(opened, 'marking');
    fs.mkdirSync(markingFolder);
    for (const name of ['a', 'b', 'c', 'd']) {
      fs.writeFileSync(path.join(markingFolder, `${name}.txt`), name);
    }
    await select('marking');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..,a.txt,b.txt,c.txt,d.txt',
      'the markingFolder to be listed',
    );
    await page.mouse.move(0, 0);
    const unmarked = await looksOf(markingRow('b'));
    assert.strictEqual(unmarked.box, 'hidden');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await waitFor(
      async () => (await markedNames()).join() === 'a,b',
      'the files passed to be marked, the parent row not',
    );
    await page.keyboard.press('Shift+ArrowUp');
    await waitFor(
      async () => (await markedNames()).join() === 'a,b,c',
      'moving up from a file not marked to mark it',
    );
    await page.keyboard.press('Shift+ArrowUp');
    await waitFor(
      async () => (await markedNames()).join() === 'a,c',
      'moving from a marked file to unmark it',
    );

    await page.keyboard.press('Space');
    await page.keyboard.press('Insert');
    await waitFor(
      async () => (await markedNames()).join() === 'b,c',
      'Space and Insert to toggle and move down',
    );
    await markingRow('a').click({ modifiers: ['ControlOrMeta'] });
    await waitFor(
      async () => (await markedNames()).join() === 'a,b,c',
      'Ctrl+click to toggle',
    );
    await markingRow('d').click({ modifiers: ['Shift'] });
    await waitFor(
      async () => (await markedNames()).join() === 'a,b,c,d',
      'Shift+click to mark the range',
    );
    assert.strictEqual(await selectedName(), 'd');
    await markingRow('b').hover();
    await markingRow('b').locator('.commander-check').click();
    await waitFor(
      async () => (await markedNames()).join() === 'a,c,d',
      'a click on the box of a marked file to unmark it',
    );
    assert.strictEqual(await selectedName(), 'd');
    await markingRow('b').locator('.commander-check').click();
    await waitFor(
      async () => (await markedNames()).join() === 'a,b,c,d',
      'a click on the box of a file to mark it',
    );
    assert.strictEqual(await selectedName(), 'd');
    await page.mouse.move(0, 0);

    const marked = await looksOf(markingRow('b'));
    assert.deepStrictEqual(
      {
        color: marked.color,
        weight: marked.weight,
        box: marked.box,
        check: marked.check,
      },
      {
        color: unmarked.color,
        weight: unmarked.weight,
        box: 'visible',
        check: 'visible',
      },
    );
    assert.notStrictEqual(marked.background, unmarked.background);
    const hidden = await hiding(
      right().locator('.commander-row.marked').first(),
    );
    assert.ok(
      (hidden.after.color[3] ?? 0) < (hidden.before.color[3] ?? 0),
      `A hidden file marked is dimmed as any hidden file, ${hidden.after.color.join()} after ${hidden.before.color.join()}`,
    );

    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('marking'),
      'the parent markingFolder',
    );
    await select('marking');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..,a.txt,b.txt,c.txt,d.txt',
      'the markingFolder to be listed again',
    );
    assert.deepStrictEqual(await markedNames(), []);
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('marking'),
      'the parent markingFolder',
    );
    fs.rmSync(markingFolder, { recursive: true });
    await waitFor(
      async () => !(await rowNames()).includes('marking'),
      'the markingFolder to be gone from the list',
    );
  });
});
