import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Locator } from 'playwright-core';
import { suite, test } from 'vitest';
import { strings } from '../shared/strings';
import { waitFor } from './fixtures';
import { waitForFocus } from './appFixtures';
import { storedZip } from './zips';
import {
  folder,
  opened,
  profile,
  page,
  colorOf,
  hiding,
  right,
  rowNames,
  icons,
  selected,
  select,
  openFolder,
  pathCut,
  pathPlaces,
  savedBookmarks,
  sharedCommanderApp,
} from './commanderAppFixtures';

const rowOf = (name: string) =>
  right().locator('.commander-row', { hasText: name });

const markOf = (name: string) =>
  right()
    .locator('.commander-row', { hasText: name })
    .locator('.commander-extension .commander-mark .tool-git');

const folderShown = async () =>
  (await right().locator('.column-name').textContent()) ?? '';

const placesOf = () =>
  page.locator('.viewer').evaluate((viewer) => {
    const box = (selector: string) => {
      const found = viewer.querySelector(selector);
      if (found === null) {
        throw new Error(selector);
      }
      return found.getBoundingClientRect();
    };
    const header = box('.column-title');
    const start = box('.column-title .column-start');
    const actions = box('.column-title .column-actions');
    const text = box('.path-text');
    const row = box('.viewer-rows .viewer-row');
    return {
      inHeader: viewer.querySelector('.column-title .path-title') !== null,
      underHeader: text.top >= header.bottom,
      aboveText: text.bottom <= row.top,
      fromText: Math.round(text.left - row.left),
      start: Math.round(start.left - header.left),
      actions: Math.round(header.right - actions.right),
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
      await right()
        .locator('.commander-row', { hasText: 'big' })
        .locator('.commander-size')
        .textContent(),
      '12,288',
    );
  });

  test('draws the name of a folder in brackets, the parent folder too, as Total Commander does, and the name of a file without', async () => {
    const drawn = await right()
      .locator('.commander-row.commander-line')
      .evaluateAll((rows) =>
        rows.map((row) => {
          const name = row.querySelector('.commander-name');
          const around = (part: string) => {
            const content = name ? getComputedStyle(name, part).content : '';
            return content === 'none' ? '' : content.replaceAll('"', '');
          };
          return `${around('::before')}${name?.textContent ?? ''}${around('::after')}`;
        }),
      );
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

  test('opens a folder with Enter and goes back up with Backspace, selecting the folder it came from', async () => {
    await right().locator('.commander-row', { hasText: 'src' }).click();
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).join() === '..,main.ts',
      'the listing of src',
    );
    await page.keyboard.press('Backspace');
    await waitFor(
      async () =>
        (
          await right().locator('.commander-row.selected').textContent()
        )?.includes('src') === true,
      'src to be selected again',
    );
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
          (await source.locator('.commander-size').textContent()) === '1,000',
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

  test('opens a folder with a double click, and one with a double click right after, which Chromium counts on from 3', async () => {
    await right().locator('.commander-row', { hasText: 'src' }).dblclick();
    await waitFor(
      async () => (await rowNames()).join() === '..,main.ts',
      'the listing of src',
    );
    await right().locator('.commander-row', { hasText: '..' }).hover();
    await page.mouse.down({ clickCount: 3 });
    await page.mouse.up({ clickCount: 3 });
    await page.mouse.down({ clickCount: 3 });
    await page.mouse.up({ clickCount: 3 });
    await waitFor(
      async () => (await rowNames()).length === 4,
      'the listing of the folder opened',
    );
  });

  test('shows a file made in the folder shown at once, and drops it once removed', async () => {
    const made = path.join(opened, 'made.log');
    fs.writeFileSync(made, 'made');
    await waitFor(
      async () => (await rowNames()).includes('made.log'),
      'the file made to be listed',
    );
    fs.rmSync(made);
    await waitFor(
      async () => !(await rowNames()).includes('made.log'),
      'the file removed to be dropped',
    );
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

  test('opens the folder of the active side in another tool, the left one once Tab makes it active', async () => {
    const left = page.locator('.commander-pane').nth(0);
    await right().locator('.virtual-rows').focus();
    await page.keyboard.press('Tab');
    await waitForFocus(
      left.locator('.virtual-rows'),
      'the list of the left side',
    );
    assert.notStrictEqual(
      await left.locator('.column-name').textContent(),
      await right().locator('.column-name').textContent(),
    );
    await page.keyboard.press('ControlOrMeta+Shift+O');
    await page.locator('.open-with-folders').waitFor();
    assert.strictEqual(
      await page.locator('.open-with-folders').textContent(),
      await left.locator('.column-name').textContent(),
    );
    await page.keyboard.press('Escape');
    await page.locator('.open-with-folders').waitFor({ state: 'detached' });
    await page.keyboard.press('Tab');
    await waitForFocus(
      right().locator('.virtual-rows'),
      'the list of the right side',
    );
  });

  test('enters a zip from the menu of the file through 7-Zip, listing what it holds as the folders of the side, views a file of it on F3 from a copy, and leaves it going back selecting the zip', async () => {
    const zip = path.join(opened, 'packed.zip');
    fs.writeFileSync(
      zip,
      storedZip([
        ['docs/readme.md', '# readme'],
        ['top.txt', 'the top of the zip'],
      ]),
    );
    const zipRow = right().locator('.commander-row', { hasText: 'packed' });
    await zipRow.waitFor();
    await zipRow.locator('.commander-name').click({ button: 'right' });
    await page
      .locator('.context-menu .menu-item', {
        hasText: strings.commander.openWithSevenZip,
      })
      .click();
    await waitFor(
      async () => (await rowNames()).join() === '..,docs,top.txt',
      'the zip to be listed as a folder',
    );
    await select('top');
    await page.keyboard.press('F3');
    await page.locator('.tabs .tab.active', { hasText: 'top.txt' }).waitFor();
    await page.locator('.viewer', { hasText: 'the top of the zip' }).waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });

    await right().locator('.virtual-rows').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await waitFor(
      async () => (await selected()).includes('packed'),
      'the folder of the zip with the zip selected',
    );
    fs.rmSync(zip);
    await waitFor(
      async () => !(await rowNames()).includes('packed.zip'),
      'the zip to be gone',
    );
  });

  test('enters a zip on its own side with Mod+Right, and copies a folder of it into the folder of the other side on F5 once confirmed, taken out with 7-Zip through the process that copies', async () => {
    const zip = path.join(opened, 'packed-copy.zip');
    const into = path.join(opened, 'unpackinto');
    fs.mkdirSync(into);
    fs.writeFileSync(
      zip,
      storedZip([
        ['docs/readme.md', '# readme'],
        ['top.txt', 'the top of the zip'],
      ]),
    );
    const left = page.locator('.commander-pane').nth(0);
    const popup = page.locator('.confirm-popup');
    await select('unpackinto');
    await page.keyboard.press('ControlOrMeta+ArrowLeft');
    await waitFor(
      async () => (await left.locator('.column-name').textContent()) === into,
      'the left side to open the target',
    );
    await select('packed-copy');
    await page.keyboard.press('ControlOrMeta+ArrowRight');
    await waitFor(
      async () => (await rowNames()).join() === '..,docs,top.txt',
      'the zip to be entered on its own side',
    );

    await select('docs');
    await page.keyboard.press('F5');
    await popup.waitFor();
    await page.keyboard.press('Enter');
    await waitFor(
      () => fs.existsSync(path.join(into, 'docs', 'readme.md')),
      'the folder to be copied out of the zip',
    );
    await page.locator('.transfer-popup').waitFor({ state: 'detached' });
    assert.strictEqual(
      fs.readFileSync(path.join(into, 'docs', 'readme.md'), 'utf8'),
      '# readme',
    );

    await right().locator('.virtual-rows').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await waitFor(
      async () => (await selected()).includes('packed-copy'),
      'the folder of the zip with the zip selected',
    );
    fs.rmSync(zip);
    fs.rmSync(into, { recursive: true });
    await waitFor(async () => {
      const names = await rowNames();
      return (
        !names.includes('packed-copy.zip') && !names.includes('unpackinto')
      );
    }, 'the zip and the folder copied into to be gone');
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
      await page
        .locator('.tabs .tab.active', { hasText: 'Commander' })
        .waitFor();
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

  test('says in a window, not a notice, that a folder can’t be read, closing it with Enter', async () => {
    const locked = path.join(opened, 'locked');
    fs.mkdirSync(locked);
    const user = process.env.USERNAME ?? '';
    if (process.platform === 'win32') {
      execFileSync('icacls', [locked, '/deny', `${user}:(RX)`]);
    } else {
      fs.chmodSync(locked, 0o000);
    }
    try {
      await right().locator('.commander-row', { hasText: 'locked' }).click();
      await waitFor(
        async () =>
          (
            await right().locator('.commander-row.selected').textContent()
          )?.includes('locked') === true,
        'the locked folder to be selected',
      );
      await page.keyboard.press('Enter');
      const popup = page.locator('.confirm-popup');
      await popup.waitFor();
      assert.deepStrictEqual(
        [
          await popup.locator('.confirm-question > span').textContent(),
          await popup.locator('.name-value').allTextContents(),
        ],
        [strings.commander.noAccess, [locked]],
      );
      assert.strictEqual(await page.locator('.notice').count(), 0);
      assert.deepStrictEqual(
        await popup.locator('.confirm-button').allTextContents(),
        process.platform === 'win32'
          ? [strings.commander.asAdministrator, strings.confirm.ok]
          : [strings.confirm.ok],
      );
      await waitForFocus(
        popup.locator('.confirm-button.default'),
        'the OK button of the window',
      );
      await page.keyboard.press('Enter');
      await popup.waitFor({ state: 'detached' });
      assert.strictEqual(
        await right().locator('.column-name').textContent(),
        opened,
      );
    } finally {
      if (process.platform === 'win32') {
        execFileSync('icacls', [locked, '/remove:d', user]);
      } else {
        fs.chmodSync(locked, 0o755);
      }
      fs.rmdirSync(locked);
    }
  });

  test('goes back through the folders of the side with Alt+Left, and forward again with its button', async () => {
    await right().locator('.virtual-rows').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await waitFor(
      async () => (await rowNames()).join() === '..,main.ts',
      'the folder before, src',
    );
    await right()
      .locator('.nav-button', { has: page.locator('svg') })
      .nth(1)
      .click();
    await waitFor(
      async () =>
        (await right().locator('.column-name').textContent()) === opened,
      'the folder after, the one opened',
    );
  });

  test('puts the path of a side on a line of its own under its buttons, starting where the names of its rows start, and a long one running to the end of their dates', async () => {
    const long = `a folder named at such length that its path is cut ${'x'.repeat(160)}`;
    fs.mkdirSync(path.join(opened, long));
    try {
      const short = await pathPlaces();
      assert.deepStrictEqual(
        [
          short.underButtons,
          short.aboveHeadings,
          short.fromNames,
          short.shortOfDates >= 0,
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
          places.fromNames,
          places.shortOfDates,
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

  test('bookmarks the folder of the active side from the menu Ctrl+D opens, filling the star of the side and saving it to the user settings, and goes back to it by its key from another folder', async () => {
    const filledStar = right().locator(
      `button[title="${strings.commander.bookmarks}"] .bookmark-icon.filled`,
    );
    const bookmarked = await folderShown();
    await right().locator('.virtual-rows').focus();
    assert.strictEqual(await filledStar.count(), 0);

    await page.keyboard.press('Control+d');
    await right()
      .locator('.menu-item', { hasText: strings.commander.addBookmark })
      .waitFor();
    await page.keyboard.press('Enter');
    await filledStar.waitFor();
    await waitFor(
      () => savedBookmarks() === JSON.stringify([bookmarked]),
      'the folder of the side to be saved as a bookmark',
    );

    await select('src');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await folderShown()) === path.join(bookmarked, 'src'),
      'src to open',
    );
    await filledStar.waitFor({ state: 'detached' });
    await page.keyboard.press('Control+d');
    await right().locator('.menu-item', { hasText: bookmarked }).waitFor();
    await page.keyboard.press('1');
    await waitFor(
      async () => (await folderShown()) === bookmarked,
      'the bookmark to open',
    );
    await filledStar.waitFor();
  });

  test('opens the selected folder on the left side with Mod+Left, or the folder it is in when a file is selected', async () => {
    const left = page.locator('.commander-pane').nth(0);
    await select('src');
    await page.keyboard.press('ControlOrMeta+ArrowLeft');
    await waitFor(
      async () =>
        (await left.locator('.column-name').textContent()) ===
        path.join(opened, 'src'),
      'the left side to open src',
    );
    await select('notes');
    await page.keyboard.press('ControlOrMeta+ArrowLeft');
    await waitFor(
      async () => (await left.locator('.column-name').textContent()) === opened,
      'the left side to open the folder of the file',
    );
  });

  test('views a file in a tab of its own with F3, saved as one, and goes back to the commander with Escape, its row still selected', async () => {
    await select('notes');
    await page.keyboard.press('F3');
    await page.locator('.tabs .tab.active', { hasText: 'notes.txt' }).waitFor();
    await page.locator('.viewer').waitFor();
    if (process.platform !== 'linux') {
      await waitFor(
        () =>
          page
            .locator('.tabs .tab.active img.tab-icon')
            .evaluate(
              (image: HTMLImageElement) =>
                image.complete && image.naturalWidth > 0,
            ),
        'the tab to show the icon of the file',
      );
    }
    await waitFor(() => {
      const state: unknown = JSON.parse(
        fs.readFileSync(path.join(profile, 'state.json'), 'utf8'),
      );
      return JSON.stringify(state).includes('"view":true');
    }, 'the viewing tab to be saved');

    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    await page.locator('.tabs .tab.active', { hasText: 'Commander' }).waitFor();
    assert.strictEqual(
      await page
        .locator('.tabs [role="tab"]', { hasText: 'notes.txt' })
        .count(),
      0,
    );
    assert.match(
      (await right().locator('.commander-row.selected').textContent()) ?? '',
      /^notes/,
    );
    await page.keyboard.press('ArrowUp');
    await waitFor(
      async () =>
        !(
          (await right().locator('.commander-row.selected').textContent()) ?? ''
        ).startsWith('notes'),
      'the keys to move the selection again',
    );
  });

  test('puts the path of a file viewed on a line of its own under the buttons of its header, starting where the editor starts its path, the empty column of line numbers before its text, the buttons staying at the edges of the header', async () => {
    await select('notes');
    await page.keyboard.press('F3');
    await page.locator('.viewer .viewer-rows .viewer-row').first().waitFor();
    assert.deepStrictEqual(await placesOf(), {
      inHeader: false,
      underHeader: true,
      aboveText: true,
      fromText: 8 - 56 - 6,
      start: 4,
      actions: 4,
    });

    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    await page.locator('.tabs .tab.active', { hasText: 'Commander' }).waitFor();
  });
});
