import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../lib/shared/strings';
import { waitFor } from './fixtures';
import {
  opened,
  app,
  page,
  hiding,
  looksOf,
  right,
  rowNames,
  onClipboard,
  textOnClipboard,
  markedNames,
  markingRow,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';

const draggedFiles = () =>
  app.evaluate((): string[][] => Reflect.get(globalThis, 'dragged'));

const drop = (onto: string | undefined, made: boolean) =>
  page.evaluate(
    ({ onto: dropOnto, made: making }) => {
      const data = new DataTransfer();
      if (making) {
        data.items.add(new File(['made'], 'made.txt'));
      } else {
        const input =
          document.querySelector<HTMLInputElement>('#dropped-files');
        for (const file of input?.files ?? []) {
          data.items.add(file);
        }
      }
      const side = document.querySelectorAll('.commander-pane')[1];
      const element =
        dropOnto === undefined
          ? side.querySelector('.column-body')
          : side.querySelector(`[data-drop="${dropOnto}"]`);
      const box = element?.getBoundingClientRect();
      const init = {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
        clientX: (box?.left ?? 0) + 20,
        clientY: (box?.top ?? 0) + 5,
      };
      element?.dispatchEvent(new DragEvent('dragover', init));
      element?.dispatchEvent(new DragEvent('drop', init));
    },
    { onto, made },
  );

const choose = async (label: string, title: string) => {
  const item = page.locator('.context-menu .menu-item', { hasText: label });
  await item.waitFor();
  assert.strictEqual(await item.getAttribute('title'), title);
  await item.click();
};

const selectedName = () =>
  right().locator('.commander-row.selected .commander-name').textContent();

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
        await popup.locator('.confirm-question > span').textContent(),
        await popup.locator('.name-value').allTextContents(),
      ],
      [strings.commander.deleteItem, ['b.txt']],
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
      strings.commander.deleteItems(strings.commander.items(2)),
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
        (
          await right().locator('.commander-row.selected').textContent()
        )?.startsWith('dtxt') === true,
      'the file after the deleted ones to be selected',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('deleting'),
      'the folder above to be listed again',
    );
  });

  test('copies the selected file into the folder of the other side on F5 once confirmed, and moves the marked folder and file there on F6, through the process that copies, the other side listing them, naming them and the folder on lines, its path wrapping only between its folders', async () => {
    const from = path.join(opened, 'copyfrom');
    const into = path.join(
      opened,
      'copy-into-a-folder-whose-name-is-this-long',
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
      ['Copy', 'first.txt'],
      ['To', into],
    ]);
    const wrapped = await wrapping();
    assert.strictEqual(wrapped.lines[0], 1);
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
      ['Move', '2 items'],
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

  test('goes to the path typed on Ctrl+Shift+F6, starting from the path of the side selected whole, so a path pasted takes its place, and to the folder of a file with the file selected', async () => {
    const field = page.locator('.prompt-input');
    await select('notes');

    await page.keyboard.press('Control+Shift+F6');
    await field.waitFor();
    assert.deepStrictEqual(
      await field.evaluate((input: HTMLInputElement) => [
        input.value,
        input.selectionStart,
        input.selectionEnd,
      ]),
      [opened, 0, opened.length],
    );
    await page.keyboard.type(path.join(opened, 'src'));
    await page.keyboard.press('Enter');
    await field.waitFor({ state: 'detached' });
    await waitFor(
      async () =>
        (await right().locator('.column-name').textContent()) ===
        path.join(opened, 'src'),
      'the folder typed to open',
    );
    await page.keyboard.press('Control+Shift+F6');
    await field.waitFor();
    await page.keyboard.type(`"${path.join(opened, 'notes.txt')}"`);
    await page.keyboard.press('Enter');
    await field.waitFor({ state: 'detached' });
    await waitFor(
      async () =>
        (await right().locator('.column-name').textContent()) === opened,
      'the folder of the file to open',
    );
    await waitFor(
      async () =>
        (
          await right().locator('.commander-row.selected').textContent()
        )?.includes('notes') === true,
      'the file to be selected',
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

  test('drags the marked files out of the app as files of the system when one marked is dragged, and the one dragged alone when it is not marked, selecting it', async () => {
    const dragging = path.join(opened, 'dragging');
    fs.mkdirSync(dragging);
    for (const name of ['one', 'three', 'two']) {
      fs.writeFileSync(path.join(dragging, `${name}.txt`), name);
    }
    await app.evaluate(({ BrowserWindow }) => {
      const dragged: string[][] = [];
      Reflect.set(globalThis, 'dragged', dragged);
      const [window] = BrowserWindow.getAllWindows().toSorted(
        (a, b) => a.id - b.id,
      );
      window.webContents.startDrag = (item) => {
        dragged.push(item.files ?? [item.file]);
      };
    });
    await select('dragging');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..,one.txt,three.txt,two.txt',
      'the folder to be listed',
    );
    await select('one');
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');

    await right()
      .locator('.commander-row', { hasText: 'two' })
      .dispatchEvent('dragstart');
    await waitFor(
      async () => (await draggedFiles()).length === 1,
      'the marked files to be dragged',
    );
    await right()
      .locator('.commander-row', { hasText: 'three' })
      .dispatchEvent('dragstart');
    await waitFor(
      async () => (await draggedFiles()).length === 2,
      'the file dragged to be dragged alone',
    );

    assert.deepStrictEqual(await draggedFiles(), [
      [path.join(dragging, 'one.txt'), path.join(dragging, 'two.txt')],
      [path.join(dragging, 'three.txt')],
    ]);
    assert.match(
      (await right().locator('.commander-row.selected').textContent()) ?? '',
      /^three/,
    );
    await app.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows().toSorted(
        (a, b) => a.id - b.id,
      );
      Reflect.deleteProperty(window.webContents, 'startDrag');
    });
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('dragging'),
      'the folder above to be listed again',
    );
  });

  test('copies or moves files dropped on a side as the menu it shows at the pointer says, into the folder dropped on or that of the side, taking only files of the system, never one the page makes', async () => {
    const from = path.join(opened, 'dropfrom');
    const into = path.join(opened, 'dropinto');
    fs.mkdirSync(from);
    fs.mkdirSync(path.join(into, 'inner'), { recursive: true });
    for (const name of ['x', 'y']) {
      fs.writeFileSync(path.join(from, `${name}.txt`), name);
    }
    await select('dropinto');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..,inner',
      'the target to be listed',
    );
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.id = 'dropped-files';
      input.hidden = true;
      document.body.append(input);
    });
    await page.setInputFiles('#dropped-files', [
      path.join(from, 'x.txt'),
      path.join(from, 'y.txt'),
    ]);

    await drop(undefined, true);
    await choose(strings.commander.dropCopy, `Copy "made.txt" to "${into}"`);
    await drop('inner', false);
    await choose(
      strings.commander.dropCopy,
      `Copy 2 items to "${path.join(into, 'inner')}"`,
    );
    await waitFor(
      () =>
        fs.existsSync(path.join(into, 'inner', 'x.txt')) &&
        fs.existsSync(path.join(into, 'inner', 'y.txt')),
      'the files dropped on the folder to be copied into it',
    );
    await page.locator('.transfer-popup').waitFor({ state: 'detached' });
    assert.deepStrictEqual(fs.readdirSync(from).toSorted(), ['x.txt', 'y.txt']);
    await drop(undefined, false);
    await choose(strings.commander.dropMove, `Move 2 items to "${into}"`);
    await waitFor(
      () =>
        fs.existsSync(path.join(into, 'x.txt')) &&
        fs.existsSync(path.join(into, 'y.txt')) &&
        fs.readdirSync(from).length === 0,
      'the files dropped on the side to be moved into its folder',
    );
    await page.locator('.transfer-popup').waitFor({ state: 'detached' });

    assert.ok(!fs.existsSync(path.join(into, 'made.txt')));
    assert.ok(!fs.existsSync(path.join(into, 'inner', 'made.txt')));
    await page.evaluate(() =>
      document.querySelector('#dropped-files')?.remove(),
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('dropinto'),
      'the folder above to be listed again',
    );
  });

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
