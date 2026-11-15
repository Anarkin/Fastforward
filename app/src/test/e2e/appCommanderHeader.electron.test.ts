import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import {
  profile,
  page,
  right,
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
