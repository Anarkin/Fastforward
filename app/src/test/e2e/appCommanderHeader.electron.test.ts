import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import {
  profile,
  page,
  right,
  opened,
  select,
  openFolder,
  pathCut,
  pathPlaces,
  sharedCommanderApp,
} from './commanderAppFixtures';

const lines = () =>
  right()
    .locator('.column-handle')
    .evaluateAll((handles) =>
      handles.map(
        (handle) => getComputedStyle(handle, '::after').backgroundColor,
      ),
    );

suite('App commander', () => {
  sharedCommanderApp();

  test('puts the path of a side on a line of its own under its buttons, starting at the start of that row as the path of every tool does, and a long one running to its end', async () => {
    const long = `a folder named at such length that its path is cut ${'x'.repeat(160)}`;
    fs.mkdirSync(path.join(opened, long));
    try {
      const short = await pathPlaces();
      assert.deepStrictEqual(
        [
          short.underButtons,
          short.aboveHeadings,
          short.fromStart,
          short.shortOfEnd >= 0,
        ],
        [true, true, 0, true],
        JSON.stringify(short),
      );
      await select(long);
      await page.keyboard.press('Enter');
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent()) ===
          path.join(opened, long),
        'the long folder to open',
      );
      const places = await pathPlaces();
      assert.deepStrictEqual(
        [
          places.underButtons,
          places.aboveHeadings,
          places.fromStart,
          places.shortOfEnd,
        ],
        [true, true, 0, 0],
        JSON.stringify(places),
      );
      await page.keyboard.press('Backspace');
    } finally {
      fs.rmSync(path.join(opened, long), { recursive: true, force: true });
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent()) === opened,
        'the folder opened',
      );
    }
  });

  test('cuts the folders of a path too long for its header from their start, keeping those nearest the name in view, the separator before the name and the name whole, and an ellipsis of them once the name alone is too long, cut at its end', async () => {
    const long = `a folder named at such length that its path is cut ${'x'.repeat(160)}`;
    const folders = [long, 'in', 'end'];
    const longer = `a name too long for the header alone ${'y'.repeat(160)}`;
    fs.mkdirSync(path.join(opened, ...folders, longer), { recursive: true });
    try {
      for (let depth = 1; depth <= folders.length; depth++) {
        await openFolder(
          folders[depth - 1],
          path.join(opened, ...folders.slice(0, depth)),
        );
      }
      assert.deepStrictEqual(await pathCut(), {
        startCut: true,
        startMarked: true,
        nearestInView: true,
        separatorInView: true,
        nameWhole: true,
        nameInView: true,
      });
      await openFolder(longer, path.join(opened, ...folders, longer));
      assert.deepStrictEqual(await pathCut(), {
        startCut: true,
        startMarked: true,
        nearestInView: false,
        separatorInView: true,
        nameWhole: false,
        nameInView: true,
      });
    } finally {
      fs.rmSync(path.join(opened, long), { recursive: true, force: true });
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent()) === opened,
        'the folder opened',
      );
    }
  });

  test('shows where columns can be resized once the pointer is on the header, in the focus color on the one under it', async () => {
    const [border, focus] = await page.evaluate(() => {
      const probe = document.createElement('div');
      document.body.append(probe);
      const colors = ['--color-border', '--color-focus'].map((name) => {
        probe.style.backgroundColor = `var(${name})`;
        return getComputedStyle(probe).backgroundColor;
      });
      probe.remove();
      return colors;
    });
    await page.mouse.move(0, 0);
    assert.deepStrictEqual(await lines(), [
      'rgba(0, 0, 0, 0)',
      'rgba(0, 0, 0, 0)',
      'rgba(0, 0, 0, 0)',
    ]);
    await right().locator('.commander-sort').first().hover();
    assert.deepStrictEqual(await lines(), [border, border, border]);
    await right().locator('.column-handle').nth(1).hover({ force: true });
    assert.deepStrictEqual(await lines(), [border, focus, border]);
  });

  test('saves the width of a column dragged in the header to the user settings', async () => {
    const handle = right().locator('.column-handle').first();
    const box = await handle.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 40, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await waitFor(() => {
      const file = path.join(profile, 'settings.user.json');
      if (!fs.existsSync(file)) {
        return false;
      }
      const extension: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
        ?.tools?.commander?.columns?.extension;
      return typeof extension === 'number' && extension > 10;
    }, 'the width of the extension to be saved');
  });

  test('saves the order a header of a side is clicked for to the user settings, for that side', async () => {
    await right().locator('.commander-sort', { hasText: 'Size' }).click();
    await waitFor(() => {
      const file = path.join(profile, 'settings.user.json');
      if (!fs.existsSync(file)) {
        return false;
      }
      const sort: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))?.tools
        ?.commander?.sort;
      return (
        JSON.stringify(sort) ===
        JSON.stringify({
          left: { column: 'extension', descending: false, groupByColor: true },
          right: { column: 'size', descending: false, groupByColor: true },
        })
      );
    }, 'the order of the right side to be saved');
  });
});
