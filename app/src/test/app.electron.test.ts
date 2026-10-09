import * as assert from 'node:assert';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  _electron,
  type ElectronApplication,
  type Locator,
  type Page,
} from 'playwright-core';
import { strings } from '../shared/strings';
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
const paragraphs = Array.from(
  { length: 200 },
  (_, index) => `Paragraph ${index}`,
);

function waitForCount(
  locator: Locator,
  count: number,
  what: string,
): Promise<void> {
  return waitFor(
    async () => (await locator.count()) === count,
    `${count} ${what}`,
  );
}

function waitForFocus(locator: Locator, what: string): Promise<void> {
  return waitFor(
    () => locator.evaluate((element) => element === document.activeElement),
    `${what} to be focused`,
  );
}

const baseSettings = { diffLayout: 'inline' };

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
      'code.ts': 'export const answer = 42;\n',
      'long.txt': `${longLines.join('\n')}\n`,
      'changed.txt': 'one\ntwo\nthree\n',
      'notes.md': `${paragraphs.join('\n\n')}\n`,
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

  setup(async () => {
    await resetSettings();
    await page.locator('.commit', { hasText: 'second' }).waitFor();
    for (const [popup, focused] of [
      ['.context-menu', '.context-menu .menu-item'],
      ['.locations-popup', '.locations-search'],
      ['.shortcuts-popup', '.shortcuts-popup'],
    ]) {
      if ((await page.locator(popup).count()) > 0) {
        await page.locator(focused).first().focus();
        await page.keyboard.press('Escape');
        await page.locator(popup).waitFor({ state: 'detached' });
      }
    }
    if ((await page.locator('.diff-find.active').count()) > 0) {
      await page.locator('.diff-find-input').fill('');
    }
    const notice = page.locator('.notice-close').first();
    while ((await notice.count()) > 0) {
      await notice.click({ timeout: 1000 }).catch(() => undefined);
    }
    await page.locator('.virtual-rows.list').focus();
    await page.keyboard.press('Home');
    await page.locator('.commit.working-tree.selected').waitFor();
  });

  function userSettings(): unknown {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(profile, 'settings.user.json'), 'utf8'),
      );
    } catch (error) {
      return error instanceof SyntaxError ? error : {};
    }
  }

  function savedSetting(name: string): unknown {
    const settings = userSettings();
    return typeof settings === 'object' && settings !== null
      ? Reflect.get(settings, name)
      : undefined;
  }

  async function resetSettings(): Promise<void> {
    const settings = userSettings();
    const expected = { ...defaultSettings(), ...baseSettings };
    if (
      typeof settings === 'object' &&
      settings !== null &&
      !(settings instanceof Error) &&
      Object.entries(settings).every(
        ([name, value]) =>
          JSON.stringify(value) === JSON.stringify(Reflect.get(expected, name)),
      ) &&
      Object.keys(baseSettings).every((name) => name in settings)
    ) {
      return;
    }
    const reloaded = page.waitForEvent('load');
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      `${JSON.stringify(baseSettings)}\n`,
    );
    await reloaded;
  }

  async function openChangedFile(): Promise<void> {
    await page.locator('.commit', { hasText: 'second' }).click();
    await page.locator('.row.file', { hasText: 'changed.txt' }).click();
    await page.locator('.diff-line.added', { hasText: '2' }).waitFor();
  }

  test('opens the saved tab, titling the window after its repository', async () => {
    await page.locator('.tabs .tab.active').waitFor();
    assert.strictEqual(
      await page.locator('.tabs .tab.active .tab-name').textContent(),
      'repo',
    );
    await page.locator('.worktrees .tab.active').waitFor();
    assert.strictEqual(
      await page.locator('.worktrees .tab.active .tab-name').textContent(),
      'main',
    );
    const version = await app.evaluate((electron) => electron.app.getVersion());
    assert.strictEqual(
      await page.title(),
      `${repository.root} - ${strings.app.name(version, true)}`,
    );
  });

  test('focuses the commit list, whose keys start from the checked-out commit', async () => {
    await page.reload();
    await page.locator('.commit', { hasText: 'second' }).waitFor();
    await waitForFocus(page.locator('.virtual-rows.list'), 'the commit list');
    await page.keyboard.press('ArrowDown');
    await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    await page.keyboard.press('End');
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
    await page.keyboard.press('Home');
    await page.locator('.commit.working-tree.empty.selected').waitFor();
    await page.locator('.columns.nothing-selected').waitFor();
  });

  test('selects the checked-out commit on H, revealing it', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
    await page.keyboard.press('h');
    await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    await page.keyboard.press('Home');
    await page.locator('.commit.working-tree.empty.selected').waitFor();
  });

  test('selects the first parent on Alt+Down', async () => {
    await page.keyboard.press('h');
    await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    await page.keyboard.press('Alt+ArrowDown');
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
    await page.keyboard.press('Home');
    await page.locator('.commit.working-tree.empty.selected').waitFor();
  });

  test('says on U that the checked-out branch has no upstream to show', async () => {
    await page.keyboard.press('u');
    await page
      .locator('.notice.info', { hasText: 'main has no upstream' })
      .waitFor();
  });

  test('shows the shortcuts on F1 or ?, closing them on Esc or F1', async () => {
    const shortcuts = page.getByRole('dialog', { name: 'Shortcuts' });
    await page.keyboard.press('F1');
    await shortcuts.waitFor();
    await page.keyboard.press('Escape');
    await shortcuts.waitFor({ state: 'detached' });
    await page.keyboard.press('?');
    await shortcuts.waitFor();
    await page.keyboard.press('F1');
    await shortcuts.waitFor({ state: 'detached' });
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
    await waitForFocus(page.locator('.virtual-rows.list'), 'the commit list');
  });

  test('lists the history and shows a commit entire, with its change', async () => {
    await page.locator('.commit', { hasText: 'second' }).click();
    await page.locator('.row.file', { hasText: 'changed.txt' }).click();
    await page.locator('.diff-line.added').first().waitFor();
    assert.deepStrictEqual(
      await page.locator('.diff-row .diff-line .code').allTextContents(),
      ['one', 'two', '2', 'three'],
    );
    await page.locator('.diff-minimap').waitFor();
  });

  test('colors code away from the page', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'code.ts' }).click();
    await page.locator('.syntax-keyword', { hasText: 'export' }).waitFor();
    await page.locator('.syntax-number', { hasText: '42' }).waitFor();
  });

  test('finds in the diff on Ctrl+F, stepping on Enter and clearing on Esc', async () => {
    await openChangedFile();
    await page.keyboard.press('Control+F');
    const field = page.locator('.diff-find-input');
    await waitForFocus(field, 'the find field');
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
    await waitForCount(page.locator('.minimap-mark.match'), 2, 'match marks');
    await page.locator('.minimap-mark.added').first().waitFor();
    await page.locator('.row.group', { hasText: 'All Changes' }).click();
    await page.locator('.diff-find-count', { hasText: '1 of 2' }).waitFor();
    await page.locator('.diff-minimap').waitFor();
    await waitForCount(page.locator('.minimap-mark.match'), 2, 'match marks');
    await waitForCount(page.locator('.minimap-mark.added'), 0, 'added marks');
    await field.press('Escape');
    await count.waitFor({ state: 'detached' });
    await waitForCount(page.locator('.find-match'), 0, 'matches');
  });

  test('shows the diff side by side on its button, the default, and inline again on the other, saving that choice', async () => {
    await openChangedFile();
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
    await waitFor(
      () => savedSetting('diffLayout') === undefined,
      'the layout to be saved',
    );
    await page.getByRole('button', { name: 'Inline' }).click();
    await sides.first().waitFor({ state: 'detached' });
    assert.strictEqual(
      await page.locator('.diff-view.side-by-side').count(),
      0,
    );
    await page.locator('.diff-line.added').first().waitFor();
    await waitFor(
      () => savedSetting('diffLayout') === 'inline',
      'the layout to be saved',
    );
  });

  test('moves between the columns with the arrows and Tab, the keys working in the one active', async () => {
    const active = (column: string) =>
      page.locator(`.columns[data-active-column="${column}"]`).waitFor();
    await page.locator('.commit', { hasText: 'second' }).click();
    await page.locator('.row.group', { hasText: 'All Changes' }).click();
    await page
      .locator('.row.group.selected', { hasText: 'All Changes' })
      .waitFor();
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
    await page.locator('.commit', { hasText: 'second' }).click();
    await page.locator('.row.file', { hasText: 'changed.txt' }).waitFor();
    assert.strictEqual(
      await page.locator('.row.file', { hasText: 'kept.txt' }).count(),
      0,
    );
    await page.getByRole('button', { name: 'Show All Files' }).click();
    await page
      .locator('.row.file .path.unchanged', { hasText: 'kept.txt' })
      .waitFor();
    await waitFor(
      () => savedSetting('showAllFiles') === true,
      'the setting to be saved',
    );
  });

  test('moved the old settings file into the state, keeping it aside', () => {
    assert.ok(
      fs.existsSync(path.join(profile, 'settings.old.json')),
      'no settings.old.json',
    );
    assert.ok(
      !fs.existsSync(path.join(profile, 'settings.json')),
      'settings.json is still there',
    );
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
    fs.writeFileSync(file, '{}');
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
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
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
    await waitFor(
      () => savedSetting('wordWrap') === true,
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
    await waitFor(
      async () => /^line[1-9]\d*$/.test((await topLine()) ?? ''),
      'a line at the top',
    );
    const reading = await topLine();
    const pressWrap = () => page.keyboard.press('w');
    const clickView = (name: string) => () =>
      page.getByRole('button', { name }).click();
    for (const [change, shown, state] of [
      [pressWrap, '.diff-view.wrap', 'detached'],
      [pressWrap, '.diff-view.wrap', 'attached'],
      [clickView('Side by Side'), '.diff-view.side-by-side', 'attached'],
      [pressWrap, '.diff-view.wrap', 'detached'],
      [clickView('Inline'), '.diff-view.side-by-side', 'detached'],
      [pressWrap, '.diff-view.wrap', 'attached'],
    ] as const) {
      await change();
      await page.locator(shown).waitFor({ state });
      await waitFor(
        async () => (await topLine()) === reading,
        `${reading} to stay at the top once ${shown} is ${state}`,
      );
    }
    await waitFor(
      () =>
        savedSetting('wordWrap') === true &&
        savedSetting('diffLayout') === 'inline',
      'the last choices to be saved',
    );
  });

  test('scrolls the two sides of a side by side diff together on a sideways scrollbar, shown while a line is too wide', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    await page.getByRole('button', { name: 'Side by Side' }).click();
    const code = page.locator('.split-row .split-code').nth(1);
    await code.hover();
    const bar = page.locator('.overlay-scrollbar.horizontal.shown');
    await bar.waitFor();
    const before = await code.locator('.code').boundingBox();
    const thumb = await bar.boundingBox();
    assert.ok(before && thumb, 'the code or the scrollbar has no box');
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
    await waitFor(
      () =>
        savedSetting('wordWrap') === true &&
        savedSetting('diffLayout') === 'inline',
      'the last choices to be saved',
    );
  });

  test('keeps the minimap on the part in view while a Markdown preview scrolls, though the preview is one row however tall', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'notes.md' }).click();
    await page.getByRole('button', { name: strings.diff.showPreview }).click();
    await page.locator('.markdown p', { hasText: 'Paragraph 199' }).waitFor();
    const steps = await page
      .locator('.diff-view .virtual-rows')
      .evaluate(async (list) => {
        const view =
          list.parentElement?.querySelector<HTMLElement>('.minimap-viewport');
        if (!view) {
          throw new Error('No part in view on the minimap');
        }
        const seen = [];
        for (let step = 0; step < 10; step++) {
          list.scrollTop += 100;
          await new Promise((drawn) =>
            requestAnimationFrame(() => requestAnimationFrame(drawn)),
          );
          seen.push({
            scrolled: (100 * list.scrollTop) / list.scrollHeight,
            marked: parseFloat(view.style.top),
          });
        }
        return seen;
      });
    for (const { scrolled, marked } of steps) {
      assert.ok(Math.abs(scrolled - marked) < 0.1, JSON.stringify(steps));
    }
  });

  test('refreshes by itself when the working tree changes', async () => {
    const file = path.join(repository.root, 'new.txt');
    fs.writeFileSync(file, 'new\n');
    try {
      await page
        .locator('.working-tree', { hasText: '1 uncommitted change' })
        .waitFor();
    } finally {
      fs.rmSync(file, { force: true });
    }
    await page.locator('.commit.working-tree.empty').waitFor();
  });

  test('expands and collapses the selected merge on Space', async () => {
    const [main] = await repository.resolve('main');
    const merge = page.locator('.commit', { hasText: 'merge topic' });
    const merged = page.locator('.commit', { hasText: 'topic work' });
    await repository.git('switch', '-q', '-c', 'topic', 'HEAD~1');
    try {
      await repository.commit('topic work');
      await repository.git('switch', '-q', 'main');
      await repository.git(
        'merge',
        '-q',
        '--no-ff',
        '-m',
        'merge topic',
        'topic',
      );
      await merge.click();
      await page
        .locator('.commit.selected', { hasText: 'merge topic' })
        .waitFor();
      await page.keyboard.press('Space');
      await merged.waitFor();
      await page.keyboard.press('Space');
      await merged.waitFor({ state: 'detached' });
    } finally {
      await repository.git('switch', '-q', 'main');
      await repository.git('reset', '-q', '--keep', main);
      await repository.git('branch', '-q', '-D', 'topic');
    }
    await merge.waitFor({ state: 'detached' });
  });

  test('shows a stash in the list, found in the search by its message, with its untracked files', async () => {
    fs.writeFileSync(path.join(repository.root, 'aside.txt'), 'aside\n');
    await repository.git('stash', 'push', '-q', '-u', '-m', 'kept aside');
    const stash = page.locator('.commit', { hasText: 'On main: kept aside' });
    try {
      await stash.waitFor();
      await page.keyboard.press('s');
      await page.locator('.locations-search').fill('kept');
      await page
        .locator('.locations-group', { hasText: 'Stashes' })
        .locator('.row.result', { hasText: 'stash@{0}' })
        .waitFor();
      await page.keyboard.press('Enter');
      await page
        .locator('.commit.selected', { hasText: 'kept aside' })
        .waitFor();
      await page.locator('.row.file', { hasText: 'aside.txt' }).waitFor();
    } finally {
      await repository.git('stash', 'drop', '-q');
    }
    await stash.waitFor({ state: 'detached' });
  });

  test('jumps to the first change of a file once selected, and again once shown entire or not, landing where J would', async () => {
    const file = path.join(repository.root, 'long.txt');
    fs.writeFileSync(
      file,
      `${longLines.map((line, index) => (index === 150 ? 'changed far down' : line)).join('\n')}\n`,
    );
    const change = page.locator('.diff-line.removed', {
      hasText: 'line150 word0',
    });
    const belowTop = () =>
      change.evaluate((element) => {
        const list = element.closest('.virtual-rows');
        if (!list) {
          throw new Error('No diff list');
        }
        return Math.round(
          element.getBoundingClientRect().top -
            list.getBoundingClientRect().top,
        );
      });
    try {
      await page.locator('.commit', { hasText: 'second' }).click();
      await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
      await page
        .locator('.commit.working-tree', { hasText: '1 uncommitted change' })
        .click();
      await page.locator('.row.file', { hasText: 'long.txt' }).click();
      await change.waitFor();
      assert.strictEqual(await belowTop(), 66);
      await page.getByRole('button', { name: 'Unpin Entire Files' }).click();
      await page
        .getByRole('button', { name: 'Show the Entire File' })
        .waitFor();
      await waitFor(
        async () =>
          (await page.locator('.diff-line').count()) < 20 &&
          (await belowTop()) === 88,
        'only the changes to be shown, too few to scroll',
      );
      await page.getByRole('button', { name: 'Show the Entire File' }).click();
      await page
        .getByRole('button', { name: 'Show Only the Changes' })
        .waitFor();
      await waitFor(
        async () => (await belowTop()) === 66,
        'the entire file to be shown at its change',
      );
    } finally {
      await repository.git('checkout', '-q', 'HEAD', '--', 'long.txt');
    }
    await page.locator('.commit.working-tree.empty').waitFor();
  });

  test('shows the staged and unstaged halves of a file apart, the staged one first', async () => {
    const file = path.join(repository.root, 'changed.txt');
    fs.writeFileSync(file, 'one\nstaged\nthree\n');
    try {
      await page.locator('.commit', { hasText: 'second' }).click();
      await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
      await repository.git('add', 'changed.txt');
      fs.writeFileSync(file, 'one\nstaged\nunstaged\n');
      await page
        .locator('.commit.working-tree', { hasText: '1 uncommitted change' })
        .click();
      await page
        .locator('.row.group.selected', { hasText: /^Staged/ })
        .waitFor();
      await page.locator('.diff-line.added', { hasText: 'staged' }).waitFor();
      await page
        .locator('.row.file', { hasText: 'changed.txt' })
        .nth(1)
        .click();
      await page.locator('.diff-line.added', { hasText: 'unstaged' }).waitFor();
      assert.deepStrictEqual(
        await page.locator('.diff-line.added .code').allTextContents(),
        ['unstaged'],
      );
    } finally {
      await repository.git('checkout', '-q', 'HEAD', '--', 'changed.txt');
    }
    await page.locator('.commit.working-tree.empty').waitFor();
  });
});

