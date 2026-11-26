import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { waitForFocus } from './waits';
import {
  folder,
  opened,
  page,
  colorOf,
  hiding,
  hidingLine,
  right,
  rowNames,
  icons,
  sharedCommanderApp,
} from './commanderAppFixtures';
import {
  clickLine,
  hoverLine,
  lineOf,
  linesShown,
  rowsShown,
  selectedLine,
} from './commanderRows';

const markOf = () =>
  right().locator('.commander-pointed .commander-mark .tool-git');

const fillOf = () =>
  right()
    .locator('.commander-pointed .commander-mark')
    .evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        filled: style.backgroundColor !== 'rgba(0, 0, 0, 0)',
        ring: style.boxShadow,
        corner: style.borderTopLeftRadius,
        width: box.width,
        height: box.height,
      };
    });

suite('App commander', () => {
  sharedCommanderApp();

  test('lists the folder it was opened with on the right, the active side, folders first and then files by their colors and by extension, those of no color last, with their sizes', async () => {
    await waitForFocus(
      right().locator('.virtual-rows'),
      'the list of the right side',
    );
    assert.deepStrictEqual(await rowNames(), [
      '..',
      'src',
      'notes.txt',
      'big.bin',
    ]);
    assert.strictEqual(
      (await rowsShown(right())).find(({ name }) => name === 'big')?.size,
      '12,288',
    );
  });

  test('draws the name of a folder in brackets, the parent folder too, as Total Commander does, and the name of a file without', async () => {
    const drawn = (await rowsShown(right())).map((row) => row.drawn);
    assert.deepStrictEqual(drawn, ['[..]', '[src]', 'notes', 'big']);
  });

  test('dims a hidden file in its own color, or the color of the text without one, its icon with it, by the share the theme gives hidden files, and a hidden folder of the path alike', async () => {
    const share =
      Number.parseFloat(
        await page.evaluate(() =>
          getComputedStyle(document.body).getPropertyValue(
            '--color-hidden-file',
          ),
        ),
      ) / 100;
    assert.ok(share > 0.3 && share < 0.8, String(share));
    const dimmed = async (
      looked: Promise<{
        readonly before: { readonly color: number[]; readonly icon?: number };
        readonly after: { readonly color: number[]; readonly icon?: number };
      }>,
    ) => {
      const { before, after } = await looked;
      assert.ok(
        after.color
          .slice(0, 3)
          .every(
            (channel, index) =>
              Math.abs(channel - (before.color[index] ?? 0)) <= 1,
          ),
        `${after.color.join()} is not of the color ${before.color.join()}, a canvas reading a color half transparent back to a unit of it`,
      );
      assert.ok(
        Math.abs((after.color[3] ?? 0) / 255 - share) < 0.02,
        `${after.color.join()} is not ${share} of ${before.color.join()}`,
      );
      return { before, after };
    };

    const colored = await dimmed(hidingLine('notes'));
    const plain = await dimmed(hidingLine('big'));
    assert.notDeepStrictEqual(colored.before.color, plain.before.color);
    for (const { before, after } of [colored, plain]) {
      assert.strictEqual(before.icon, 1);
      assert.ok(Math.abs((after.icon ?? 0) - share) < 0.01, String(after.icon));
    }
    await dimmed(hiding(right().locator('.path-title .path-part').first()));
  });

  test('counts the size of a folder it marks on Space in the threads that count sizes, showing it in its Size column', async () => {
    const counted = path.join(opened, 'src', 'counted.bin');
    fs.writeFileSync(counted, Buffer.alloc(1000));
    try {
      await clickLine(page, right(), 'src');
      await page.keyboard.press(' ');
      await waitFor(
        async () =>
          (await rowsShown(right())).find(({ name }) => name === 'src')
            ?.size === '1,000',
        'the size of src',
      );
      await clickLine(page, right(), 'src');
      await page.keyboard.press(' ');
      await waitFor(
        async () => !(await lineOf(right(), 'src')).classes.includes('marked'),
        'src to be unmarked',
      );
    } finally {
      fs.rmSync(counted);
    }
  });

  test('draws the system icon of each file, and an outlined folder for folders', async () => {
    await waitFor(
      async () =>
        (await icons()).every(
          (icon) =>
            icon.folder ||
            icon.loaded ||
            (process.platform === 'linux' && icon.file),
        ),
      'every row to have its icon, the system icon of every file but on Linux',
    );
    const drawn = await icons();
    assert.deepStrictEqual(
      drawn.filter((icon) => icon.folder).map((icon) => icon.name),
      ['..', 'src'],
    );
    if (process.platform !== 'linux') {
      assert.ok(
        drawn.filter((icon) => !icon.folder).every((icon) => icon.loaded),
        JSON.stringify(drawn),
      );
    }
  });

  test('marks a folder that is a repository with the git icon in its Ext column, and no other, filled under the pointer as a rectangle as wide as the icon and as tall as the line, opening it in a git tab on a click of the icon', async () => {
    const made = path.join(folder, 'made-repository');
    execFileSync('git', ['init', '--quiet', made]);
    fs.renameSync(made, path.join(opened, 'repo'));
    await page.mouse.move(0, 0);
    await waitFor(
      async () => (await lineOf(right(), 'repo')).git === 'drawn',
      'the git icon of the repository drawn',
    );
    assert.ok((await lineOf(right(), 'repo')).gitSize >= 12);
    assert.strictEqual((await lineOf(right(), 'src')).git, 'none');
    assert.strictEqual((await lineOf(right(), 'src')).gitLeft, undefined);
    await hoverLine(page, right(), 'repo');
    assert.strictEqual((await fillOf()).filled, false);
    const repo = await lineOf(right(), 'repo');
    await hoverLine(page, right(), 'repo', {
      x: (repo.gitLeft ?? 0) + repo.gitSize / 2,
    });
    await waitFor(
      async () => (await fillOf()).filled,
      'the git icon to be filled under the pointer',
    );
    const fill = await fillOf();
    assert.deepStrictEqual(
      {
        ring: fill.ring,
        corner: fill.corner,
        width: Math.abs(fill.width - repo.gitSize) < 0.01,
        height: Math.abs(fill.height - repo.height) < 0.01,
      },
      { ring: 'none', corner: '0px', width: true, height: true },
    );
    assert.strictEqual(await colorOf(markOf()), repo.ink);
    const gitTab = page.locator('.tabs .tab.active', { hasText: 'repo' });
    const backToCommander = async () => {
      await page.keyboard.press('ControlOrMeta+W');
      await gitTab.waitFor({ state: 'detached' });
      await page.locator('.tabs .tab.active:has(.tool-commander)').waitFor();
    };
    await markOf().click();
    await gitTab.locator('.tool-git').waitFor();
    await backToCommander();

    fs.rmSync(path.join(opened, 'repo'), {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    });
    await waitFor(
      async () => !(await rowNames()).includes('repo'),
      'the repository to be gone from the list',
    );
  });

  test('shows the spaces of a name as they are, two in a row or one first, so names differing only in their spaces look apart', async () => {
    const names = ['spaced 1', 'spaced  2', ' spaced 3'];
    for (const name of names) {
      fs.writeFileSync(path.join(opened, `${name}.txt`), '');
    }
    try {
      await waitFor(async () => {
        const shown = await rowNames();
        return names.every((name) => shown.includes(`${name}.txt`));
      }, 'the files to be listed');
      const drawn = (await linesShown(right()))
        .map((line) => line.drawn)
        .filter((text) => text.includes('spaced'));
      assert.deepStrictEqual(drawn.toSorted(), names.toSorted());
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
      await waitFor(
        async () =>
          (await lineOf(right(), 'installer')).cut.includes('extension'),
        'the extension cut short',
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
    const lines = (await linesShown(right())).toSorted(
      (one, other) => one.top - other.top,
    );
    const gaps = lines.slice(1).map((line, index) => {
      const above = lines[index];
      return above === undefined ? 0 : line.top - (above.top + above.height);
    });
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
    const backgrounds = () =>
      Promise.all(
        [left, right()].map(async (pane) => {
          const lines = await linesShown(pane);
          const plain = lines.find(
            (line) =>
              !line.classes.includes('selected') &&
              !line.classes.includes('marked'),
          );
          return [(await selectedLine(pane))?.ground, plain?.ground] as const;
        }),
      );
    const marked = async (expected: readonly [boolean, boolean]) => {
      let seen: string[] = [];
      try {
        await waitFor(async () => {
          const shown = await backgrounds();
          seen = shown.map(([selected, plain]) => `${selected} over ${plain}`);
          return shown.every(
            ([selected, plain], index) =>
              (selected !== plain) === expected[index],
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
    const [line] = await linesShown(right());
    assert.ok(line);
    const lineHeight = await right()
      .locator('.commander-ruler')
      .evaluate((element) => getComputedStyle(element).lineHeight);
    const row = { family: line.family, height: line.height, lineHeight };
    assert.match(row.family, /JetBrains Mono/);
    assert.ok(
      Math.abs(row.height - parseFloat(row.lineHeight)) < 0.01,
      `${row.height} ${row.lineHeight}`,
    );
  });
});
