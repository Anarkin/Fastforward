import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Locator } from 'playwright-core';
import { suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { waitForFocus } from './waits';
import {
  folder,
  opened,
  page,
  colorOf,
  hiding,
  right,
  rowNames,
  icons,
  sharedCommanderApp,
} from './commanderAppFixtures';
import { rowsShown } from './commanderRows';

const rowOf = (name: string) =>
  right().locator('.commander-row', { hasText: name });

const markOf = (name: string) =>
  right()
    .locator('.commander-row', { hasText: name })
    .locator('.commander-extension .commander-mark .tool-git');

const clipsOf = (name: string) =>
  right()
    .locator('.commander-row', { hasText: name })
    .evaluate((element) => ({
      row: `${getComputedStyle(element).overflowX}${element.classList.contains('plain') ? ', one text' : ''}`,
      ...Object.fromEntries(
        ['name', 'extension', 'size', 'date'].map((cell) => {
          const found = element.querySelector(`.commander-${cell}`);
          return [
            cell,
            found === null
              ? 'missing'
              : `${getComputedStyle(found).overflowX}${found.scrollWidth > found.clientWidth ? ', too long' : ''}`,
          ];
        }),
      ),
    }));

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
    const dimmed = async (element: Locator) => {
      const { before, after } = await hiding(element);
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

    const colored = await dimmed(rowOf('notes'));
    const plain = await dimmed(rowOf('big'));
    assert.notDeepStrictEqual(colored.before.color, plain.before.color);
    for (const { before, after } of [colored, plain]) {
      assert.strictEqual(before.icon, 1);
      assert.ok(Math.abs((after.icon ?? 0) - share) < 0.01, String(after.icon));
    }
    await dimmed(right().locator('.path-title .path-part').first());
  });

  test('counts the size of a folder it marks on Space in the threads that count sizes, showing it in its Size column', async () => {
    const counted = path.join(opened, 'src', 'counted.bin');
    fs.writeFileSync(counted, Buffer.alloc(1000));
    try {
      const source = right().locator('.commander-row', { hasText: 'src' });
      await source.click();
      await page.keyboard.press(' ');
      await waitFor(
        async () =>
          (await rowsShown(right())).find(({ name }) => name === 'src')
            ?.size === '1,000',
        'the size of src',
      );
      await source.click();
      await page.keyboard.press(' ');
      await waitFor(
        async () =>
          !((await source.getAttribute('class')) ?? '').includes('marked'),
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
          (icon) => !icon.loading && (icon.folder || icon.file || icon.loaded),
        ),
      'every row to have its icon, none still loading',
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

  test('marks a folder that is a repository with the git icon in its Ext column, and no other, opening it in a git tab on a click of the icon', async () => {
    const made = path.join(folder, 'made-repository');
    execFileSync('git', ['init', '--quiet', made]);
    fs.renameSync(made, path.join(opened, 'repo'));
    await markOf('repo').waitFor();
    assert.strictEqual(await markOf('src').count(), 0);
    const repoRow = right().locator('.commander-row', { hasText: 'repo' });
    const surroundOf = () =>
      repoRow
        .locator('.commander-mark')
        .evaluate((element) => getComputedStyle(element).boxShadow);
    await page.mouse.move(0, 0);
    assert.strictEqual(await surroundOf(), 'none');
    await repoRow.locator('.commander-mark').hover();
    assert.strictEqual(
      await colorOf(markOf('repo')),
      await colorOf(repoRow.locator('.commander-name')),
    );
    assert.notStrictEqual(await surroundOf(), 'none');

    const gitTab = page.locator('.tabs .tab.active', { hasText: 'repo' });
    const backToCommander = async () => {
      await page.keyboard.press('ControlOrMeta+W');
      await gitTab.waitFor({ state: 'detached' });
      await page.locator('.tabs .tab.active:has(.tool-commander)').waitFor();
    };
    await markOf('repo').click();
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
        .locator('.commander-row')
        .evaluateAll((rows) =>
          rows.flatMap((row) => {
            const cell = row.querySelector('.commander-name');
            const written =
              cell?.firstChild ??
              [...row.childNodes].find(
                (node) => node.nodeType === Node.TEXT_NODE,
              );
            const whole = written?.textContent ?? '';
            const tab = whole.indexOf(String.fromCharCode(9));
            const text =
              cell === null && tab !== -1 ? whole.slice(0, tab) : whole;
            if (written === undefined || !text.includes('spaced')) {
              return [];
            }
            const range = document.createRange();
            range.setStart(written, 0);
            range.setEnd(written, text.length);
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

  test('clips a row only where its text may not fit: nothing of a row drawn as one text, which is drawn so only while it fits, and of a row drawn with cells the name, which takes the room left, but not an extension, a size or a date that fits its column, as a clip for every cell of every row had each frame of a scroll paint a thousand of them', async () => {
    const celled = path.join(opened, 'cellé.txt');
    fs.writeFileSync(celled, '');
    try {
      await right().locator('.commander-row', { hasText: 'cellé' }).waitFor();
      assert.deepStrictEqual(await clipsOf('notes'), {
        row: 'visible, one text',
        name: 'missing',
        extension: 'missing',
        size: 'missing',
        date: 'missing',
      });
      assert.deepStrictEqual(await clipsOf('cellé'), {
        row: 'clip',
        name: 'hidden',
        extension: 'visible',
        size: 'visible',
        date: 'visible',
      });
    } finally {
      fs.rmSync(celled);
    }
    await waitFor(
      async () => !(await rowNames()).includes('cellé.txt'),
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
