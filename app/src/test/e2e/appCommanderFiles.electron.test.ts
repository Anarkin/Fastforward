import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import {
  opened,
  page,
  right,
  rowNames,
  onClipboard,
  textOnClipboard,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';
import { fileName, rowsShown } from './commanderRows';

suite('App commander', () => {
  sharedCommanderApp();

  test('deletes the marked files, or the selected one, for good on Shift+Delete and Shift+F8 once confirmed, keeping them when Cancel is picked with the arrow keys, and selects the file after the deleted ones', async () => {
    const deletingFolder = path.join(opened, 'deleting');
    fs.mkdirSync(deletingFolder);
    for (const name of ['a', 'b', 'c', 'd']) {
      fs.writeFileSync(path.join(deletingFolder, `${name}.txt`), name);
    }
    await select('deleting');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..,a.txt,b.txt,c.txt,d.txt',
      'the folder to be listed',
    );
    await select('b');
    const popup = page.locator('.confirm-popup');
    await page.keyboard.press('Shift+Delete');
    await popup.waitFor();
    assert.deepStrictEqual(
      [
        await popup.locator('.confirm-question > span').count(),
        await popup.locator('.name-value').allTextContents(),
      ],
      [0, [path.join(deletingFolder, 'b.txt')]],
    );
    await page.keyboard.press('ArrowLeft');
    await waitFor(
      async () =>
        (await page.evaluate(() => document.activeElement?.textContent)) ===
        'Cancel',
      'the arrow key to move to Cancel',
    );
    await page.keyboard.press('Enter');
    await popup.waitFor({ state: 'detached' });
    assert.ok(fs.existsSync(path.join(deletingFolder, 'b.txt')));

    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await page.keyboard.press('Shift+F8');
    await popup.waitFor();
    assert.strictEqual(
      await popup.locator('.confirm-question').textContent(),
      strings.commander.items(2),
    );
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..,a.txt,d.txt',
      'the marked files to be gone from the list',
    );
    assert.deepStrictEqual(fs.readdirSync(deletingFolder).toSorted(), [
      'a.txt',
      'd.txt',
    ]);
    await waitFor(
      async () =>
        (await rowsShown(right()))
          .filter(({ classes }) => classes.includes('selected'))
          .map(fileName)
          .join() === 'd.txt',
      'the file after the deleted ones to be selected',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('deleting'),
      'the folder above to be listed again',
    );
  });

  test('copies the selected file into the folder of the other side on F5 once confirmed, and moves the marked folder and file there on F6, through the process that copies, the other side listing them, naming them and the folder on lines by their whole paths, a path wrapping only between its folders', async () => {
    const from = path.join(opened, 'copyfrom');
    const into = path.join(
      opened,
      'copy-into-a-folder-whose-name-is-this-long-so-that-its-path-wraps-in-a-dialog',
    );
    fs.mkdirSync(path.join(from, 'docs'), { recursive: true });
    fs.mkdirSync(into);
    fs.writeFileSync(path.join(from, 'first.txt'), 'first');
    fs.writeFileSync(path.join(from, 'second.txt'), 'second');
    fs.writeFileSync(path.join(from, 'docs', 'inner.txt'), 'inner');
    const left = page.locator('.commander-pane').nth(0);
    const popup = page.locator('.confirm-popup');
    const asked = () =>
      popup.evaluate((element) =>
        [...element.querySelectorAll('.name-label')].map((label) => [
          label.textContent,
          label.nextElementSibling?.textContent,
        ]),
      );
    const wrapping = () =>
      popup.evaluate((element) => ({
        lines: [...element.querySelectorAll('.name')].map(
          (name) => name.getClientRects().length,
        ),
        brokenPieces: [...element.querySelectorAll('.name > span')].filter(
          (piece) => piece.getClientRects().length !== 1,
        ).length,
      }));
    await select('copy-into');
    await page.keyboard.press('ControlOrMeta+ArrowLeft');
    await waitFor(
      async () => (await left.locator('.column-name').textContent()) === into,
      'the left side to open the target',
    );
    await select('copyfrom');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..,docs,first.txt,second.txt',
      'the source to be listed',
    );

    await select('first');
    await page.keyboard.press('F5');
    await popup.waitFor();
    assert.deepStrictEqual(await asked(), [
      ['', path.join(from, 'first.txt')],
      ['To', into],
    ]);
    const wrapped = await wrapping();
    assert.ok(wrapped.lines[1] > 1, JSON.stringify(wrapped));
    assert.strictEqual(wrapped.brokenPieces, 0);
    await page.keyboard.press('Enter');
    await waitFor(
      () => fs.existsSync(path.join(into, 'first.txt')),
      'the file to be copied',
    );
    await page.locator('.transfer-popup').waitFor({ state: 'detached' });
    assert.strictEqual(
      fs.readFileSync(path.join(into, 'first.txt'), 'utf8'),
      'first',
    );
    assert.ok(fs.existsSync(path.join(from, 'first.txt')));
    await waitFor(
      async () => (await rowNames(left)).includes('first.txt'),
      'the left side to list the copy',
    );

    await select('docs');
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    await page.keyboard.press('F6');
    await popup.waitFor();
    assert.deepStrictEqual(await asked(), [
      ['', '2 items'],
      ['To', into],
    ]);
    await page.keyboard.press('Enter');
    await waitFor(
      () =>
        fs.existsSync(path.join(into, 'docs', 'inner.txt')) &&
        fs.existsSync(path.join(into, 'second.txt')) &&
        !fs.existsSync(path.join(from, 'docs')) &&
        !fs.existsSync(path.join(from, 'second.txt')),
      'the marked items to be moved',
    );
    await page.locator('.transfer-popup').waitFor({ state: 'detached' });
    await waitFor(
      async () => (await rowNames()).join() === '..,first.txt',
      'the moved items to be gone from the source',
    );
    await waitFor(
      async () =>
        (await rowNames(left)).join() === '..,docs,first.txt,second.txt',
      'the left side to list the moved items',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('copyfrom'),
      'the folder above to be listed again',
    );
  });

  test('makes a folder of the name typed on F7 in the folder of the side, selecting it, and says what is wrong with a name taken', async () => {
    const making = path.join(opened, 'making');
    fs.mkdirSync(making);
    fs.writeFileSync(path.join(making, 'notes.txt'), '');
    await select('making');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..,notes.txt',
      'the folder to be listed',
    );
    const field = page.locator('.prompt-input');

    await page.keyboard.press('F7');
    await field.waitFor();
    await page.keyboard.type('notes.txt');
    await page.locator('.prompt-problem').waitFor();
    await field.fill('new folder');
    await page.keyboard.press('Enter');
    await field.waitFor({ state: 'detached' });
    await waitFor(
      () => fs.statSync(path.join(making, 'new folder')).isDirectory(),
      'the folder to be made',
    );
    await waitFor(
      async () =>
        (
          await right().locator('.commander-row.selected').textContent()
        )?.includes('new folder') === true,
      'the new folder to be selected',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('making'),
      'the folder above to be listed again',
    );
  });

  test('copies the path of the file selected as text on Mod+Shift+C and its name on Alt+Shift+C, without quotes, and the path of the folder shown on ..', async () => {
    await select('notes');

    await page.keyboard.press('ControlOrMeta+Shift+C');
    await waitFor(
      async () => (await textOnClipboard()) === path.join(opened, 'notes.txt'),
      'the path of the file to be on the clipboard',
    );
    await page.keyboard.press('Alt+Shift+C');
    await waitFor(
      async () => (await textOnClipboard()) === 'notes.txt',
      'the name of the file to be on the clipboard',
    );
    await page.keyboard.press('Home');
    await page.keyboard.press('ControlOrMeta+Shift+C');
    await waitFor(
      async () => (await textOnClipboard()) === opened,
      'the path of the folder shown to be on the clipboard',
    );
  });

  test('puts the marked folder and file on the clipboard of the system on Mod+C as files, which other apps paste, and copies the files there into the folder of the side on Mod+V', async () => {
    const from = path.join(opened, 'clipfrom');
    const into = path.join(opened, 'clipinto');
    fs.mkdirSync(path.join(from, 'docs'), { recursive: true });
    fs.mkdirSync(into);
    fs.writeFileSync(path.join(from, 'note.txt'), 'note');
    fs.writeFileSync(path.join(from, 'docs', 'inner.txt'), 'inner');
    await select('clipfrom');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..,docs,note.txt',
      'the folder to be listed',
    );
    await select('docs');
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');

    await page.keyboard.press('ControlOrMeta+c');
    await waitFor(
      async () =>
        (await onClipboard()).join() ===
        [path.join(from, 'docs'), path.join(from, 'note.txt')].join(),
      'the marked items to be on the clipboard',
    );

    await page.keyboard.press('Backspace');
    await select('clipinto');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..',
      'the empty folder to be listed',
    );
    await page.keyboard.press('ControlOrMeta+v');
    await waitFor(
      () =>
        fs.existsSync(path.join(into, 'note.txt')) &&
        fs.existsSync(path.join(into, 'docs', 'inner.txt')),
      'the files on the clipboard to be copied',
    );
    await page.locator('.transfer-popup').waitFor({ state: 'detached' });
    await waitFor(
      async () => (await rowNames()).join() === '..,docs,note.txt',
      'the copies to be listed',
    );
    assert.ok(fs.existsSync(path.join(from, 'note.txt')));
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('clipinto'),
      'the folder above to be listed again',
    );
  });
});
