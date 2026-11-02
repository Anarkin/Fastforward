import * as assert from 'node:assert';
import { maxColoredBytes } from '../tools/commander/shared/protocol';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../shared/strings';
import { waitFor } from './fixtures';
import { pdfOf } from './pdfs';
import { closeOrKill, launchApp, waitForFocus } from './appFixtures';
import { removeFolder, tempFolder } from './repositories';

const threeLines = (changed: string) =>
  ['one', changed, 'three', ''].join(String.fromCharCode(10));

const savedText = (profile: string, name: string): unknown => {
  const file = path.join(profile, 'settings.user.json');
  const settings: unknown = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : {};
  const text: unknown =
    typeof settings === 'object' && settings !== null
      ? Reflect.get(settings, 'text')
      : undefined;
  return typeof text === 'object' && text !== null
    ? Reflect.get(text, name)
    : undefined;
};

suite('App commander', () => {
  let folder: string;
  let opened: string;
  let profile: string;
  let app: ElectronApplication;
  let page: Page;

  const right = () => page.locator('.commander-pane').nth(1);
  const rowNames = (pane = right()) =>
    pane
      .locator('.commander-row')
      .evaluateAll((rows) =>
        rows.map((row) =>
          [
            row.querySelector('.commander-name')?.textContent,
            row.querySelector('.commander-extension')?.textContent,
          ]
            .filter(Boolean)
            .join('.'),
        ),
      );

  const markedNames = () =>
    right().locator('.commander-row.marked .commander-name').allTextContents();

  const markingRow = (name: string) =>
    right().locator('.commander-row', { hasText: `${name}txt` });

  const icons = () =>
    right()
      .locator('.commander-row')
      .evaluateAll((rows) =>
        rows.map((row) => {
          const image = row.querySelector<HTMLImageElement>(
            '.commander-icon img',
          );
          return {
            name: row.querySelector('.commander-name')?.textContent,
            folder: row.querySelector('.commander-icon .folder-icon') !== null,
            file: row.querySelector('.commander-icon .file-icon') !== null,
            loaded: image !== null && image.complete && image.naturalWidth > 0,
          };
        }),
      );

  const firstViewerRow = async () =>
    (await page.locator('.viewer-rows .viewer-row').first().textContent()) ??
    '';
  const findMarks = () =>
    page
      .locator('.viewer-rows .find-match')
      .evaluateAll((elements) =>
        elements.map((element) => [
          element.textContent,
          element.classList.contains('current'),
        ]),
      );
  const findCount = () =>
    page.locator('.viewer .find-field-count').textContent();
  const selected = async () =>
    (await right().locator('.commander-row.selected').textContent()) ?? '';
  const viewerThumb = () =>
    page.locator('.viewer-thumb').evaluate((element) => {
      const box = element.getBoundingClientRect();
      const track = element.parentElement?.getBoundingClientRect();
      return {
        top: box.top,
        height: box.height,
        fromEnd: (track?.bottom ?? 0) - box.bottom,
      };
    });
  const select = async (name: string) => {
    await right().locator('.commander-row', { hasText: name }).click();
    await waitFor(
      async () =>
        (
          await right().locator('.commander-row.selected').textContent()
        )?.includes(name) === true,
      `${name} to be selected`,
    );
  };
  beforeAll(async () => {
    folder = tempFolder('app-commander');
    profile = path.join(folder, 'profile');
    opened = path.join(folder, 'opened');
    fs.mkdirSync(path.join(opened, 'src'), { recursive: true });
    fs.writeFileSync(path.join(opened, 'notes.txt'), '12345');
    fs.writeFileSync(path.join(opened, 'big.bin'), Buffer.alloc(12_288));
    fs.writeFileSync(path.join(opened, 'src', 'main.ts'), '');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [{ id: '1', tool: 'commander', root: opened }],
        activeTab: '1',
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await right().locator('.commander-row').first().waitFor();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  test('lists the folder it was opened with on the right, the active side, folders first and then files by extension, with their sizes', async () => {
    await waitForFocus(
      right().locator('.virtual-rows'),
      'the list of the right side',
    );
    assert.deepStrictEqual(await rowNames(), [
      '..',
      'src',
      'big.bin',
      'notes.txt',
    ]);
    assert.strictEqual(
      await right()
        .locator('.commander-row', { hasText: 'big' })
        .locator('.commander-size')
        .textContent(),
      '12,288',
    );
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

  test('opens a folder with a double click', async () => {
    await right().locator('.commander-row', { hasText: 'src' }).dblclick();
    await waitFor(
      async () => (await rowNames()).join() === '..,main.ts',
      'the listing of src',
    );
    await page.keyboard.press('Backspace');
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
          (icon) => icon.folder || icon.file || icon.loaded,
        ),
      'every row to have its icon',
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
      assert.strictEqual(
        await popup.locator('.confirm-body > span').textContent(),
        strings.commander.noAccess(locked),
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

  test('filters the files of a side on Ctrl+F or Alt and a letter by every word anywhere in their names, moving among them with the arrows as one types, and clears the filter on Esc or once a folder opens', async () => {
    const names = ['alpha-report.txt', 'beta.txt', 'Report-gamma.md'];
    for (const name of names) {
      fs.writeFileSync(path.join(opened, name), name);
    }
    fs.mkdirSync(path.join(opened, 'reports-folder'));
    try {
      await waitFor(
        async () => (await rowNames()).includes('reports-folder'),
        'the files to be listed',
      );
      await select('beta');
      await page.keyboard.press('ControlOrMeta+F');
      await waitForFocus(
        right().locator('.commander-filter-input'),
        'the filter',
      );
      await page.keyboard.type('rep gam');
      await waitFor(
        async () =>
          JSON.stringify((await rowNames()).filter((name) => name !== '..')) ===
          JSON.stringify(['Report-gamma.md']),
        'only the file with both words',
      );
      assert.ok((await selected()).includes('Report-gamma'));
      await page.keyboard.press('ControlOrMeta+F');
      await page.keyboard.type('report');
      await waitFor(
        async () =>
          JSON.stringify(
            (await rowNames()).filter((name) => name !== '..').toSorted(),
          ) ===
          JSON.stringify([
            'Report-gamma.md',
            'alpha-report.txt',
            'reports-folder',
          ]),
        'the files and the folder with the word',
      );
      assert.match(
        (await right().locator('.find-field-count').textContent()) ?? '',
        /^3 of \d+$/,
      );
      assert.strictEqual(
        await right().locator('.commander-row .match').first().textContent(),
        'report',
      );
      await page.keyboard.press('ArrowDown');
      await waitFor(
        async () => (await selected()).includes('alpha-report'),
        'the next match selected',
      );

      await page.keyboard.press('Enter');
      await waitForFocus(right().locator('.virtual-rows'), 'the list');
      assert.ok(await right().locator('.commander-filter-input').isVisible());
      await page.keyboard.press('Escape');
      await right()
        .locator('.commander-filter-input')
        .waitFor({ state: 'detached' });
      await waitFor(
        async () => (await rowNames()).includes('beta.txt'),
        'every file again',
      );
      assert.ok((await selected()).includes('alpha-report'));

      await page.keyboard.press('ControlOrMeta+F');
      await page.keyboard.type('folder');
      await waitFor(
        async () => (await selected()).includes('reports-folder'),
        'the folder selected',
      );
      await page.keyboard.press('Enter');
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent())?.endsWith(
            'reports-folder',
          ) === true,
        'the folder opened',
      );
      await waitForFocus(
        right().locator('.virtual-rows'),
        'the list in the folder',
      );
      assert.strictEqual(
        await right().locator('.commander-filter-input').count(),
        0,
      );
      await page.keyboard.press('Backspace');
      await waitFor(
        async () => (await rowNames()).includes('beta.txt'),
        'the folder left',
      );

      await page.keyboard.press('Alt+b');
      await waitForFocus(
        right().locator('.commander-filter-input'),
        'the filter from Alt and a letter',
      );
      await page.keyboard.press('Alt+e');
      await waitFor(
        async () =>
          (await right().locator('.commander-filter-input').inputValue()) ===
            'be' &&
          JSON.stringify((await rowNames()).filter((name) => name !== '..')) ===
            JSON.stringify(['beta.txt']),
        'the files with the letters typed with Alt',
      );
      await page.keyboard.press('Escape');
      await right()
        .locator('.commander-filter-input')
        .waitFor({ state: 'detached' });
    } finally {
      if (await right().locator('.commander-filter-input').isVisible()) {
        await right().locator('.commander-filter-input').press('Escape');
        await right()
          .locator('.commander-filter-input')
          .waitFor({ state: 'detached' });
      }
      for (const name of names) {
        fs.rmSync(path.join(opened, name));
      }
      fs.rmSync(path.join(opened, 'reports-folder'), { recursive: true });
      await waitFor(
        async () => !(await rowNames()).includes('beta.txt'),
        'the files to be gone from the list',
      );
    }
  });

  test('previews a PDF, searching it on Ctrl+F without leaving the preview, and opens it again where it was left', async () => {
    fs.writeFileSync(
      path.join(opened, 'book.pdf'),
      pdfOf(
        Array.from({ length: 12 }, (_page, pageIndex) =>
          Array.from({ length: 40 }, (_line, line) =>
            line === 20 && (pageIndex === 2 || pageIndex === 8)
              ? `Needle on page ${pageIndex + 1}`
              : `Page ${pageIndex + 1}, line ${line + 1}`,
          ),
        ),
      ),
    );
    const scroller = page.locator('.viewer .pdf-scroll');
    const count = () => page.locator('.viewer .find-field-count').textContent();
    const shownPage = () =>
      scroller.evaluate((element) => {
        const top = element.getBoundingClientRect().top;
        const pages = [...element.querySelectorAll('.page')];
        return (
          pages.findIndex(
            (each) => each.getBoundingClientRect().bottom > top + 40,
          ) + 1
        );
      });
    try {
      await select('book');
      await page.keyboard.press('F3');
      await page
        .locator('.viewer .textLayer', { hasText: 'Page 1, line 1' })
        .waitFor();
      await waitForFocus(scroller, 'the PDF');
      assert.strictEqual(
        await page.locator('.viewer .page').first().getAttribute('aria-label'),
        'Page 1',
      );

      await page.keyboard.press('ControlOrMeta+F');
      await waitForFocus(
        page.locator('.viewer .find-field-input'),
        'the search',
      );
      await page.keyboard.type('needle');
      await waitFor(
        async () => (await count()) === '1 of 2',
        'the matches counted',
      );
      await page.locator('.viewer .textLayer .highlight.selected').waitFor();
      await page.keyboard.press('Enter');
      await waitFor(async () => (await count()) === '2 of 2', 'the next match');
      await waitFor(
        async () => (await shownPage()) === 9,
        'the page of the match',
      );
      await page.keyboard.press('Escape');
      await page.locator('.viewer .find-field').waitFor({ state: 'detached' });
      assert.strictEqual(await page.locator('.viewer .pdf-pane').count(), 1);

      await scroller.evaluate((element) => {
        const seventh = element.querySelectorAll('.page')[6];
        if (seventh instanceof HTMLElement) {
          element.scrollTop = seventh.offsetTop + 20;
        }
      });
      const pdfState = () =>
        scroller.evaluate((element) => ({
          scrollTop: element.scrollTop,
          seventh: [...element.querySelectorAll('.page')].map((each) =>
            each instanceof HTMLElement ? each.offsetTop : -1,
          )[6],
          count: element.querySelectorAll('.page').length,
        }));
      await waitFor(
        async () => (await shownPage()) === 7,
        'page 7 shown',
      ).catch(async (error: unknown) => {
        throw new Error(
          `${String(error)}: page ${await shownPage()} shown, ${JSON.stringify(await pdfState())}`,
        );
      });
      await scroller.focus();
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });

      await select('book');
      await page.keyboard.press('F3');
      await page.locator('.viewer .textLayer').first().waitFor();
      await waitFor(
        async () => (await shownPage()) === 7,
        'the PDF opened at page 7 again',
      ).catch(async (error: unknown) => {
        throw new Error(
          `${String(error)}: page ${await shownPage()} shown, ${JSON.stringify(await pdfState())}, places ${fs.existsSync(path.join(profile, 'pdf-places.json')) ? fs.readFileSync(path.join(profile, 'pdf-places.json'), 'utf8') : 'none saved'}`,
        );
      });
    } finally {
      if (await page.locator('.viewer .find-field').isVisible()) {
        await page.keyboard.press('Escape');
      }
      if (await page.locator('.viewer').isVisible()) {
        await scroller.focus();
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'book.pdf'));
      await waitFor(
        async () => !(await rowNames()).includes('book.pdf'),
        'the file to be gone from the list',
      );
    }
  });

  test('searches a file viewed on Ctrl+F as the diff does, counting the matches, stepping to them with Enter and Shift+Enter, and closes the search on Esc, then the viewer', async () => {
    const lines = Array.from({ length: 300 }, (_, index) =>
      index % 100 === 50 ? `Needle ${index}` : `row ${index}`,
    );
    fs.writeFileSync(
      path.join(opened, 'haystack.txt'),
      lines.join(String.fromCharCode(10)),
    );
    try {
      await select('haystack');
      await page.keyboard.press('F3');
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');

      await page.keyboard.press('ControlOrMeta+F');
      await waitForFocus(
        page.locator('.viewer .find-field-input'),
        'the search',
      );
      assert.ok(
        (await page
          .locator('.viewer .search-row')
          .evaluate(
            (row) =>
              row.getBoundingClientRect().left -
              (row.closest('.viewer')?.getBoundingClientRect().left ?? 0),
          )) < 8,
        'The search starts at the start of the header, as in the diff',
      );
      await page.keyboard.type('needle');
      await waitFor(async () => (await findCount()) === '1 of 3', 'the count');
      await waitFor(
        async () =>
          JSON.stringify(await findMarks()) ===
          JSON.stringify([['Needle', true]]),
        'the first match marked as current',
      );
      await page.keyboard.press('Enter');
      await waitFor(
        async () => (await findCount()) === '2 of 3',
        'the next match',
      );
      await waitFor(
        async () =>
          JSON.stringify(await findMarks()) ===
            JSON.stringify([['Needle', true]]) &&
          ((await page
            .locator('.viewer-rows .viewer-row', {
              has: page.locator('.find-match.current'),
            })
            .textContent()) ?? '') === 'Needle 150',
        'the view at the second match',
      );
      await page.keyboard.press('Shift+Enter');
      await waitFor(
        async () => (await findCount()) === '1 of 3',
        'the previous match',
      );
      await page.keyboard.press('1');
      assert.strictEqual(
        await page.locator('.viewer .find-field-input').inputValue(),
        'needle1',
      );
      await page.keyboard.press('Backspace');

      await page.keyboard.press('Escape');
      await page.locator('.viewer .find-field').waitFor({ state: 'detached' });
      await waitForFocus(page.locator('.viewer-body'), 'the viewer again');
      assert.deepStrictEqual(await findMarks(), []);
      assert.strictEqual(await page.locator('.viewer').count(), 1);
    } finally {
      if (await page.locator('.viewer .find-field').isVisible()) {
        await page.keyboard.press('Escape');
        await page
          .locator('.viewer .find-field')
          .waitFor({ state: 'detached' });
      }
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'haystack.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('haystack.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('keeps the thumb of a file viewed as tall wherever it is scrolled to, though its lines grow long further down, moves it down as the rows do, and ends it at the end of its track without a jump', async () => {
    const lines = Array.from({ length: 300 }, (_, index) =>
      index < 150
        ? `short ${index}`.padEnd(19, '.')
        : `long ${index}`.padEnd(59, '.'),
    );
    fs.writeFileSync(
      path.join(opened, 'uneven.txt'),
      lines.join(String.fromCharCode(10)),
    );
    try {
      await select('uneven');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === 'short 0............',
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      const first = await viewerThumb();
      assert.ok(first.height > 30, JSON.stringify(first));
      const seen = [first];
      await waitFor(async () => {
        seen.push(await viewerThumb());
        if ((await firstViewerRow()).startsWith('long')) {
          return true;
        }
        await page.keyboard.press('PageDown');
        return false;
      }, 'the long rows');
      await page.keyboard.press('End');
      await waitFor(
        async () => (await firstViewerRow()).startsWith('long 2'),
        'the end',
      );
      seen.push(await viewerThumb());
      assert.ok(
        seen.every((each) => Math.abs(each.height - first.height) < 0.5),
        JSON.stringify(seen),
      );
      assert.ok(
        seen.every(
          (each, index) =>
            index === 0 || each.top >= (seen[index - 1]?.top ?? 0),
        ),
        JSON.stringify(seen),
      );
      assert.ok(
        Math.abs(seen.at(-1)?.fromEnd ?? 1) < 0.5,
        JSON.stringify(seen),
      );
      const atEnd = seen.at(-1)?.top ?? 0;
      const lastTop = await firstViewerRow();
      await page.keyboard.press('ArrowUp');
      await waitFor(
        async () => (await firstViewerRow()) !== lastTop,
        'a row up',
      );
      const track = await page
        .locator('.viewer-thumb')
        .evaluate(
          (element) =>
            element.parentElement?.getBoundingClientRect().height ?? 0,
        );
      assert.ok(
        atEnd - (await viewerThumb()).top < track / 50,
        JSON.stringify({ atEnd, up: await viewerThumb(), track }),
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'uneven.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('uneven.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('shows the rows of a file viewed, moving a page with PageDown, to its end with End and anywhere with its scrollbar', async () => {
    const lines = Array.from({ length: 200 }, (_, index) => `row ${index}`);
    fs.writeFileSync(
      path.join(opened, 'rows.txt'),
      lines.join(String.fromCharCode(10)),
    );
    await select('rows');
    await page.keyboard.press('F3');
    const first = () =>
      page.locator('.viewer-rows .viewer-row').first().textContent();
    await waitFor(async () => (await first()) === 'row 0', 'the first row');
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');

    await page
      .locator('.viewer-rows .viewer-row')
      .nth(3)
      .dblclick({ position: { x: 12, y: 4 } });
    assert.strictEqual(
      await page.evaluate(() => getSelection()?.toString().trim()),
      'row',
    );
    const thumb = page.locator('.viewer-thumb');
    assert.match(
      (await thumb.getAttribute('class')) ?? '',
      /overlay-scrollbar/,
    );
    assert.strictEqual(
      await thumb.evaluate((element) => element.getBoundingClientRect().width),
      await page.evaluate(() =>
        parseFloat(
          getComputedStyle(document.body).getPropertyValue('--scrollbar-size'),
        ),
      ),
    );

    for (let press = 0; press < 30; press++) {
      void page.keyboard.press('ArrowDown');
    }
    await waitFor(
      async () => (await first()) === 'row 30',
      'every press of a key held down to move a row',
    );

    await page.keyboard.press('PageDown');
    await waitFor(
      async () => /^row [4-9]/.test((await first()) ?? ''),
      'a page further down',
    );
    await page.keyboard.press('End');
    await waitFor(
      async () =>
        (await page
          .locator('.viewer-rows .viewer-row')
          .last()
          .textContent()) === 'row 199',
      'the last row',
    );
    const bar = await page.locator('.viewer-scrollbar').boundingBox();
    assert.ok(bar);
    await page.mouse.click(bar.x + bar.width / 2, bar.y + 1);
    await waitFor(async () => (await first()) === 'row 0', 'the start again');

    const middle = bar.y + bar.height / 2;
    await page.mouse.move(bar.x + bar.width / 2, bar.y + 1);
    await page.mouse.down();
    await page.mouse.move(bar.x + bar.width / 2, middle, { steps: 10 });
    await waitFor(async () => {
      const row = Number((await first())?.split(' ')[1]);
      return row > 60 && row < 140;
    }, 'the middle rows while the thumb is still held');
    const held = await thumb.boundingBox();
    assert.ok(held && held.y <= middle && middle <= held.y + held.height);
    await page.mouse.up();

    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'rows.txt'));
    await waitFor(
      async () => !(await rowNames()).includes('rows.txt'),
      'the file to be gone from the list',
    );
  });

  test('wraps the long lines of a file viewed as the diff wraps its lines, indenting the rows they wrap onto and marking where they wrap and the spaces they wrap at, copies a wrapped line as one line, stops on W or its button for the diff too, and shows whitespace on a dot', async () => {
    const words = Array.from({ length: 80 }, (_, index) => `word${index}`).join(
      ' ',
    );
    const line = `    ${words}`;
    fs.writeFileSync(
      path.join(opened, 'long.txt'),
      ['short', line, 'after'].join(String.fromCharCode(10)),
    );
    const rows = page.locator('.viewer-rows .viewer-row');
    const layout = () =>
      page.locator('.viewer-body').evaluate((body) => {
        const shown = body.querySelector('.viewer-rows');
        const leftOf = (row: Element | undefined, offset: number) => {
          const walker = document.createTreeWalker(
            row ?? body,
            NodeFilter.SHOW_TEXT,
          );
          let node = walker.nextNode();
          let at = offset;
          while (node instanceof Text && at >= node.length) {
            at -= node.length;
            node = walker.nextNode();
          }
          if (!(node instanceof Text)) {
            return Number.NaN;
          }
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + 1);
          return range.getBoundingClientRect().left;
        };
        const each = [...body.querySelectorAll('.viewer-rows .viewer-row')];
        const edge = body.getBoundingClientRect().right;
        return {
          fits:
            (shown?.getBoundingClientRect().width ?? Infinity) <=
            body.clientWidth + 0.5,
          marks: [...body.querySelectorAll('.viewer-break')].map(
            (mark) => mark.getBoundingClientRect().right <= edge,
          ),
          indented: Math.abs(leftOf(each[2], 0) - leftOf(each[1], 4)) < 0.5,
        };
      });
    try {
      await select('long');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()) === 'short',
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      await waitFor(async () => (await rows.count()) > 4, 'the line to wrap');
      const wrapped = await rows.allTextContents();
      assert.strictEqual(wrapped.slice(1, -1).join(''), line);
      assert.strictEqual(wrapped.at(-1), 'after');
      assert.deepStrictEqual(await layout(), {
        fits: true,
        marks: wrapped.slice(2, -1).map(() => true),
        indented: true,
      });
      await page.evaluate(() => {
        const shown = [
          ...document.querySelectorAll('.viewer-rows .viewer-row'),
        ];
        const range = document.createRange();
        range.setStartBefore(shown[1] ?? document.body);
        range.setEnd(shown.at(-1)?.firstChild ?? document.body, 3);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
        window.addEventListener(
          'copy',
          (event) =>
            Reflect.set(
              window,
              'copied',
              event.clipboardData?.getData('text/plain'),
            ),
          { once: true },
        );
      });
      await page.keyboard.press('ControlOrMeta+C');
      assert.strictEqual(
        await page.evaluate((): unknown => Reflect.get(window, 'copied')),
        `${line}${String.fromCharCode(10)}aft`,
      );

      await page.keyboard.press('w');
      await waitFor(async () => (await rows.count()) === 3, 'the line whole');
      const unwrapped = await rows.allTextContents();
      assert.deepStrictEqual(
        [unwrapped[0], line.startsWith(unwrapped[1] ?? '-'), unwrapped[2]],
        ['short', true, 'after'],
      );
      assert.strictEqual((await layout()).fits, false);
      assert.strictEqual(await page.locator('.viewer-break').count(), 0);
      await waitFor(
        () => savedText(profile, 'wordWrap') === false,
        'no wrapping saved',
      );

      await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
      await waitFor(async () => (await rows.count()) > 4, 'the line wrapped');
      await waitFor(
        () => savedText(profile, 'wordWrap') === undefined,
        'the wrapping left to the default',
      );

      assert.strictEqual(await page.locator('.viewer-rows .blank').count(), 0);
      const hanging = page.locator('.viewer-rows .viewer-wrap-blank');
      assert.ok((await hanging.count()) > 0);
      assert.strictEqual(await hanging.first().getAttribute('data-glyph'), '·');
      await page.keyboard.press('.');
      await waitFor(
        async () => (await page.locator('.viewer-rows .blank').count()) > 0,
        'the spaces drawn',
      );
      assert.strictEqual(
        await page
          .locator('.viewer-rows .blank')
          .first()
          .getAttribute('data-glyph'),
        '·',
      );
      assert.strictEqual(await hanging.count(), 0);
      await waitFor(
        () => savedText(profile, 'showWhitespace') === true,
        'whitespace shown saved',
      );
      assert.strictEqual(savedText(profile, 'wordWrap'), undefined);
      await page.keyboard.press('.');
      await waitFor(
        async () => (await page.locator('.viewer-rows .blank').count()) === 0,
        'the spaces plain again',
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'long.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('long.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('scrolls a file viewed sideways while its lines are not wrapped, on its overlay scrollbar, Shift and the wheel, or Left and Right, keeping the width of the widest row seen as it scrolls away, drawing only the columns near the screen yet copying rows whole, and brings a match off to the side into view', async () => {
    const long = `start ${'x'.repeat(600)} found`;
    fs.writeFileSync(
      path.join(opened, 'wide.txt'),
      [long, ...Array.from({ length: 300 }, (_, index) => `row ${index}`)].join(
        String.fromCharCode(10),
      ),
    );
    const sideways = page.locator('.viewer-sideways');
    const across = () =>
      sideways.evaluate((element) => ({
        left: element.scrollLeft,
        width: element.scrollWidth,
        shown: element.clientWidth,
      }));
    try {
      await select('wide');
      await page.keyboard.press('F3');
      await waitFor(
        async () => (await firstViewerRow()).startsWith('start'),
        'the first row',
      );
      await waitForFocus(page.locator('.viewer-body'), 'the viewer');
      await page.keyboard.press('w');
      await waitFor(async () => {
        const { width, shown } = await across();
        return width > shown + 100;
      }, 'the long line too wide to show');
      const drawn =
        (await page
          .locator('.viewer-rows .viewer-row')
          .first()
          .textContent()) ?? '';
      assert.ok(drawn.length < long.length, String(drawn.length));
      await page.evaluate(() => {
        const shown = [
          ...document.querySelectorAll('.viewer-rows .viewer-row'),
        ];
        const range = document.createRange();
        range.setStartBefore(shown[0] ?? document.body);
        range.setEnd(shown[1]?.firstChild ?? document.body, 2);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
        window.addEventListener(
          'copy',
          (event) =>
            Reflect.set(
              window,
              'copied',
              event.clipboardData?.getData('text/plain'),
            ),
          { once: true },
        );
      });
      await page.keyboard.press('ControlOrMeta+C');
      assert.strictEqual(
        await page.evaluate((): unknown => Reflect.get(window, 'copied')),
        `${long}${String.fromCharCode(10)}ro`,
      );
      await page.evaluate(() => getSelection()?.removeAllRanges());

      await page.locator('.viewer-rows').hover();
      await page.locator('.overlay-scrollbar.horizontal.shown').waitFor();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await waitFor(async () => (await across()).left > 0, 'a step sideways');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await waitFor(async () => (await across()).left === 0, 'back again');
      await page.keyboard.down('Shift');
      await page.mouse.wheel(0, 300);
      await page.keyboard.up('Shift');
      await waitFor(
        async () => (await across()).left > 0,
        'the wheel sideways',
      );
      assert.ok((await firstViewerRow()).startsWith('start'));

      const before = await across();
      await page.keyboard.press('PageDown');
      await waitFor(
        async () => (await firstViewerRow()).startsWith('row'),
        'the long line scrolled away',
      );
      const after = await across();
      assert.deepStrictEqual(
        [after.left, after.width],
        [before.left, before.width],
      );

      await page.keyboard.press('Home');
      await waitFor(
        async () => (await firstViewerRow()).startsWith('start'),
        'the start again',
      );
      await sideways.evaluate((element) => {
        element.scrollLeft = 0;
      });
      await page.keyboard.press('ControlOrMeta+F');
      await page.keyboard.type('found');
      await page.keyboard.press('Enter');
      await waitFor(
        () =>
          page.evaluate(() => {
            const mark = document.querySelector('.find-match.current');
            const area = document.querySelector('.viewer-sideways');
            if (mark === null || area === null) {
              return false;
            }
            const box = mark.getBoundingClientRect();
            const shown = area.getBoundingClientRect();
            return box.left >= shown.left && box.right <= shown.right;
          }),
        'the match brought into view',
      );
      await page.keyboard.press('Escape');

      await page.keyboard.press('w');
      await waitFor(async () => {
        const { left, width, shown } = await across();
        return left === 0 && width <= shown + 1;
      }, 'the lines wrapped to the width again');
    } finally {
      for (
        let presses = 0;
        presses < 3 && (await page.locator('.viewer').isVisible());
        presses++
      ) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
      await page.locator('.viewer').waitFor({ state: 'detached' });
      fs.rmSync(path.join(opened, 'wide.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('wide.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('colors the code of a file viewed as the diff colors it, a long one from the top as its lines are done, none while syntax highlighting is off on its button, leaving a file over the size colored plain, and previews no Markdown over a size of its own', async () => {
    fs.writeFileSync(path.join(opened, 'code.ts'), 'const answer = 42;');
    await select('code');
    await page.keyboard.press('F3');
    await waitFor(
      async () =>
        (await page
          .locator('.viewer-row .syntax-keyword')
          .first()
          .textContent()) === 'const',
      'the keyword colored',
    );
    const colors = await page.evaluate(() => {
      const keyword = document.querySelector('.viewer-row .syntax-keyword');
      const plain = document.querySelector('.viewer-row');
      return keyword && plain
        ? [getComputedStyle(keyword).color, getComputedStyle(plain).color]
        : [];
    });
    assert.notStrictEqual(colors[0], colors[1]);
    const highlight = page.getByRole('button', { name: 'Highlight Syntax' });
    await highlight.click();
    await page.locator('.viewer-row .syntax-keyword').first().waitFor({
      state: 'detached',
    });
    await waitFor(
      () => savedText(profile, 'highlightSyntax') === false,
      'no syntax highlighting saved',
    );
    await highlight.click();
    await page.locator('.viewer-row .syntax-keyword').first().waitFor();
    await waitFor(
      () => savedText(profile, 'highlightSyntax') === undefined,
      'syntax highlighting left to the default',
    );
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });

    const lastKeyword = () =>
      page
        .locator('.viewer-rows .viewer-row')
        .last()
        .locator('.syntax-keyword')
        .count();
    fs.writeFileSync(
      path.join(opened, 'lines.ts'),
      Array.from({ length: 6000 }, (_, index) => `let a${index} = 1;`).join(
        String.fromCharCode(10),
      ),
    );
    await select('lines');
    await page.keyboard.press('F3');
    await waitFor(
      async () => (await lastKeyword()) > 0,
      'the first lines colored',
    );
    await page.keyboard.press('End');
    await waitFor(
      async () =>
        (await page
          .locator('.viewer-rows .viewer-row')
          .last()
          .textContent()) === 'let a5999 = 1;' && (await lastKeyword()) > 0,
      'the last line colored',
    );
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });

    fs.writeFileSync(
      path.join(opened, 'over.ts'),
      `let first = 1;${String.fromCharCode(10).repeat(1024 * 1024)}`,
    );
    await select('over');
    await page.keyboard.press('F3');
    await waitFor(
      async () =>
        (await page
          .locator('.viewer-rows .viewer-row')
          .first()
          .textContent()) === 'let first = 1;' &&
        (await page.locator('.viewer-row .syntax-keyword').count()) > 0,
      'the first line of a file over a megabyte colored',
    );
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });

    fs.writeFileSync(
      path.join(opened, 'over.md'),
      `# Over${String.fromCharCode(10).repeat(1024 * 1024)}`,
    );
    await select('overmd');
    await page.keyboard.press('F3');
    await waitFor(
      async () =>
        (await page.locator('.viewer .markdown-note').textContent()) ===
        'Documents over 1 MB are not previewed.',
      'the document too large to preview',
    );
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });

    fs.writeFileSync(
      path.join(opened, 'large.ts'),
      `const big = 1;${' '.repeat(maxColoredBytes)}`,
    );
    await select('large');
    await page.keyboard.press('F3');
    await waitFor(
      async () =>
        (
          (await page
            .locator('.viewer-rows .viewer-row')
            .first()
            .textContent()) ?? ''
        ).startsWith('const big'),
      'the large file shown',
    );
    await page.waitForTimeout(300);
    assert.strictEqual(
      await page.locator('.viewer-row .syntax-keyword').count(),
      0,
    );
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    const files = ['code.ts', 'lines.ts', 'over.ts', 'over.md', 'large.ts'];
    for (const file of files) {
      fs.rmSync(path.join(opened, file));
    }
    await waitFor(async () => {
      const names = await rowNames();
      return files.every((file) => !names.includes(file));
    }, 'the files to be gone from the list');
  });

  test('shows a binary file in hex, 16 bytes a row, to its last row with End, and switches to text and back with 1 and 2 or the buttons', async () => {
    fs.writeFileSync(
      path.join(opened, 'data.bin'),
      Buffer.from(Array.from({ length: 65536 }, (_, index) => index % 256)),
    );
    await select('data');
    await page.keyboard.press('F3');
    const pressedMode = () =>
      page
        .locator('.viewer .segmented [aria-pressed="true"]')
        .getAttribute('title');
    await waitFor(
      async () => (await pressedMode()) === 'Text',
      'a binary file to open as text',
    );
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');
    await page.keyboard.press('2');
    await waitFor(
      async () =>
        (await firstViewerRow()) ===
        '0000000000 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F................',
      'the first row in hex',
    );

    await page.keyboard.press('End');
    await waitFor(
      async () =>
        (
          (await page
            .locator('.viewer-rows .viewer-row')
            .last()
            .textContent()) ?? ''
        ).startsWith('0000FFF0F0 F1'),
      'the last row',
    );

    await page.keyboard.press('F1');
    await waitFor(
      async () =>
        (await page.locator('.shortcuts-heading').allTextContents()).includes(
          'Viewer',
        ),
      'the shortcuts of the viewer',
    );
    assert.ok(
      !(await page.locator('.shortcuts-heading').allTextContents()).includes(
        'Folders',
      ),
    );
    await page.keyboard.press('F1');
    await page
      .locator('.shortcuts-heading')
      .first()
      .waitFor({ state: 'detached' });

    await page.keyboard.press('1');
    await waitFor(
      async () => (await pressedMode()) === 'Text',
      'the text view',
    );
    await page.keyboard.press('Home');
    await waitFor(
      async () =>
        ((await firstViewerRow()) ?? '').startsWith(
          `${'.'.repeat(32)} !"#$%&'()*+,-./0123456789`,
        ),
      'the bytes as text, one to a character, a dot for each with no glyph',
    );
    await page.keyboard.press('2');
    await waitFor(async () => (await pressedMode()) === 'Hex', 'the hex view');
    await page.locator('.viewer .segmented [title="Text"]').click();
    await waitFor(
      async () => (await pressedMode()) === 'Text',
      'the text view',
    );
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });

    fs.writeFileSync(path.join(opened, 'plain.txt'), 'plain');
    await select('plain');
    await page.keyboard.press('F3');
    await waitFor(async () => (await firstViewerRow()) === 'plain', 'the text');
    assert.strictEqual(await pressedMode(), 'Text');
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'data.bin'));
    fs.rmSync(path.join(opened, 'plain.txt'));
    await waitFor(async () => {
      const names = await rowNames();
      return !names.includes('data.bin') && !names.includes('plain.txt');
    }, 'the files to be gone from the list');
  });

  test('previews an image, an SVG and Markdown with its images, switching to the source with 1, and offers no preview for other files', async () => {
    const dot = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    fs.writeFileSync(path.join(opened, 'dot.png'), dot);
    fs.writeFileSync(
      path.join(opened, 'logo.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
    fs.mkdirSync(path.join(opened, 'pics'));
    fs.writeFileSync(path.join(opened, 'pics', 'dot.png'), dot);
    fs.writeFileSync(
      path.join(opened, 'doc.md'),
      ['# Title', '', '![dot](pics/dot.png)', ''].join(String.fromCharCode(10)),
    );
    fs.writeFileSync(path.join(opened, 'plain.txt'), 'plain');
    const imageWidth = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth)
        .catch(() => 0);
    const pressedMode = () =>
      page
        .locator('.viewer .segmented [aria-pressed="true"]')
        .getAttribute('title');
    const close = async () => {
      await page.keyboard.press('Escape');
      await page.locator('.viewer').waitFor({ state: 'detached' });
    };

    await select('dot');
    await page.keyboard.press('F3');
    await waitFor(
      async () => (await imageWidth('.viewer-image img')) === 1,
      'the image',
    );
    assert.strictEqual(await pressedMode(), 'Preview');
    await close();

    await select('logo');
    await page.keyboard.press('F3');
    await waitFor(
      async () => (await imageWidth('.viewer-image img')) === 10,
      'the SVG drawn',
    );
    await page.keyboard.press('1');
    await waitFor(
      async () =>
        (
          (await page
            .locator('.viewer-rows .viewer-row')
            .first()
            .textContent()) ?? ''
        ).startsWith('<svg'),
      'the SVG source',
    );
    await close();

    await select('doc');
    await page.keyboard.press('F3');
    await waitFor(
      async () =>
        (await page
          .locator('.viewer .markdown h1')
          .first()
          .textContent()
          .catch(() => '')) === 'Title',
      'the heading',
    );
    await waitFor(
      async () => (await imageWidth('.viewer .markdown img')) === 1,
      'the image of the document',
    );
    await close();

    await select('plain');
    await page.keyboard.press('F3');
    await waitFor(
      async () => (await pressedMode()) === 'Text',
      'the text view',
    );
    assert.strictEqual(
      await page.locator('.viewer .segmented [title="Preview"]').count(),
      0,
    );
    await page.keyboard.press('3');
    assert.strictEqual(await pressedMode(), 'Text');
    await close();

    for (const name of ['dot.png', 'logo.svg', 'doc.md', 'plain.txt']) {
      fs.rmSync(path.join(opened, name));
    }
    fs.rmSync(path.join(opened, 'pics'), { recursive: true });
    await waitFor(async () => {
      const names = await rowNames();
      return !['dot.png', 'logo.svg', 'doc.md', 'plain.txt', 'pics'].some(
        (name) => names.includes(name),
      );
    }, 'the files to be gone from the list');
  });

  test('marks files moving with Shift, with Space and Insert, with Ctrl+click and Shift+click, never the parent row, and drops the marks in another folder', async () => {
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
    const colors = await right()
      .locator('.commander-row.marked .commander-name')
      .evaluateAll((names) =>
        names.map((name) => getComputedStyle(name).color),
      );
    assert.strictEqual(
      new Set(colors).size,
      1,
      `The marked rows, the selected one among them, have the colors ${colors.join(', ')}`,
    );
    const hiddenColor = await right()
      .locator('.commander-row.marked')
      .first()
      .evaluate((row) => {
        row.classList.add('hidden');
        const color = getComputedStyle(row).color;
        row.classList.remove('hidden');
        return color;
      });
    assert.strictEqual(
      hiddenColor,
      colors[0],
      'A hidden file marked is red too',
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

  test('compares the two files marked on a side with Shift+F3 in a git tab of their own, showing their diff', async () => {
    fs.writeFileSync(path.join(opened, 'before.txt'), threeLines('two'));
    fs.writeFileSync(path.join(opened, 'after.txt'), threeLines('2'));
    await select('before');
    await page.keyboard.press('Space');
    await select('after');
    await page.keyboard.press('Space');
    await waitFor(
      async () => (await markedNames()).toSorted().join() === 'after,before',
      'both files to be marked',
    );

    await page.evaluate(() => {
      const watched = window as typeof window & { repositoryShown?: boolean };
      watched.repositoryShown = false;
      const check = () => {
        const comparing = document
          .querySelector('.tabs .tab.active')
          ?.textContent?.includes('→');
        const repository = document.querySelector<HTMLElement>(
          '.repository:not(.compare-view)',
        );
        if (comparing && repository && repository.offsetParent !== null) {
          watched.repositoryShown = true;
        }
        if (document.querySelector('.compare-view .diff-line.added') === null) {
          requestAnimationFrame(check);
        }
      };
      requestAnimationFrame(check);
    });
    await page.keyboard.press('Shift+F3');
    await page
      .locator('.tabs .tab.active', { hasText: 'after.txt → before.txt' })
      .waitFor();
    await waitFor(
      async () =>
        (
          await page.locator('.compare-view .diff-line.added').allTextContents()
        ).some((line) => line.includes('two')),
      'the diff of the two files',
    );
    await waitForFocus(
      page.locator('.compare-view [data-column-focus]').first(),
      'the diff, to take the keys at once',
    );
    assert.strictEqual(
      await page.evaluate(
        () =>
          (window as typeof window & { repositoryShown?: boolean })
            .repositoryShown,
      ),
      false,
      'The commit list showed before the comparison',
    );

    await page.keyboard.press('F1');
    await waitFor(
      async () =>
        (await page.locator('.shortcuts-heading').allTextContents()).join() ===
        'Tabs,App,Diff',
      'only the shortcuts of the diff',
    );
    await page.keyboard.press('F1');
    await page
      .locator('.shortcuts-heading')
      .first()
      .waitFor({ state: 'detached' });

    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(
      page.locator('.compare-view .find-field-input'),
      'the search of the diff',
    );
    await page.keyboard.press('Escape');
    await waitFor(
      async () =>
        (await page.locator('.compare-view .find-field-input').count()) === 0,
      'the search to close',
    );
    assert.strictEqual(
      await page.locator('.tabs .tab.active', { hasText: '→' }).count(),
      1,
    );
    await page.keyboard.press('Escape');
    await page.locator('.tabs .tab.active', { hasText: 'Commander' }).waitFor();
    for (const name of ['before.txt', 'after.txt']) {
      fs.rmSync(path.join(opened, name));
    }
    await waitFor(async () => {
      const names = await rowNames();
      return !names.includes('before.txt') && !names.includes('after.txt');
    }, 'the files to be gone from the list');
  });

  test('lines up the shortcuts of the viewer, its only group, that go on in the second column with those of the first, under its heading', async () => {
    const size = await app.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();
      const before = window?.getSize();
      window?.setSize(1290, 779);
      return before;
    });
    await select('notes');
    await page.keyboard.press('F3');
    await waitForFocus(page.locator('.viewer-body'), 'the viewer');
    await page.keyboard.press('F1');
    await page.locator('.shortcuts-heading', { hasText: 'Viewer' }).waitFor();
    const tops = await page
      .locator('.shortcuts-group', {
        has: page.locator('.shortcuts-heading', { hasText: 'Viewer' }),
      })
      .locator('.shortcut-keys')
      .evaluateAll((cells) => {
        const firstOfColumn = new Map<number, number>();
        for (const cell of cells) {
          const { left, top } = cell.getBoundingClientRect();
          const column = Math.round(left);
          firstOfColumn.set(
            column,
            Math.min(firstOfColumn.get(column) ?? Infinity, top),
          );
        }
        return [...firstOfColumn.values()];
      });
    await page.keyboard.press('F1');
    await page
      .locator('.shortcuts-heading')
      .first()
      .waitFor({ state: 'detached' });
    await app.evaluate(
      ({ BrowserWindow }, [width, height]) => {
        BrowserWindow.getAllWindows()[0]?.setSize(width, height);
      },
      size ?? [1280, 800],
    );
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    assert.strictEqual(tops.length, 2);
    assert.ok(
      Math.abs((tops[0] ?? 0) - (tops[1] ?? 0)) < 2,
      `The columns start at ${tops.join(' and ')}`,
    );
  });

  test('reads a file in the encoding its byte order mark names, and in the one chosen from the menu E opens, staying where it was', async () => {
    const text = Array.from(
      { length: 300 },
      (_, index) => `ligne ${index} é`,
    ).join(String.fromCharCode(10));
    fs.writeFileSync(
      path.join(opened, 'wide.txt'),
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]),
    );
    await select('wide');
    await page.keyboard.press('F3');
    const rowTexts = () =>
      page.locator('.viewer-rows .viewer-row').allTextContents();
    await waitFor(
      async () => (await rowTexts())[0] === 'ligne 0 é',
      'the text read as UTF-16',
    );
    assert.strictEqual(
      await page.locator('.viewer-encoding-label').textContent(),
      'UTF-16 LE',
    );

    await page.keyboard.press('End');
    await waitFor(
      async () => (await rowTexts()).at(-1) === 'ligne 299 é',
      'the end of the text',
    );
    await page.keyboard.press('e');
    await page.getByText('Bytes, one to a character').click();
    await waitFor(
      async () => (await rowTexts()).join('').includes('2.9.9. .é.'),
      'the end of the file as bytes',
    );
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'wide.txt'));
    await waitFor(
      async () => !(await rowNames()).includes('wide.txt'),
      'the file to be gone from the list',
    );
  });

  test('reads a text file that is not UTF-8 in the code page of the system', async () => {
    fs.writeFileSync(
      path.join(opened, 'legacy.txt'),
      Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x6f, 0x6b]),
    );
    try {
      await select('legacy');
      await page.keyboard.press('F3');
      await page.locator('.viewer').waitFor();
      await waitFor(
        async () => (await firstViewerRow()).startsWith('caf'),
        'the text',
      ).catch(async (error: unknown) => {
        throw new Error(
          `${String(error)}: the viewer of ${await page.locator('.viewer').getAttribute('data-file')} showed ${JSON.stringify(await page.locator('.viewer').innerText())}`,
        );
      });
      const row = await firstViewerRow();
      assert.ok(!row.includes(String.fromCharCode(0xfffd)), row);
      assert.ok(
        ['1250', '1251', '1252'].includes(
          (await page.locator('.viewer-encoding-label').textContent()) ?? '',
        ),
      );
    } finally {
      if (await page.locator('.viewer').isVisible()) {
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
      }
      fs.rmSync(path.join(opened, 'legacy.txt'));
      await waitFor(
        async () => !(await rowNames()).includes('legacy.txt'),
        'the file to be gone from the list',
      );
    }
  });

  test('says two files compared are the same rather than showing nothing', async () => {
    fs.writeFileSync(path.join(opened, 'twin1.txt'), 'twins');
    fs.writeFileSync(path.join(opened, 'twin2.txt'), 'twins');
    await select('twin1');
    await page.keyboard.press('Space');
    await select('twin2');
    await page.keyboard.press('Space');
    await page.keyboard.press('Shift+F3');
    await page
      .locator('.compare-view .diff-note', {
        hasText: 'The files are the same.',
      })
      .waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.tabs .tab.active', { hasText: 'Commander' }).waitFor();
    for (const name of ['twin1.txt', 'twin2.txt']) {
      fs.rmSync(path.join(opened, name));
    }
    await waitFor(async () => {
      const names = await rowNames();
      return !names.includes('twin1.txt') && !names.includes('twin2.txt');
    }, 'the files to be gone from the list');
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

  test('scrolls the list by whole rows, with the wheel and the scrollbar alike', async () => {
    const many = path.join(opened, 'many');
    fs.mkdirSync(many);
    for (let index = 0; index < 400; index++) {
      fs.writeFileSync(path.join(many, `file${index}.txt`), '');
    }
    await select('many');
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await rowNames()).includes('file10.txt'),
      'the folder of many files',
    );
    const list = right().locator('.virtual-rows');
    const offRow = () =>
      list.evaluate((element) => {
        const row =
          element.querySelector('.commander-row')?.getBoundingClientRect()
            .height ?? 1;
        const rows = element.scrollTop / row;
        return {
          top: element.scrollTop,
          off: Math.abs(rows - Math.round(rows)),
        };
      });

    await list.hover();
    await page.mouse.wheel(0, 30);
    await waitFor(async () => (await offRow()).top > 0, 'the list to scroll');
    assert.ok((await offRow()).off < 0.01, JSON.stringify(await offRow()));

    await page.mouse.wheel(0, 3000);
    await waitFor(async () => (await offRow()).top > 2000, 'a long way down');
    const firstRowOffset = await list.evaluate((element) => {
      const top = element.getBoundingClientRect().top;
      const boxes = [...element.querySelectorAll('.virtual-row')]
        .map((row) => row.getBoundingClientRect())
        .filter((box) => box.bottom > top + 0.5)
        .toSorted((one, other) => one.top - other.top);
      return (boxes[0]?.top ?? top) - top;
    });
    assert.ok(
      Math.abs(firstRowOffset) < 0.01,
      `The first row shown starts ${firstRowOffset} from the top`,
    );

    await list.evaluate((element) => {
      element.scrollTop = 25;
    });
    await waitFor(
      async () => (await offRow()).off < 0.01,
      'a place between rows to snap to a row',
    );
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await waitFor(
      async () => (await offRow()).top > 100 && (await offRow()).off < 0.01,
      'the end of the list to start on a row',
    );

    await page.keyboard.press('Backspace');
    await waitFor(
      async () => (await rowNames()).includes('many'),
      'the parent folder',
    );
    fs.rmSync(many, { recursive: true });
    await waitFor(
      async () => !(await rowNames()).includes('many'),
      'the folder to be gone from the list',
    );
  });

  test.skipIf(process.platform !== 'win32')(
    'opens the drive menu of the right side with Alt+F2 and changes the drive by its letter',
    async () => {
      await right().locator('.virtual-rows').focus();
      await page.keyboard.press('Alt+F1');
      await page.locator('.commander-pane').nth(0).locator('.menu').waitFor();
      await page.keyboard.press('Alt+F2');
      await right().locator('.menu').waitFor();
      await page
        .locator('.commander-pane')
        .nth(0)
        .locator('.menu')
        .waitFor({ state: 'detached' });
      await page.keyboard.press(opened.charAt(0).toLowerCase());
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent()) ===
          `${opened.charAt(0).toUpperCase()}:\\`,
        'the root of the drive of the folder opened',
      );
      await page
        .locator('.commander-pane .menu')
        .waitFor({ state: 'detached' });
    },
  );

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

  test.skipIf(process.platform !== 'win32')(
    'opens Users for Documents and Settings, a link no one may list, without saying there is no access',
    async () => {
      const drive = `${opened.charAt(0).toUpperCase()}:\\`;
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent()) === drive,
        'the right side to show the root of the drive',
      );
      await select('Documents and Settings');
      await page.keyboard.press('Enter');
      await waitFor(
        async () =>
          (await right().locator('.column-name').textContent()) ===
          `${drive}Users`,
        'the right side to open Users',
      );
      assert.strictEqual(await page.locator('.confirm-popup').count(), 0);
    },
  );

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

  test('shows where columns can be resized once the pointer is on the header, in the focus color on the one under it', async () => {
    const lines = () =>
      right()
        .locator('.column-handle')
        .evaluateAll((handles) =>
          handles.map(
            (handle) => getComputedStyle(handle, '::after').backgroundColor,
          ),
        );
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
          left: { column: 'extension', descending: false },
          right: { column: 'size', descending: false },
        })
      );
    }, 'the order of the right side to be saved');
  });
});
