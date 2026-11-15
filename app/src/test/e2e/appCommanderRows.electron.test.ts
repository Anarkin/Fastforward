import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { waitForFocus } from './waits';
import {
  opened,
  page,
  right,
  rowNames,
  sharedCommanderApp,
} from './commanderAppFixtures';

suite('App commander', () => {
  sharedCommanderApp();

  test('shows the spaces of a name as they are, two in a row or one first, so names differing only in their spaces look apart', async () => {
    const names = ['spaced one', 'spaced  two', ' spaced first'];
    for (const name of names) {
      fs.writeFileSync(path.join(opened, `${name}.txt`), '');
    }
    try {
      await waitFor(async () => {
        const shown = await rowNames();
        return names.every((name) => shown.includes(`${name}.txt`));
      }, 'the files to be listed');
      const drawn = await right()
        .locator('.commander-row .commander-name')
        .evaluateAll((cells) =>
          cells.flatMap((cell) => {
            const text = cell.textContent ?? '';
            if (!text.includes('spaced')) {
              return [];
            }
            const range = document.createRange();
            range.selectNodeContents(cell);
            return [[text, range.getBoundingClientRect().width] as const];
          }),
        );
      const advance =
        (drawn.find(([text]) => text === 'spaced one')?.[1] ?? 0) /
        'spaced one'.length;
      assert.deepStrictEqual(
        drawn
          .map(([text, width]) => [text, Math.round(width / advance)] as const)
          .toSorted(([a], [b]) => a.localeCompare(b)),
        names
          .map((name) => [name, name.length] as const)
          .toSorted(([a], [b]) => a.localeCompare(b)),
      );
    } finally {
      for (const name of names) {
        fs.rmSync(path.join(opened, `${name}.txt`));
      }
    }
    await waitFor(
      async () => !(await rowNames()).some((name) => name.includes('spaced')),
      'the files to be gone from the list',
    );
  });

  test('ends an extension too long for its column with an ellipsis, as it ends a name too long for its column', async () => {
    const file = path.join(
      opened,
      'installer.appinstaller-of-a-long-extension',
    );
    fs.writeFileSync(file, '');
    try {
      const cell = right()
        .locator('.commander-row', { hasText: 'installer' })
        .locator('.commander-extension');
      await cell.waitFor();
      assert.deepStrictEqual(
        await cell.evaluate((element) => ({
          clipped: element.scrollWidth > element.clientWidth,
          ellipsis:
            getComputedStyle(element).textOverflow === 'ellipsis' &&
            getComputedStyle(element).display === 'block',
        })),
        { clipped: true, ellipsis: true },
      );
    } finally {
      fs.rmSync(file);
    }
    await waitFor(
      async () =>
        !(await rowNames()).some((name) => name.includes('installer')),
      'the file to be gone from the list',
    );
  });

  test('starts each row where the one above it ends, leaving no seam between their backgrounds', async () => {
    const names = ['seam1.txt', 'seam2.txt', 'seam3.txt', 'seam4.txt'];
    for (const name of names) {
      fs.writeFileSync(path.join(opened, name), name);
    }
    await waitFor(
      async () => (await rowNames()).includes('seam4.txt'),
      'the files to be listed',
    );
    const gaps = await right()
      .locator('.virtual-row')
      .evaluateAll((rows) =>
        rows
          .map((row) => row.getBoundingClientRect())
          .toSorted((one, other) => one.top - other.top)
          .slice(1)
          .map((box, index, boxes) => {
            const above =
              index === 0
                ? rows
                    .map((row) => row.getBoundingClientRect())
                    .toSorted((one, other) => one.top - other.top)[0]
                : boxes[index - 1];
            return above === undefined ? 0 : box.top - above.bottom;
          }),
      );
    assert.ok(gaps.length > 2);
    assert.ok(
      gaps.every((gap) => Math.abs(gap) < 0.01),
      `The gaps between the rows are ${gaps.join(', ')}`,
    );
    for (const name of names) {
      fs.rmSync(path.join(opened, name));
    }
    await waitFor(
      async () => !(await rowNames()).includes('seam4.txt'),
      'the files to be gone from the list',
    );
  });

  test('marks the selected row of the active side only', async () => {
    const left = page.locator('.commander-pane').nth(0);
    const transparent = 'rgba(0, 0, 0, 0)';
    const backgrounds = () =>
      Promise.all(
        [left, right()].map((pane) =>
          pane
            .locator('.commander-row.selected')
            .evaluate((row) => getComputedStyle(row).backgroundColor),
        ),
      );
    const marked = async (expected: readonly [boolean, boolean]) => {
      let seen: string[] = [];
      try {
        await waitFor(async () => {
          seen = await backgrounds();
          return seen.every(
            (color, index) => (color !== transparent) === expected[index],
          );
        }, 'the selected rows');
      } catch {
        assert.fail(
          `Expected the selected row marked on the left ${expected[0]} and on the right ${expected[1]}, but their backgrounds were ${seen.join(' and ')}`,
        );
      }
    };
    await page.mouse.move(0, 0);
    await right().locator('.virtual-rows').focus();
    await waitForFocus(right().locator('.virtual-rows'), 'the right side');
    await marked([false, true]);
    await page.keyboard.press('Tab');
    await waitForFocus(left.locator('.virtual-rows'), 'the left side');
    await marked([true, false]);
    await page.keyboard.press('Tab');
  });

  test('draws rows as the diff draws lines, in the monospace font and its line height', async () => {
    const row = await right()
      .locator('.commander-row')
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          family: style.fontFamily,
          height: element.getBoundingClientRect().height,
          lineHeight: style.lineHeight,
        };
      });
    assert.match(row.family, /JetBrains Mono/);
    assert.ok(
      Math.abs(row.height - parseFloat(row.lineHeight)) < 0.01,
      `${row.height} ${row.lineHeight}`,
    );
  });
});
