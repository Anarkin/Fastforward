import * as assert from 'node:assert';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  _electron,
  type ElectronApplication,
  type Page,
} from 'playwright-core';
import { defaultSettings, waitFor } from './fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';
import { wrapColumns, wrappedLines } from '../webview/wordWrap';

const appFolder = path.join(__dirname, '..', '..');

const longLine = Array.from({ length: 80 }, (_, index) => `word${index}`).join(
  ' ',
);
const longLines = Array.from(
  { length: 200 },
  (_, index) => `line${index} ${longLine}`,
);
const [firstLongLine] = longLines;

suite('App', function () {
  this.timeout(60_000);

  let folder: string;
  let profile: string;
  let repository: TempRepository;
  let app: ElectronApplication;
  let page: Page;

  suiteSetup(async () => {
    folder = tempFolder('app');
    profile = path.join(folder, 'profile');
    repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first', {
      'kept.txt': 'kept\n',
      'long.txt': `${longLines.join('\n')}\n`,
      'changed.txt': 'one\ntwo\nthree\n',
    });
    await repository.commit('second', { 'changed.txt': 'one\n2\nthree\n' });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'settings.json'),
      JSON.stringify({ tabs: [repository.root], activeTab: repository.root }),
    );
    app = await _electron.launch({
      args: [appFolder, `--user-data-dir=${profile}`],
      cwd: appFolder,
    });
    page = await app.firstWindow();
  });

  suiteTeardown(async () => {
    await app?.close();
    removeFolder(folder);
  });

  test('opens the saved tab, titling the window after its repository', async () => {
    await page.locator('.tab.active').waitFor();
    assert.strictEqual(
      await page.locator('.tab.active .tab-name').textContent(),
      'repo',
    );
    assert.strictEqual(await page.title(), `${repository.root} - Fastforward`);
  });

  test('focuses the commit list, whose keys start from the checked-out commit', async () => {
    const list = page.locator('.virtual-rows.list');
    await page.locator('.commit', { hasText: 'second' }).waitFor();
    assert.ok(
      await list.evaluate((element) => element === document.activeElement),
    );
    await page.keyboard.press('ArrowDown');
    await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    await page.keyboard.press('End');
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
    await page.keyboard.press('Home');
    await page.locator('.commit.working-tree.empty.selected').waitFor();
    await page.locator('.columns.nothing-selected').waitFor();
  });

  test('works a menu with the keys, giving the keyboard back when it closes', async () => {
    await page
      .locator('.commit', { hasText: 'first' })
      .click({ button: 'right' });
    const focused = () =>
      page.evaluate(() => document.activeElement?.textContent ?? '');
    const first = await page
      .locator('.context-menu .menu-item')
      .first()
      .textContent();
    await page.waitForFunction(
      () => document.activeElement?.classList.contains('menu-item') ?? false,
    );
    assert.strictEqual(await focused(), first);
    await page.keyboard.press('ArrowDown');
    assert.notStrictEqual(await focused(), first);
    await page.keyboard.press('Escape');
    await page.locator('.context-menu').waitFor({ state: 'detached' });
    assert.ok(
      await page
        .locator('.virtual-rows.list')
        .evaluate((element) => element === document.activeElement),
    );
  });

  test('colors the page from the settings', async () => {
    const { colors } = defaultSettings();
    const focus = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-focus')
        .trim(),
    );
    assert.ok([colors.light.focus, colors.dark.focus].includes(focus), focus);
  });

  test('lists the history and shows a commit entire, with its change', async () => {
    await page.locator('.commit', { hasText: 'second' }).click();
    await page.locator('.row.file', { hasText: 'changed.txt' }).click();
    await page.locator('.diff-line.added').first().waitFor();
    assert.deepStrictEqual(
      await page.locator('.diff-line .code').allTextContents(),
      ['one', 'two', '2', 'three'],
    );
    assert.ok(await page.locator('.diff-minimap').isVisible());
  });

  test('finds in the diff on Ctrl+F, stepping on Enter and clearing on Esc', async () => {
    await page.keyboard.press('Control+F');
    const field = page.locator('.diff-find-input');
    assert.ok(
      await field.evaluate((input) => input === document.activeElement),
    );
    await field.fill('T');
    const count = page.locator('.diff-find-count');
    await page.locator('.diff-find-count', { hasText: '1 of 2' }).waitFor();
    assert.deepStrictEqual(
      await page.locator('.diff-line .find-match').allTextContents(),
      ['t', 't'],
    );
    assert.strictEqual(
      await page
        .locator('.diff-line', { has: page.locator('.find-match.current') })
        .locator('.code')
        .textContent(),
      'two',
    );
    await field.press('Enter');
    await page.locator('.diff-find-count', { hasText: '2 of 2' }).waitFor();
    assert.strictEqual(await page.locator('.minimap-mark.match').count(), 2);
    assert.ok((await page.locator('.minimap-mark.added').count()) > 0);
    await page.locator('.row.group', { hasText: 'All Changes' }).click();
    await page.locator('.diff-find-count', { hasText: '1 of 2' }).waitFor();
    assert.ok(await page.locator('.diff-minimap').isVisible());
    assert.strictEqual(await page.locator('.minimap-mark.match').count(), 2);
    assert.strictEqual(await page.locator('.minimap-mark.added').count(), 0);
    await field.press('Escape');
    await count.waitFor({ state: 'detached' });
    assert.strictEqual(await page.locator('.find-match').count(), 0);
  });

  test('shows the diff side by side on its button, saving the choice, and inline again on the other', async () => {
    await page.getByRole('button', { name: 'Side by Side' }).click();
    const sides = page.locator('.split-line');
    await sides.first().waitFor();
    await page.locator('.diff-view.side-by-side').waitFor();
    assert.deepStrictEqual(
      await sides.evaluateAll((rows) =>
        rows.map((row) =>
          [...row.querySelectorAll('.split-side')]
            .map((side) => side.querySelector('.code')?.textContent ?? '')
            .join(' | '),
        ),
      ),
      ['one | one', 'two | 2', 'three | three'],
    );
    assert.strictEqual(await page.locator('.split-side.removed').count(), 1);
    assert.strictEqual(await page.locator('.split-side.added').count(), 1);
    const userSettings = path.join(profile, 'settings.user.json');
    await waitFor(
      () => fs.readFileSync(userSettings, 'utf8').includes('"sideBySide"'),
      'the layout to be saved',
    );
    await page.getByRole('button', { name: 'Inline' }).click();
    await sides.first().waitFor({ state: 'detached' });
    assert.strictEqual(
      await page.locator('.diff-view.side-by-side').count(),
      0,
    );
    await page.locator('.diff-line.added').first().waitFor();
  });

  test('moves between the columns with the arrows and Tab, the keys working in the one active', async () => {
    const active = (column: string) =>
      page.locator(`.columns[data-active-column="${column}"]`).waitFor();
    await page.locator('.virtual-rows.list').focus();
    await active('commits');
    await page.keyboard.press('ArrowRight');
    await active('files');
    await page.keyboard.press('ArrowDown');
    const changedFile = page.locator('.row.file.selected', {
      hasText: 'changed.txt',
    });
    const allChanges = page.locator('.row.group.selected', {
      hasText: 'All Changes',
    });
    await changedFile.waitFor();
    await page.keyboard.press('Home');
    await allChanges.waitFor();
    await page.keyboard.press('End');
    await changedFile.waitFor();
    await page.keyboard.press('PageUp');
    await allChanges.waitFor();
    await page.keyboard.press('PageDown');
    await changedFile.waitFor();
    await page.keyboard.press('ArrowRight');
    await active('diff');
    await page.keyboard.press('ArrowLeft');
    await active('files');
    await page.keyboard.press('Shift+Tab');
    await active('commits');
    await page.keyboard.press('Tab');
    await active('files');
    await page.keyboard.press('j');
    await active('diff');
  });

  test('shows the unchanged files on the toggle, dimmed, and remembers it', async () => {
    assert.strictEqual(
      await page.locator('.row.file', { hasText: 'kept.txt' }).count(),
      0,
    );
    await page.getByRole('button', { name: 'Show All Files' }).click();
    await page
      .locator('.row.file .path.unchanged', { hasText: 'kept.txt' })
      .waitFor();
    const userSettings = path.join(profile, 'settings.user.json');
    await waitFor(() => {
      try {
        const settings: unknown = JSON.parse(
          fs.readFileSync(userSettings, 'utf8'),
        );
        return (
          typeof settings === 'object' &&
          settings !== null &&
          'showAllFiles' in settings &&
          settings.showAllFiles === true
        );
      } catch {
        return false;
      }
    }, 'the setting to be saved');
  });

  test('moved the old settings file into the state, keeping it aside', () => {
    assert.ok(fs.existsSync(path.join(profile, 'settings.old.json')));
    assert.ok(!fs.existsSync(path.join(profile, 'settings.json')));
    const state: unknown = JSON.parse(
      fs.readFileSync(path.join(profile, 'state.json'), 'utf8'),
    );
    assert.deepStrictEqual(
      typeof state === 'object' && state !== null && 'tabs' in state
        ? state.tabs
        : undefined,
      [repository.root],
    );
  });

  test('applies settings edited by hand while it runs, and says what is wrong with them', async () => {
    const file = path.join(profile, 'settings.user.json');
    const focus = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-focus')
          .trim(),
      );
    fs.writeFileSync(
      file,
      JSON.stringify({
        showAllFiles: true,
        colors: { light: { focus: '#123456' }, dark: { focus: '#123456' } },
      }),
    );
    await page.waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-focus')
          .trim() === '#123456',
    );
    assert.strictEqual(await focus(), '#123456');
    fs.writeFileSync(file, '{ "showAllFiles": tru');
    await page
      .locator('.notice.error', { hasText: 'not valid JSON' })
      .waitFor();
    fs.writeFileSync(file, JSON.stringify({ showAllFiles: true }));
    await page.waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-focus')
          .trim() !== '#123456',
    );
  });

  test('wraps long lines on its button or W, each row as tall as the lines the app expects its text to wrap to, clear of the minimap, keeping the line at the top in place, saving the choice', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    const row = page.locator('.diff-row', {
      has: page.locator('.code', { hasText: firstLongLine }),
    });
    await row.waitFor();
    assert.strictEqual((await row.boundingBox())?.height, 22);
    await page.getByRole('button', { name: 'Word Wrap' }).click();
    await page.locator('.diff-view.wrap').waitFor();
    await page.waitForFunction(
      (text) =>
        [...document.querySelectorAll('.diff-row')].some(
          (wrapped) =>
            wrapped.querySelector('.code')?.textContent === text &&
            wrapped.getBoundingClientRect().height > 22,
        ),
      firstLongLine,
    );
    const laidOut = await row.evaluate((element) => {
      const code = element.querySelector('.code');
      const minimap = document.querySelector('.diff-minimap');
      if (!code || !minimap) {
        throw new Error('No code or minimap');
      }
      const style = getComputedStyle(code);
      const sample = document.createElement('span');
      sample.style.font = style.font;
      sample.style.whiteSpace = 'pre';
      sample.textContent = '0'.repeat(100);
      document.body.append(sample);
      const char = sample.getBoundingClientRect().width / 100;
      sample.remove();
      let right = 0;
      const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const glyph = document.createRange();
        for (let index = 0; index < (node.textContent ?? '').length; index++) {
          if (!/\s/.test(node.textContent?.[index] ?? '')) {
            glyph.setStart(node, index);
            glyph.setEnd(node, index + 1);
            right = Math.max(right, glyph.getBoundingClientRect().right);
          }
        }
      }
      return {
        height: element.getBoundingClientRect().height,
        width:
          code.getBoundingClientRect().width -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
        char,
        right,
        minimap: minimap.getBoundingClientRect().left,
      };
    });
    assert.strictEqual(
      laidOut.height,
      wrappedLines(firstLongLine, wrapColumns(laidOut.width, laidOut.char)) *
        22,
    );
    assert.ok(laidOut.right <= laidOut.minimap, JSON.stringify(laidOut));
    const userSettings = path.join(profile, 'settings.user.json');
    await waitFor(
      () => fs.readFileSync(userSettings, 'utf8').includes('"wordWrap": true'),
      'the choice to be saved',
    );
    const list = page.locator('.diff-view .virtual-rows');
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2;
    });
    const topLine = () =>
      list.evaluate((element) => {
        const top = element.getBoundingClientRect().top + 0.5;
        const atTop = [...element.querySelectorAll('.diff-row')].find(
          (candidate) => {
            const box = candidate.getBoundingClientRect();
            return box.top <= top && box.bottom > top;
          },
        );
        return atTop?.querySelector('.code')?.textContent?.split(' ')[0];
      });
    await page.waitForTimeout(100);
    const reading = await topLine();
    assert.match(reading ?? '', /^line[1-9]\d*$/);
    for (const wrapped of [false, true]) {
      await page.keyboard.press('w');
      await page
        .locator('.diff-view.wrap')
        .waitFor({ state: wrapped ? 'attached' : 'detached' });
      await page.waitForTimeout(100);
      assert.strictEqual(await topLine(), reading);
    }
    for (const change of [
      () => page.getByRole('button', { name: 'Side by Side' }).click(),
      () => page.keyboard.press('w'),
      () => page.getByRole('button', { name: 'Inline' }).click(),
      () => page.keyboard.press('w'),
    ]) {
      await change();
      await page.waitForTimeout(100);
      assert.strictEqual(await topLine(), reading);
    }
  });

  test('scrolls the two sides of a side by side diff together on a sideways scrollbar, shown while a line is too wide', async () => {
    const first = page.locator('.commit', { hasText: 'first' });
    if (!(await first.evaluate((row) => row.classList.contains('selected')))) {
      await first.click();
    }
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    await page.getByRole('button', { name: 'Side by Side' }).click();
    if ((await page.locator('.diff-view.wrap').count()) > 0) {
      await page.keyboard.press('w');
      await page.locator('.diff-view.wrap').waitFor({ state: 'detached' });
    }
    const code = page.locator('.split-row .split-code').nth(1);
    await code.hover();
    const bar = page.locator('.overlay-scrollbar.horizontal.shown');
    await bar.waitFor();
    const before = await code.locator('.code').boundingBox();
    const thumb = await bar.boundingBox();
    assert.ok(before && thumb);
    await page.mouse.move(thumb.x + 5, thumb.y + thumb.height / 2);
    await page.mouse.down();
    await page.mouse.move(thumb.x + 105, thumb.y + thumb.height / 2, {
      steps: 5,
    });
    await page.mouse.up();
    const after = await code.locator('.code').boundingBox();
    assert.ok(after && after.x < before.x - 100, JSON.stringify(after));
    const moved = await bar.boundingBox();
    assert.ok(moved && moved.x > thumb.x + 90, JSON.stringify(moved));

    await page.keyboard.press('w');
    await page.locator('.diff-view.wrap').waitFor();
    await page.mouse.move(0, 0);
    await code.hover();
    await page.waitForTimeout(100);
    assert.strictEqual(await bar.count(), 0);
    await page.getByRole('button', { name: 'Inline' }).click();
  });

  test('refreshes by itself when the working tree changes', async () => {
    fs.writeFileSync(path.join(repository.root, 'new.txt'), 'new\n');
    await page
      .locator('.working-tree', { hasText: '1 uncommitted change' })
      .waitFor();
  });
});

suite('App without git', function () {
  this.timeout(60_000);

  test('says it needs git, showing no window', async () => {
    const folder = tempFolder('no-git');
    const profile = path.join(folder, 'profile');
    const log = path.join(profile, 'logs', 'Fastforward.log');
    const app = await _electron.launch({
      args: [appFolder, `--user-data-dir=${profile}`],
      cwd: appFolder,
      env: {
        ...process.env,
        PATH: folder,
        Path: folder,
        SHELL: path.join(folder, 'no-shell'),
      },
    });
    try {
      await waitFor(() => {
        try {
          return fs.readFileSync(log, 'utf8').includes('Install git');
        } catch {
          return false;
        }
      }, 'the missing git to be logged');
      // On macOS the alert about git is app-modal without a window shown,
      // holding the main process until it is answered
      if (process.platform !== 'darwin') {
        const page = await app.firstWindow();
        await page.waitForLoadState('load');
        await new Promise((resolve) => setTimeout(resolve, 500));
        const visible = await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().map((window) => window.isVisible()),
        );
        assert.deepStrictEqual(visible, [false]);
      }
    } finally {
      const child = app.process();
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGKILL');
        await exited;
      }
      await app.close();
      removeFolder(folder);
    }
  });
});
