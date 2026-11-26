import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import {
  opened,
  page,
  hidingLine,
  looksOf,
  right,
  rowNames,
  markedNames,
  markingRow,
  select,
  markedSorted,
  openFolder,
  sharedCommanderApp,
} from './commanderAppFixtures';
import { clickBox, clickLine, hoverLine, rowsShown } from './commanderRows';

const selectedName = async () =>
  (await rowsShown(right())).find(({ classes }) => classes.includes('selected'))
    ?.name;

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
    await clickLine(page, right(), markingRow('a'), {
      modifiers: ['ControlOrMeta'],
    });
    await waitFor(
      async () => (await markedNames()).join() === 'a,b,c',
      'Ctrl+click to toggle',
    );
    await clickLine(page, right(), markingRow('d'), { modifiers: ['Shift'] });
    await waitFor(
      async () => (await markedNames()).join() === 'a,b,c,d',
      'Shift+click to mark the range',
    );
    assert.strictEqual(await selectedName(), 'd');
    await hoverLine(page, right(), markingRow('b'));
    await clickBox(page, right(), markingRow('b'));
    await waitFor(
      async () => (await markedNames()).join() === 'a,c,d',
      'a click on the box of a marked file to unmark it',
    );
    assert.strictEqual(await selectedName(), 'd');
    await clickBox(page, right(), markingRow('b'));
    await waitFor(
      async () => (await markedNames()).join() === 'a,b,c,d',
      'a click on the box of a file to mark it',
    );
    assert.strictEqual(await selectedName(), 'd');
    await page.mouse.move(0, 0);

    const marked = await looksOf(markingRow('b'));
    assert.deepStrictEqual(
      { color: marked.color, box: marked.box, check: marked.check },
      { color: unmarked.color, box: 'visible', check: 'visible' },
    );
    assert.notStrictEqual(marked.background, unmarked.background);
    const hidden = await hidingLine(markingRow('b'));
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
});
