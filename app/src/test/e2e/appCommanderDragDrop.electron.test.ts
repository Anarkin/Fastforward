import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import {
  opened,
  app,
  page,
  right,
  rowNames,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';
import { pointedLine, selectedText } from './commanderRows';
import { tilesCount } from './commanderTiles';

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
      const layer = side.querySelector('.commander-layer');
      const seen =
        dropOnto === undefined || !(layer instanceof HTMLElement)
          ? undefined
          : (layer.seenLines?.() ?? layer.seenTiles?.())?.find(
              (each) => each.key === dropOnto,
            );
      const element =
        dropOnto === undefined
          ? side.querySelector('.column-body')
          : side.querySelector('.virtual-rows');
      const box = element?.getBoundingClientRect();
      const init = {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
        clientX:
          seen === undefined
            ? (box?.left ?? 0) + 20
            : seen.left + seen.width / 2,
        clientY:
          seen === undefined
            ? (box?.bottom ?? 0) - 5
            : seen.top + seen.height / 2,
      };
      element?.dispatchEvent(new DragEvent('dragover', init));
      element?.dispatchEvent(new DragEvent('drop', init));
    },
    { onto, made },
  );

const choose = async (label: string, title: string) => {
  const item = page.locator('.context-menu .menu-item', { hasText: label });
  await item.waitFor();
  assert.strictEqual(await item.getAttribute('data-tip'), title);
  await item.click();
};

suite('App commander', () => {
  sharedCommanderApp();

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

    await (await pointedLine(page, right(), 'two')).dispatchEvent('dragstart');
    await waitFor(
      async () => (await draggedFiles()).length === 1,
      'the marked files to be dragged',
    );
    await (
      await pointedLine(page, right(), 'three')
    ).dispatchEvent('dragstart');
    await waitFor(
      async () => (await draggedFiles()).length === 2,
      'the file dragged to be dragged alone',
    );

    assert.deepStrictEqual(await draggedFiles(), [
      [path.join(dragging, 'one.txt'), path.join(dragging, 'two.txt')],
      [path.join(dragging, 'three.txt')],
    ]);
    assert.match(await selectedText(right()), /^three/);
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

  test('copies or moves files dropped on a side as the menu it shows at the pointer says, into the folder dropped on, its line or its tile, or that of the side, taking only files of the system, never one the page makes', async () => {
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
    await right().locator('.virtual-rows').focus();
    await page.keyboard.press('ControlOrMeta+2');
    await waitFor(async () => (await tilesCount(right())) > 0, 'the tiles');
    await drop('inner', false);
    const onTile = page.locator('.context-menu .menu-item', {
      hasText: strings.commander.dropCopy,
    });
    await onTile.waitFor();
    assert.strictEqual(
      await onTile.getAttribute('data-tip'),
      `Copy 2 items to "${path.join(into, 'inner')}"`,
    );
    await page.keyboard.press('Escape');
    await page.locator('.context-menu').waitFor({ state: 'detached' });
    await right().locator('.virtual-rows').focus();
    await page.keyboard.press('ControlOrMeta+1');
    await waitFor(
      async () => (await tilesCount(right())) === 0,
      'the details again',
    );
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
});