suite('App quitting', function () {
  this.timeout(60_000);

  test('stops the git it still runs, which would outlive it', async () => {
    const folder = tempFolder('quitting');
    const profile = path.join(folder, 'profile');
    const alive = path.join(folder, 'alive').replaceAll('\\', '/');
    const stop = path.join(folder, 'stop').replaceAll('\\', '/');
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first');
    await repository.git('remote', 'add', 'origin', 'ssh://stalled.invalid/x');
    await repository.git(
      'config',
      'core.sshCommand',
      `i=0; while [ ! -e '${stop}' ]; do i=$((i + 1)); echo $i > '${alive}'; sleep 0.2; done; false`,
    );
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'settings.json'),
      JSON.stringify({ tabs: [repository.root], activeTab: repository.root }),
    );
    const app = await _electron.launch({
      args: [appFolder, `--user-data-dir=${profile}`],
      cwd: appFolder,
    });
    try {
      const page = await app.firstWindow();
      await page.locator('.commit', { hasText: 'first' }).waitFor();
      await page.getByTitle(strings.navigation.fetch, { exact: true }).click();
      await waitFor(() => fs.existsSync(alive), 'git to fetch');
      await app.close();
      const counted = fs.readFileSync(alive, 'utf8');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      assert.strictEqual(fs.readFileSync(alive, 'utf8'), counted);
    } finally {
      fs.writeFileSync(stop, '');
      await app.close();
      removeFolder(folder);
    }
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
