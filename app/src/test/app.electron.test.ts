import * as assert from 'node:assert';
import { spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  _electron,
  type ElectronApplication,
  type JSHandle,
  type Locator,
  type Page,
} from 'playwright-core';
import { afterAll, beforeAll, beforeEach, suite, test } from 'vitest';
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

const commented = (answer: number) =>
  `/* the answer\na\nb\nc\n*/\nexport const answer = ${answer};\n`;

const longLine = Array.from({ length: 80 }, (_, index) => `word${index}`).join(
  ' ',
);
const longLines = Array.from(
  { length: 200 },
  (_, index) => `line${index} ${longLine}`,
);
const [firstLongLine] = longLines;
const hyphenatedLine = Array.from(
  { length: 60 },
  (_, index) => `part${index}`,
).join('-');
const dottedLine = `        ${Array.from(
  { length: 60 },
  (_, index) => `part${index}`,
).join('.')};`;
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

function within<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Timed out waiting for ${what}`)),
        10_000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

async function closeOrKill(app: ElectronApplication): Promise<void> {
  const closing = app.close();
  try {
    await within(closing, 'the app to close');
  } catch {
    killWithChildren(app.process());
    closing.catch(() => undefined);
  }
}

function holdsStartLock(profile: string): boolean {
  return ['lockfile', 'SingletonLock'].some(
    (name) =>
      fs.lstatSync(path.join(profile, name), { throwIfNoEntry: false }) !==
      undefined,
  );
}

function killWithChildren(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid !== undefined) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f']);
    return;
  }
  child.kill('SIGKILL');
}

function waitForFocus(locator: Locator, what: string): Promise<void> {
  return waitFor(
    () => locator.evaluate((element) => element === document.activeElement),
    `${what} to be focused`,
  );
}

function wrappedRows(
  line: Locator,
): Promise<{ last: string; follows: boolean }[]> {
  return line.evaluate((element) => {
    const code = element.querySelector('.code');
    if (!code) {
      throw new Error('No code');
    }
    const text = code.textContent ?? '';
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    if (!(node instanceof Text) || node.length !== text.length) {
      throw new Error('Not one text node');
    }
    const range = document.createRange();
    const ends = new Map<number, { right: number; last: string }>();
    for (let offset = 0; offset < text.length; offset++) {
      range.setStart(node, offset);
      range.setEnd(node, offset + 1);
      const rect = range.getBoundingClientRect();
      ends.set(Math.round(rect.top), {
        right: rect.right,
        last: text[offset],
      });
    }
    const marks = Array.from(
      element.querySelectorAll('.wrap-break'),
      (mark) => mark.getBoundingClientRect().left,
    );
    return [...ends.values()].slice(0, -1).map(({ right, last }, index) => ({
      last,
      follows: Math.abs((marks[index] ?? Infinity) - right) < 1,
    }));
  });
}

async function marksFollowRows(line: Locator): Promise<boolean> {
  const rows = await wrappedRows(line);
  return (
    rows.length > 1 && rows.every((row) => row.last === '-' && row.follows)
  );
}

async function scrollsOnWheelOver(
  page: Page,
  list: Locator,
  band: Locator,
): Promise<void> {
  await list.evaluate((element) => {
    element.scrollTop = 200;
  });
  const box = await band.boundingBox();
  assert.ok(box, 'nothing stuck atop the list');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 100);
  await waitFor(
    async () => (await list.evaluate((element) => element.scrollTop)) > 200,
    'the list to scroll',
  );
}

const baseSettings = { diffLayout: 'inline', wordWrap: false };

suite('App', () => {
  let folder: string;
  let profile: string;
  let repository: TempRepository;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('app');
    profile = path.join(folder, 'profile');
    repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first', {
      'kept.txt': 'kept\n',
      'code.ts': 'export const answer = 42;\n',
      'commented.ts': commented(42),
      'long.txt': `${longLines.join('\n')}\n`,
      'hyphenated.txt': `${hyphenatedLine}\n`,
      'changed.txt': 'one\ntwo\nthree\n',
      'notes.md': `${paragraphs.join('\n\n')}\n`,
      'diagram.md':
        '# Diagram\n\n```mermaid\ngraph LR\n  Fetch["Fetch<br/>every remote"] --> Merge\n```\n',
      'wrapped.txt': `${dottedLine}\n`,
    });
    await repository.commit('second', { 'changed.txt': 'one\n2\nthree\n' });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'settings.json'),
      JSON.stringify({
        tabs: [repository.root],
        activeTab: repository.root,
        recentRepositories: [path.join(folder, 'other')],
      }),
    );
    app = await _electron.launch({
      args: [appFolder, `--user-data-dir=${profile}`],
      cwd: appFolder,
    });
    page = await app.firstWindow();
    await waitForSettingsToBeWatched();
  });

  afterAll(async () => {
    await app?.close();
    removeFolder(folder);
  });

  beforeEach(async () => {
    await resetSettings();
    await page.locator('.commit', { hasText: 'second' }).waitFor();
    for (const [popup, focused] of [
      ['.context-menu', '.context-menu .menu-item'],
      ['.locations-popup', '.locations-search'],
      ['.shortcuts-popup', '.shortcuts-popup'],
      ['.search-row', '.search-row input'],
    ]) {
      if ((await page.locator(popup).count()) > 0) {
        await page.locator(focused).first().focus();
        await page.keyboard.press('Escape');
        await page.locator(popup).waitFor({ state: 'detached' });
      }
    }
    const notice = page.locator('.notice-close').first();
    while ((await notice.count()) > 0) {
      await notice.click({ timeout: 1000 }).catch(() => undefined);
    }
    await page.locator('.virtual-rows.list').focus();
    await page.keyboard.press('Home');
    await page.locator('.commit.working-tree.selected').waitFor();
  });

  function waitForSettingsToBeWatched(): Promise<void> {
    return page.locator('.commit', { hasText: 'second' }).waitFor();
  }

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

  function wrapsSaved(): boolean {
    return (savedSetting('wordWrap') ?? defaultSettings().wordWrap) === true;
  }

  function viewSaved(wordWrap: boolean, diffLayout: string): boolean {
    const defaults = defaultSettings();
    return (
      (savedSetting('wordWrap') ?? defaults.wordWrap) === wordWrap &&
      (savedSetting('diffLayout') ?? defaults.diffLayout) === diffLayout
    );
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

  test('opens the saved tab, titling the window after its repository, showing no worktree row for its only worktree', async () => {
    await page.locator('.tabs .tab.active').waitFor();
    assert.strictEqual(
      await page.locator('.tabs .tab.active .tab-name').textContent(),
      'repo',
    );
    await page.locator('.commit', { hasText: 'second' }).waitFor();
    assert.strictEqual(await page.locator('.worktrees').count(), 0);
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

  test('selects the first parent on Ctrl+Down, or Cmd+Down on macOS', async () => {
    await page.keyboard.press('h');
    await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    await page.keyboard.press('ControlOrMeta+ArrowDown');
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

  test('goes back and forward through the selected commits on Alt+Left and Alt+Right', async () => {
    await page.keyboard.press('h');
    await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
    await page.keyboard.press('Alt+ArrowLeft');
    await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    await page.keyboard.press('Alt+ArrowRight');
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
  });

  test('shows About on Shift+F1, closing it on Esc or Shift+F1', async () => {
    const about = page.getByRole('dialog', { name: 'About' });
    await page.keyboard.press('Shift+F1');
    await about.waitFor();
    await page.keyboard.press('Escape');
    await about.waitFor({ state: 'detached' });
    await page.keyboard.press('Shift+F1');
    await about.waitFor();
    await page.keyboard.press('Shift+F1');
    await about.waitFor({ state: 'detached' });
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

  test('closes the menu of recent repositories when + is clicked again, or on Ctrl+T again', async () => {
    const add = page.locator('.tab-add');
    const menu = page.locator('.context-menu', { hasText: 'other' });
    await add.click();
    await menu.waitFor();
    await add.click();
    assert.strictEqual(await menu.count(), 0);
    await page.keyboard.press('ControlOrMeta+T');
    await menu.waitFor();
    await page.keyboard.press('ControlOrMeta+T');
    assert.strictEqual(await menu.count(), 0);
  });

  test('opens the commit search from the round button at the far right of the commit column', async () => {
    const commits = page.locator('.columns > .column').first();
    const button = commits.locator('.column-actions > .search-button');
    const popup = page.locator('.locations-popup');
    const [shown, header] = await Promise.all([
      button.boundingBox(),
      commits.locator('.column-title').boundingBox(),
    ]);
    assert.ok(shown && header);
    assert.ok(header.x + header.width - (shown.x + shown.width) <= 8);
    await button.click();
    await waitForFocus(page.locator('.locations-search'), 'the search field');
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
  });

  test('ends the search popup where its column ends, showing none of its list in the gap below', async () => {
    const commits = page.locator('.columns > .column').first();
    const popup = page.locator('.locations-popup');
    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(page.locator('.locations-search'), 'the search field');
    const [shown, column] = await Promise.all([
      popup.boundingBox(),
      commits.boundingBox(),
    ]);
    assert.ok(shown && column);
    assert.ok(
      Math.abs(shown.y + shown.height - (column.y + column.height)) < 1,
      `the popup ends at ${shown.y + shown.height}, the column at ${column.y + column.height}`,
    );
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
  });

  test('gives the keyboard back to the commit list once the search popup closes on Esc or a jump, by key or click', async () => {
    const list = page.locator('.virtual-rows.list');
    const field = page.locator('.locations-search');
    const popup = page.locator('.locations-popup');
    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(field, 'the search field');
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
    await waitForFocus(list, 'the commit list');
    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(field, 'the search field');
    await field.fill('second');
    await popup.locator('.commit', { hasText: 'second' }).waitFor();
    await page.keyboard.press('Enter');
    await popup.waitFor({ state: 'detached' });
    await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    await waitForFocus(list, 'the commit list');
    await page.keyboard.press('ArrowDown');
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(field, 'the search field');
    await field.fill('main');
    await popup.locator('.row.result[title="main"]').click();
    await popup.waitFor({ state: 'detached' });
    await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    await waitForFocus(list, 'the commit list');
    await page.keyboard.press('ArrowDown');
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
  });

  test('keeps the search popup open in the worktree switched to with it open, its field keeping the keyboard', async () => {
    const worktree = path.join(folder, 'other');
    const worktrees = page.locator('.worktrees .tab');
    const popup = page.locator('.locations-popup');
    const field = page.locator('.locations-search');
    await repository.git('worktree', 'add', '-q', '-b', 'other', worktree);
    try {
      await waitForCount(worktrees, 2, 'worktrees');
      await page.keyboard.press('ControlOrMeta+F');
      await waitForFocus(field, 'the search field');
      await page.keyboard.press('Control+PageDown');
      await page
        .locator('.commit .badge.branch.checked-out', { hasText: 'other' })
        .waitFor();
      assert.strictEqual(await popup.count(), 1);
      assert.ok(
        await field.evaluate((element) => element === document.activeElement),
      );
    } finally {
      if ((await popup.count()) > 0) {
        await page.keyboard.press('Escape');
        await popup.waitFor({ state: 'detached' });
      }
      await page.keyboard.press('Control+PageUp');
      await page
        .locator('.commit .badge.branch.checked-out', { hasText: 'main' })
        .waitFor();
      await repository.git('worktree', 'remove', '--force', worktree);
      await repository.git('branch', '-q', '-D', 'other');
      await waitForCount(worktrees, 0, 'worktrees');
    }
  });

  test('keeps the place a worktree was scrolled to when another is shown right after the scroll, rather than its top', async () => {
    const worktree = path.join(folder, 'scrolled');
    const worktrees = page.locator('.worktrees .tab');
    const main = page.locator('.worktrees .tab.active', { hasText: 'main' });
    const other = page.locator('.worktrees .tab.active', {
      hasText: 'scrolled',
    });
    const list = page.locator('.virtual-rows.list');
    const scrolledTo = 600;
    await repository.git('worktree', 'add', '-q', '-b', 'scrolled', worktree);
    try {
      for (let index = 0; index < 40; index++) {
        await repository.git(
          '-C',
          worktree,
          'commit',
          '-q',
          '--allow-empty',
          '-m',
          `scrolled ${index}`,
        );
      }
      await waitForCount(worktrees, 2, 'worktrees');
      await page.locator('.commit', { hasText: 'scrolled 39' }).waitFor();
      await list.evaluate(
        (element, top) =>
          new Promise((resolve) => {
            element.addEventListener('scroll', resolve, { once: true });
            element.scrollTop = top;
          }),
        scrolledTo,
      );
      await page.keyboard.press('Control+PageDown');
      await other.waitFor();
      await page.keyboard.press('Control+PageUp');
      await main.waitFor();
      await waitFor(
        async () =>
          (await list.evaluate((element) => element.scrollTop)) === scrolledTo,
        `the list to be scrolled to ${scrolledTo}`,
        5000,
      );
    } finally {
      if ((await other.count()) > 0) {
        await page.keyboard.press('Control+PageUp');
        await main.waitFor();
      }
      await repository.git('worktree', 'remove', '--force', worktree);
      await repository.git('branch', '-q', '-D', 'scrolled');
      await waitForCount(worktrees, 0, 'worktrees');
    }
  });

  test('gives the keyboard back to the commit list once the Fetch button it is on is disabled while fetching', async () => {
    const stop = path.join(folder, 'stop-fetch').replaceAll('\\', '/');
    const fetchButton = page.locator('.pin-pair > .nav-button').first();
    await repository.git('remote', 'add', 'origin', 'ssh://stalled.invalid/x');
    await repository.git(
      'config',
      'core.sshCommand',
      `while [ ! -e '${stop}' ]; do sleep 0.2; done; false`,
    );
    try {
      await fetchButton.click();
      await page.locator('.pin-pair > .nav-button.running').waitFor();
      await waitForFocus(page.locator('.virtual-rows.list'), 'the commit list');
      await page.keyboard.press('ArrowDown');
      await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
    } finally {
      fs.writeFileSync(stop, '');
      await page
        .locator('.pin-pair > .nav-button.running')
        .waitFor({ state: 'detached' });
      await repository.git('remote', 'remove', 'origin');
      await repository.git('config', '--unset', 'core.sshCommand');
      fs.rmSync(stop);
    }
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

  test('keeps the lines of a diff colored as the whole text of their side has it while the working tree changes under it', async () => {
    const file = path.join(repository.root, 'commented.ts');
    fs.writeFileSync(file, commented(43));
    let watching:
      JSHandle<{ uncolored: string[]; stop: () => void }> | undefined;
    try {
      await page.locator('.row.file', { hasText: 'commented.ts' }).click();
      await page
        .locator('.diff-line .syntax-comment', { hasText: '*/' })
        .first()
        .waitFor();
      watching = await page.evaluateHandle(() => {
        const expected = new Map([
          ['b', 'syntax-comment'],
          ['c', 'syntax-comment'],
          ['*/', 'syntax-comment'],
          ['export const answer = 42;', 'syntax-keyword'],
        ]);
        const uncolored: string[] = [];
        const observer = new MutationObserver(() => {
          for (const code of document.querySelectorAll('.diff-line .code')) {
            const text = code.textContent ?? '';
            const kind = expected.get(text);
            if (kind !== undefined && !code.querySelector(`.${kind}`)) {
              uncolored.push(text);
            }
          }
        });
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
        });
        return { uncolored, stop: () => observer.disconnect() };
      });
      for (const answer of [44, 45, 46]) {
        fs.writeFileSync(file, commented(answer));
        await page
          .locator('.diff-line .syntax-number', { hasText: String(answer) })
          .first()
          .waitFor();
      }
      assert.deepStrictEqual(
        await watching.evaluate(({ uncolored }) => uncolored),
        [],
      );
    } finally {
      await watching?.evaluate(({ stop }) => stop());
      await repository.git('checkout', '-q', 'HEAD', '--', 'commented.ts');
    }
    await page.locator('.commit.working-tree.empty').waitFor();
  });

  test('finds in the diff on Ctrl+F in the diff, stepping on Enter and clearing on Esc', async () => {
    await openChangedFile();
    await page.locator('.diff-view .virtual-rows').focus();
    await page.keyboard.press('ControlOrMeta+F');
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

  test('opens the diff search from its round button, giving it the header but for going back and stepping between matches, and closes it from the back button', async () => {
    await openChangedFile();
    const diff = page.locator('.columns > .column').nth(2);
    await diff.locator('.column-actions > .search-button').click();
    const field = page.locator('.diff-find-input');
    await waitForFocus(field, 'the find field');
    assert.strictEqual(await diff.locator('.diff-options').count(), 0);
    assert.deepStrictEqual(
      await diff
        .locator('.column-title .nav-button')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('title')),
        ),
      ['Close', 'Previous Match', 'Next Match'],
    );
    await field.fill('T');
    await page.locator('.diff-line .find-match').first().waitFor();
    await diff.locator('.search-row > .nav-button').first().click();
    await field.waitFor({ state: 'detached' });
    await waitForCount(page.locator('.find-match'), 0, 'matches');
    await diff.locator('.diff-options').waitFor();
  });

  test('filters the files from their round button, marking what it found and showing the diffs of only those, keeping the search for another commit, closing it on Esc and opening it again on Ctrl+F in the files', async () => {
    const files = page.locator('.columns > .column').nth(1);
    const names = () => files.locator('.row.file .path').allTextContents();
    await page.locator('.commit', { hasText: 'first' }).click();
    await files.locator('.row.file', { hasText: 'kept.txt' }).waitFor();
    await files.locator('.column-actions > .search-button').click();
    const field = files.locator('.search-input');
    await waitForFocus(field, 'the files search');
    await field.fill('txt ch');
    await waitFor(
      async () => (await names()).join() === 'changed.txt',
      'only changed.txt listed',
    );
    assert.deepStrictEqual(
      await files.locator('.tree-row .match').allTextContents(),
      ['ch', 'txt'],
    );
    await waitFor(
      async () =>
        (await page.locator('.file-header .path').allTextContents()).join() ===
        'changed.txt',
      'only the diff of changed.txt',
    );
    await page.locator('.commit', { hasText: 'second' }).click();
    await files.locator('.row.file', { hasText: 'changed.txt' }).waitFor();
    assert.strictEqual(await field.inputValue(), 'txt ch');
    await field.focus();
    await page.keyboard.press('Escape');
    await field.waitFor({ state: 'detached' });
    await waitForFocus(files.locator('[data-column-focus]'), 'the files list');
    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(files.locator('.search-input'), 'the files search');
    assert.strictEqual(await files.locator('.search-input').inputValue(), '');
    await page.keyboard.press('Escape');
    await files.locator('.search-input').waitFor({ state: 'detached' });
  });

  test('gives the keyboard back to the diff once Esc closes the find field', async () => {
    await openChangedFile();
    await page.locator('.diff-view .virtual-rows').focus();
    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(page.locator('.diff-find-input'), 'the find field');
    await page.keyboard.press('Escape');
    await waitForFocus(page.locator('.diff-view .virtual-rows'), 'the diff');
  });

  test('keeps the keyboard in the diff once it is drawn anew for a commit selected from there, such as on Ctrl+Down', async () => {
    await openChangedFile();
    await page.locator('.diff-view .virtual-rows').focus();
    await page.keyboard.press('ControlOrMeta+ArrowDown');
    await page.locator('.commit.selected', { hasText: 'first' }).waitFor();
    await waitForFocus(page.locator('.diff-view .virtual-rows'), 'the diff');
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
    const colored = page.waitForEvent('load');
    fs.writeFileSync(
      file,
      JSON.stringify({
        colors: { light: { focus: '#123456' }, dark: { focus: '#123456' } },
      }),
    );
    await colored;
    await page.waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-focus')
          .trim() === '#123456',
    );
    assert.strictEqual(await focus(), '#123456');
    const broken = page.waitForEvent('load');
    fs.writeFileSync(file, '{ "showAllFiles": tru');
    await broken;
    await page
      .locator('.notice.error', { hasText: 'not valid JSON' })
      .waitFor();
    const emptied = page.waitForEvent('load');
    fs.writeFileSync(file, '{}');
    await emptied;
    await page.waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-focus')
          .trim() !== '#123456',
    );
  });

  test('wraps long lines on its button or W, each row as tall as the lines the app expects its text to wrap to, keeping the line at the top in place, saving the choice', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    const row = page.locator('.diff-row', {
      has: page.locator('.code', { hasText: firstLongLine }),
    });
    await row.waitFor();
    assert.strictEqual((await row.boundingBox())?.height, 17);
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    await page.locator('.diff-view.wrap').waitFor();
    await page.waitForFunction(
      (text) =>
        [...document.querySelectorAll('.diff-row')].some(
          (wrapped) =>
            wrapped.querySelector('.code')?.textContent === text &&
            wrapped.getBoundingClientRect().height > 17,
        ),
      firstLongLine,
    );
    const laidOut = await row.evaluate((element) => {
      const code = element.querySelector('.code');
      if (!code) {
        throw new Error('No code');
      }
      const style = getComputedStyle(code);
      const sample = document.createElement('span');
      sample.style.font = style.font;
      sample.style.whiteSpace = 'pre';
      sample.textContent = '0'.repeat(100);
      document.body.append(sample);
      const char = sample.getBoundingClientRect().width / 100;
      sample.remove();
      return {
        height: element.getBoundingClientRect().height,
        width:
          code.getBoundingClientRect().width -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
        char,
      };
    });
    assert.strictEqual(
      laidOut.height,
      wrappedLines(firstLongLine, wrapColumns(laidOut.width, laidOut.char)) *
        17,
    );
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
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
    for (const [change, shown, state, wraps, layout] of [
      [pressWrap, '.diff-view.wrap', 'detached', false, 'inline'],
      [pressWrap, '.diff-view.wrap', 'attached', true, 'inline'],
      [
        clickView('Side by Side'),
        '.diff-view.side-by-side',
        'attached',
        true,
        'sideBySide',
      ],
      [pressWrap, '.diff-view.wrap', 'detached', false, 'sideBySide'],
      [
        clickView('Inline'),
        '.diff-view.side-by-side',
        'detached',
        false,
        'inline',
      ],
      [pressWrap, '.diff-view.wrap', 'attached', true, 'inline'],
    ] as const) {
      await change();
      await page.locator(shown).waitFor({ state });
      await waitFor(
        async () => (await topLine()) === reading,
        `${reading} to stay at the top once ${shown} is ${state}`,
      );
      await waitFor(
        () => viewSaved(wraps, layout),
        `the choice that ${shown} is ${state} to be saved`,
      );
    }
  });

  test('marks where each wrapped row ends right after its text, where the browser broke it, after punctuation too, rather than where the app estimates', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'hyphenated.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    const line = page
      .locator('.diff-line', { has: page.locator('.wrap-break') })
      .first();
    await line.waitFor();
    await waitFor(
      () => marksFollowRows(line).catch(() => false),
      'the marks to follow the rows',
    );
    const rows = await wrappedRows(line);
    assert.ok(rows.length > 1, `${rows.length} rows`);
    assert.deepStrictEqual(
      rows,
      rows.map(() => ({ last: '-', follows: true })),
    );
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });

  test('wraps an indented line where VS Code would, after its punctuation, onto rows indented as far as it, as many as the app estimates, never leaving its indentation on a row of its own', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'wrapped.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    const line = page.locator('.diff-line', { hasText: 'part0.part1.' });
    await line.locator('.wrap-break').first().waitFor();
    const laidOut = () =>
      line.evaluate((element) => {
        const code = element.querySelector<HTMLElement>('.code');
        if (!code) {
          throw new Error('No code');
        }
        const rows = new Map<
          number,
          { first: string; start: number; last: string; right: number }
        >();
        const range = document.createRange();
        const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!(node instanceof Text)) {
            continue;
          }
          for (let offset = 0; offset < node.length; offset++) {
            range.setStart(node, offset);
            range.setEnd(node, offset + 1);
            const rect = range.getBoundingClientRect();
            const character = node.data[offset];
            const top = Math.round(rect.top);
            const row = rows.get(top) ?? {
              first: character,
              start: NaN,
              last: character,
              right: rect.right,
            };
            if (Number.isNaN(row.start) && character !== ' ') {
              row.start = rect.left;
            }
            rows.set(top, { ...row, last: character, right: rect.right });
          }
        }
        const style = getComputedStyle(code);
        const sample = document.createElement('span');
        sample.style.font = style.font;
        sample.style.whiteSpace = 'pre';
        sample.textContent = '0'.repeat(100);
        document.body.append(sample);
        const char = sample.getBoundingClientRect().width / 100;
        sample.remove();
        return {
          text: code.textContent ?? '',
          rows: [...rows.values()],
          marks: Array.from(
            element.querySelectorAll('.wrap-break'),
            (mark) => mark.getBoundingClientRect().left,
          ),
          width:
            code.getBoundingClientRect().width -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight) -
            parseFloat(style.textIndent),
          char,
        };
      });
    await waitFor(async () => {
      const { rows, marks } = await laidOut();
      return rows.length > 2 && marks.length === rows.length - 1;
    }, 'a mark at the end of every row but the last');
    const { text, rows, marks, width, char } = await laidOut();
    assert.strictEqual(text, dottedLine);
    assert.strictEqual(rows[0].first, ' ');
    assert.deepStrictEqual(
      rows.map((row) => [row.last, Math.abs(row.start - rows[0].start) < 1]),
      rows.map((_, index) => [index < rows.length - 1 ? '.' : ';', true]),
    );
    assert.deepStrictEqual(
      marks.map((mark, index) => Math.abs(mark - rows[index].right) < 1),
      marks.map(() => true),
    );
    assert.strictEqual(
      rows.length,
      wrappedLines(text, wrapColumns(width, char)),
    );
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });

  test('moves the marks of a wrapped line along once the browser breaks it elsewhere, as it does when it gets a few pixels narrower, though the app estimates as many characters to a row', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'hyphenated.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    const line = page
      .locator('.diff-line', { has: page.locator('.wrap-break') })
      .first();
    await line.waitFor();
    await waitFor(() => marksFollowRows(line), 'the marks to follow the rows');
    const before = await line
      .locator('.wrap-break')
      .evaluateAll((marks) =>
        marks.map((mark) => mark.getBoundingClientRect().left),
      );
    await line.evaluate((element) => {
      const code = element.querySelector<HTMLElement>('.code');
      if (code) {
        code.style.paddingRight = 'calc(2 * var(--diff-code-padding) + 9ch)';
      }
    });
    await waitFor(
      () => marksFollowRows(line),
      'the marks to follow the rows broken elsewhere',
    );
    assert.notDeepStrictEqual(
      await line
        .locator('.wrap-break')
        .evaluateAll((marks) =>
          marks.map((mark) => mark.getBoundingClientRect().left),
        ),
      before,
    );
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
  });

  test('makes each line of the diff as tall as the font size of code times the line height set, rounded to whole pixels, placing the rows and the marks of wrapped ones that far apart, keeping the file header as tall', async () => {
    const reloaded = page.waitForEvent('load');
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ ...baseSettings, fonts: { monospaceLineHeight: 2.1 } }),
    );
    await reloaded;
    await openChangedFile();
    const rows = await page
      .locator('.diff-view .diff-row')
      .evaluateAll((elements) =>
        elements.flatMap((element) => {
          const shown = element.querySelector('.file-header, .diff-line');
          return shown
            ? [
                {
                  kind: shown.classList.contains('file-header')
                    ? 'file'
                    : 'line',
                  top: element.getBoundingClientRect().top,
                  height: element.getBoundingClientRect().height,
                  shown: shown.getBoundingClientRect().height,
                },
              ]
            : [];
        }),
      );
    assert.deepStrictEqual(
      rows.map(({ kind, height, shown }) => [kind, height, shown]),
      [
        ['file', 22, 22],
        ['line', 25, 25],
        ['line', 25, 25],
        ['line', 25, 25],
        ['line', 25, 25],
      ],
    );
    assert.deepStrictEqual(
      rows.slice(1).map((row, index) => row.top - rows[index].top),
      [22, 25, 25, 25],
    );

    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    await page.getByRole('button', { name: 'Wrap Long Lines' }).click();
    const line = page
      .locator('.diff-line', { has: page.locator('.wrap-break') })
      .first();
    await line.waitFor();
    const laidOut = () =>
      line.evaluate((element) => {
        const top = element.getBoundingClientRect().top;
        return {
          height: element.getBoundingClientRect().height,
          marks: Array.from(
            element.querySelectorAll('.wrap-break'),
            (mark) => mark.getBoundingClientRect().top - top,
          ),
        };
      });
    await waitFor(async () => {
      const { height, marks } = await laidOut();
      return height > 25 && marks.length === height / 25 - 1;
    }, 'a mark at the end of every 25 pixel row but the last');
    const { height, marks } = await laidOut();
    assert.deepStrictEqual(
      marks,
      Array.from({ length: height / 25 - 1 }, (_, index) => index * 25),
    );
    await waitFor(() => wrapsSaved(), 'the choice to be saved');
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
    await waitFor(async () => {
      const after = await code.locator('.code').boundingBox();
      return after !== null && after.x < before.x - 100;
    }, 'the code to scroll sideways');
    await waitFor(async () => {
      const moved = await bar.boundingBox();
      return moved !== null && moved.x > thumb.x + 90;
    }, 'the scrollbar to move along');

    await page.keyboard.press('w');
    await page.locator('.diff-view.wrap').waitFor();
    await page.mouse.move(0, 0);
    await code.hover();
    await page.waitForTimeout(100);
    assert.strictEqual(await bar.count(), 0);
    await page.getByRole('button', { name: 'Inline' }).click();
    await waitFor(
      () => wrapsSaved() && savedSetting('diffLayout') === 'inline',
      'the last choices to be saved',
    );
  });

  test('keeps the minimap on the part in view while a Markdown preview scrolls, though the preview is one row however tall', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'notes.md' }).click();
    await page.getByRole('button', { name: strings.diff.showPreview }).click();
    await page.locator('.markdown p', { hasText: 'Paragraph 199' }).waitFor();
    await page
      .locator('.diff-view .minimap-viewport')
      .waitFor({ state: 'attached' });
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

  test('draws a Mermaid diagram in a Markdown preview as an image of its SVG, its code hidden', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'diagram.md' }).click();
    await page.getByRole('button', { name: strings.diff.showPreview }).click();
    const image = page.locator('.markdown-diagram img');
    await image.waitFor();
    const drawn = await image.evaluate(async (img: HTMLImageElement) => {
      await img.decode();
      const svg = decodeURIComponent(img.src.split(',')[1]);
      return {
        width: img.naturalWidth,
        labels: ['Fetch', 'Merge'].every((label) => svg.includes(label)),
      };
    });
    assert.ok(drawn.width > 0, JSON.stringify(drawn));
    assert.ok(drawn.labels, JSON.stringify(drawn));
    assert.strictEqual(await page.locator('.markdown pre').isHidden(), true);
  });

  test('draws the diagrams of a Markdown preview again in the color scheme the system switches to, once', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'diagram.md' }).click();
    await page.getByRole('button', { name: strings.diff.showPreview }).click();
    const image = page.locator('.markdown-diagram img');
    await image.waitFor();
    const before = await image.getAttribute('src');
    const dark = await page.evaluate(
      () => matchMedia('(prefers-color-scheme: dark)').matches,
    );
    try {
      await page.emulateMedia({ colorScheme: dark ? 'light' : 'dark' });
      await waitFor(
        async () => (await image.getAttribute('src')) !== before,
        'the diagram to be drawn again',
      );
      assert.strictEqual(await image.count(), 1);
      assert.strictEqual(await page.locator('.markdown pre').isHidden(), true);
    } finally {
      await page.emulateMedia({ colorScheme: null });
    }
  });

  test('keeps what a Markdown preview drew for the blocks an edit leaves alone, its diagrams and colored code, while the working tree changes under it', async () => {
    const file = path.join(repository.root, 'diagram.md');
    const committed = fs.readFileSync(file, 'utf8');
    const edited = (count: number) =>
      `${committed}\nEdited ${count} times.\n\n\`\`\`ts\nconst kept = 1;\n\`\`\`\n`;
    const newSide = page.locator('.markdown-pane:last-child > .markdown');
    fs.writeFileSync(file, edited(1));
    let watching: JSHandle<{ undrawn: string[]; stop: () => void }> | undefined;
    try {
      await page.locator('.row.file', { hasText: 'diagram.md' }).click();
      await page
        .getByRole('button', { name: strings.diff.showPreview })
        .click();
      await newSide.locator('.markdown-diagram img').waitFor();
      await newSide.locator('.syntax-keyword', { hasText: 'const' }).waitFor();
      watching = await page.evaluateHandle(() => {
        const undrawn: string[] = [];
        const observer = new MutationObserver(() => {
          const preview = document.querySelector(
            '.markdown-pane:last-child > .markdown',
          );
          if (!preview?.querySelector('.markdown-diagram img')) {
            undrawn.push('diagram');
          }
          if (preview?.querySelector('pre:not([hidden]) .language-mermaid')) {
            undrawn.push('diagram code');
          }
          if (!preview?.querySelector('.language-ts .syntax-keyword')) {
            undrawn.push('colored code');
          }
        });
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
        });
        return { undrawn, stop: () => observer.disconnect() };
      });
      for (const count of [2, 3, 4]) {
        fs.writeFileSync(file, edited(count));
        await newSide
          .locator('p', { hasText: `Edited ${count} times.` })
          .waitFor();
      }
      assert.deepStrictEqual(
        await watching.evaluate(({ undrawn }) => undrawn),
        [],
      );
    } finally {
      await watching?.evaluate(({ stop }) => stop());
      await repository.git('checkout', '-q', 'HEAD', '--', 'diagram.md');
    }
    await page.locator('.commit.working-tree.empty').waitFor();
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
      await page.keyboard.press('ControlOrMeta+F');
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
        const drawnAnewSinceFound = !element.isConnected;
        if (drawnAnewSinceFound) {
          return undefined;
        }
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
      await waitFor(
        async () => (await belowTop()) === 56,
        'the change to be shown at its place',
      );
      await page.getByRole('button', { name: 'Pin Entire Files' }).click();
      await page
        .getByRole('button', { name: 'Show the Entire File', pressed: false })
        .waitFor();
      await waitFor(
        async () =>
          (await page.locator('.diff-line').count()) < 20 &&
          (await belowTop()) === 73,
        'only the changes to be shown, too few to scroll',
      );
      await page.getByRole('button', { name: 'Show the Entire File' }).click();
      await page
        .getByRole('button', { name: 'Show the Entire File', pressed: true })
        .waitFor();
      await waitFor(
        async () => (await belowTop()) === 56,
        'the entire file to be shown at its change',
      );
      await waitFor(
        () => savedSetting('entireFilePinned') === false,
        'the unpinning to be saved',
      );
    } finally {
      await repository.git('checkout', '-q', 'HEAD', '--', 'long.txt');
    }
    await page.locator('.commit.working-tree.empty').waitFor();
  });

  test('shows all the changes of a file first, then its staged and unstaged halves apart', async () => {
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
        .locator('.row.group.selected', { hasText: 'All Changes' })
        .waitFor();
      await page.locator('.diff-line.added', { hasText: 'unstaged' }).waitFor();
      assert.deepStrictEqual(
        await page.locator('.diff-line.added .code').allTextContents(),
        ['staged', 'unstaged'],
      );
      await page.locator('.row.group', { hasText: /^Staged/ }).click();
      await page
        .locator('.diff-line.added', { hasText: 'unstaged' })
        .waitFor({ state: 'detached' });
      await page
        .locator('.diff-line.added .code', { hasText: /^staged$/ })
        .waitFor();
      assert.deepStrictEqual(
        await page.locator('.diff-line.added .code').allTextContents(),
        ['staged'],
      );
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

suite('App with lists longer than their columns', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('long-lists');
    const profile = path.join(folder, 'profile');
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first', {
      ...Object.fromEntries(
        Array.from({ length: 60 }, (_, index) => [
          `src/file${index}.txt`,
          `${index}\n`,
        ]),
      ),
      'long.txt': `${longLines.join('\n')}\n`,
    });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({ tabs: [repository.root], activeTab: repository.root }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify(baseSettings),
    );
    app = await _electron.launch({
      args: [appFolder, `--user-data-dir=${profile}`],
      cwd: appFolder,
    });
    page = await app.firstWindow();
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'file0.txt' }).waitFor();
    await page
      .locator('.column')
      .nth(1)
      .locator('.virtual-rows')
      .evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    await page.locator('.diff-line', { hasText: firstLongLine }).waitFor();
  });

  afterAll(async () => {
    await app?.close();
    removeFolder(folder);
  });

  test('scrolls on the wheel over the folders pinned atop the files and the file header stuck atop the diff, which stays in place sideways, showing the scrollbar of the files over them', async () => {
    const files = page.locator('.column').nth(1).locator('.virtual-rows');
    const pinned = page.locator('.pinned-rows');
    await scrollsOnWheelOver(page, files, pinned);
    await pinned.hover();
    assert.strictEqual(
      await page.locator('.overlay-scrollbar.vertical.shown').count(),
      1,
    );

    const diff = page.locator('.diff-view .virtual-rows');
    const stuck = page.locator('.diff-stuck-header');
    await scrollsOnWheelOver(page, diff, stuck);
    await diff.evaluate((element) => {
      element.scrollLeft = 300;
    });
    await waitFor(
      async () => (await diff.evaluate((element) => element.scrollLeft)) > 0,
      'the diff to scroll sideways',
    );
    const header = await stuck.locator('.file-header').boundingBox();
    const view = await page.locator('.diff-view').boundingBox();
    assert.ok(header && view, 'the header or the diff has no box');
    assert.strictEqual(header.x, view.x);
  });

  test('keeps the scrollbar the pointer rests on where it is while another list scrolls, as the diff on the keys', async () => {
    const bar = page.locator('.overlay-scrollbar.vertical');
    await page.locator('.column').nth(1).locator('.virtual-rows').hover();
    await bar.hover();
    const shown = await bar.boundingBox();
    const diff = page.locator('.diff-view .virtual-rows');
    const top = await diff.evaluate((element) => element.scrollTop);
    await diff.focus();
    await page.keyboard.press('PageDown');
    await waitFor(
      async () => (await diff.evaluate((element) => element.scrollTop)) > top,
      'the diff to scroll',
    );
    await page.evaluate(
      () =>
        new Promise((drawn) =>
          requestAnimationFrame(() => requestAnimationFrame(drawn)),
        ),
    );
    assert.ok(await bar.evaluate((element) => element.matches('.shown')));
    assert.deepStrictEqual(await bar.boundingBox(), shown);
  });
});

suite('App with several tabs', () => {
  test('moves a tab dragged past the middle of the next one while it is still dragged, keeping it under the pointer, opening it, and keeps that order once dropped', async () => {
    const folder = tempFolder('dragging-tabs');
    const profile = path.join(folder, 'profile');
    const roots: string[] = [];
    for (const name of ['first', 'second', 'third']) {
      const repository = await tempRepository(path.join(folder, name));
      await repository.commit(name);
      roots.push(repository.root);
    }
    fs.mkdirSync(profile, { recursive: true });
    const state = path.join(profile, 'state.json');
    fs.writeFileSync(
      state,
      JSON.stringify({ tabs: roots, activeTab: roots[1] }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ autoFetch: false }),
    );
    const app = await _electron.launch({
      args: [appFolder, `--user-data-dir=${profile}`],
      cwd: appFolder,
    });
    try {
      const page = await app.firstWindow();
      await page.locator('.commit', { hasText: 'second' }).waitFor();
      const names = () =>
        page.locator('.tabs .tab .tab-name').allTextContents();
      const dragged = page.locator('.tabs .tab', { hasText: 'first' });
      const start = await dragged.boundingBox();
      const next = await page
        .locator('.tabs .tab', { hasText: 'second' })
        .boundingBox();
      assert.ok(start && next);
      const pitch = next.x - start.x;
      const grab = 20;
      const y = start.y + start.height / 2;
      await page.mouse.move(start.x + grab, y);
      await page.mouse.down();
      await page.mouse.move(start.x + grab + pitch / 2 - 8, y, { steps: 8 });
      assert.deepStrictEqual(await names(), ['first', 'second', 'third']);
      const pointer = start.x + grab + pitch / 2 + 8;
      await page.mouse.move(pointer, y, { steps: 4 });
      assert.deepStrictEqual(await names(), ['second', 'first', 'third']);
      const held = await dragged.boundingBox();
      assert.ok(held);
      assert.ok(Math.abs(held.x - (pointer - grab)) < 1, String(held.x));
      await page.locator('.commit', { hasText: 'first' }).waitFor();
      await page.mouse.up();
      assert.deepStrictEqual(await names(), ['second', 'first', 'third']);
      await waitFor(() => {
        const saved: unknown = JSON.parse(fs.readFileSync(state, 'utf8'));
        return (
          JSON.stringify(Reflect.get(Object(saved), 'tabs')) ===
          JSON.stringify([roots[1], roots[0], roots[2]])
        );
      }, 'the order to be saved');
      assert.match((await dragged.getAttribute('class')) ?? '', /\bactive\b/);
    } finally {
      await closeOrKill(app);
      removeFolder(folder);
    }
  });
});

suite('App started from a terminal', () => {
  test('opens the repository of the folder it is started with, then that of a folder another start hands it, showing each rather than the tab left active', async () => {
    const folder = tempFolder('command-line');
    const profile = path.join(folder, 'profile');
    const roots: string[] = [];
    for (const name of ['first', 'second', 'third']) {
      const repository = await tempRepository(path.join(folder, name));
      await repository.commit(name);
      roots.push(repository.root);
    }
    const [first, second, third] = roots;
    const inner = path.join(second, 'inner');
    fs.mkdirSync(inner);
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({ tabs: [first], activeTab: first }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ autoFetch: false }),
    );
    const args = (asked: string) => [
      appFolder,
      `--user-data-dir=${profile}`,
      '--',
      asked,
    ];
    const app = await _electron.launch({ args: args(inner), cwd: appFolder });
    try {
      const page = await app.firstWindow();
      const names = () =>
        page.locator('.tabs .tab .tab-name').allTextContents();
      await page.locator('.commit', { hasText: 'second' }).waitFor();
      assert.deepStrictEqual(await names(), ['first', 'second']);
      const electron = await app.evaluate(() => process.execPath);
      const sandbox = process.platform === 'linux' ? ['--no-sandbox'] : [];
      const handedOff = spawnSync(electron, [...sandbox, ...args(third)], {
        cwd: appFolder,
        timeout: 30_000,
      });
      assert.strictEqual(handedOff.status, 0, String(handedOff.stderr));
      await page.locator('.commit', { hasText: 'third' }).waitFor();
      assert.deepStrictEqual(await names(), ['first', 'second', 'third']);
      assert.match(
        (await page
          .locator('.tabs .tab', { hasText: 'third' })
          .getAttribute('class')) ?? '',
        /\bactive\b/,
      );
    } finally {
      await closeOrKill(app);
      removeFolder(folder);
    }
  });
});

suite('App quitting', () => {
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
      await within(app.close(), 'the app to close');
      const counted = fs.readFileSync(alive, 'utf8');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      assert.strictEqual(fs.readFileSync(alive, 'utf8'), counted);
    } finally {
      fs.writeFileSync(stop, '');
      await closeOrKill(app);
      removeFolder(folder);
    }
  });

  test('stops a round of background fetches, starting no other fetch and not saying the one it stopped failed', async () => {
    const folder = tempFolder('quitting-round');
    const profile = path.join(folder, 'profile');
    const stop = path.join(folder, 'stop').replaceAll('\\', '/');
    const alive = (name: string) =>
      path.join(folder, `${name}-alive`).replaceAll('\\', '/');
    const roots: string[] = [];
    for (const name of ['first', 'second']) {
      const repository = await tempRepository(path.join(folder, name));
      await repository.commit(name);
      await repository.git(
        'remote',
        'add',
        'origin',
        'ssh://stalled.invalid/x',
      );
      await repository.git(
        'config',
        'core.sshCommand',
        `while [ ! -e '${stop}' ]; do echo > '${alive(name)}'; sleep 0.2; done; false`,
      );
      roots.push(repository.root);
    }
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({ tabs: roots, activeTab: roots[0] }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ autoFetch: false }),
    );
    const app = await _electron.launch({
      args: [appFolder, `--user-data-dir=${profile}`],
      cwd: appFolder,
    });
    try {
      const page = await app.firstWindow();
      await page.locator('.commit', { hasText: 'first' }).waitFor();
      await page
        .getByTitle(
          strings.navigation.fetchEvery(defaultSettings().autoFetchMinutes),
        )
        .click();
      await waitFor(() => fs.existsSync(alive('first')), 'git to fetch');
      await within(app.close(), 'the app to close');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      assert.ok(!fs.existsSync(alive('second')));
      assert.doesNotMatch(
        fs.readFileSync(path.join(profile, 'logs', 'Fastforward.log'), 'utf8'),
        new RegExp(strings.log.fetchFailed),
      );
    } finally {
      fs.writeFileSync(stop, '');
      await closeOrKill(app);
      removeFolder(folder);
    }
  });

  test('starts again while it waits for a checkout to end as it quits', async () => {
    const folder = tempFolder('quitting-checkout');
    const profile = path.join(folder, 'profile');
    const hooks = path.join(folder, 'hooks');
    const alive = path.join(folder, 'alive').replaceAll('\\', '/');
    const stop = path.join(folder, 'stop').replaceAll('\\', '/');
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first');
    await repository.commit('second');
    await repository.git('branch', 'other', 'HEAD~1');
    fs.mkdirSync(hooks);
    fs.writeFileSync(
      path.join(hooks, 'post-checkout'),
      `#!/bin/sh\nwhile [ ! -e '${stop}' ]; do echo > '${alive}'; sleep 0.2; done\n`,
      { mode: 0o755 },
    );
    await repository.git('config', 'core.hooksPath', hooks);
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({ tabs: [repository.root], activeTab: repository.root }),
    );
    const launch = () =>
      _electron.launch({
        args: [appFolder, `--user-data-dir=${profile}`],
        cwd: appFolder,
      });
    const app = await launch();
    let again: ElectronApplication | undefined;
    try {
      const page = await app.firstWindow();
      await page
        .locator('.commit .badge.branch', { hasText: 'other' })
        .click({ button: 'right' });
      await page
        .locator('.context-menu .menu-item', {
          hasText: strings.commits.checkout,
        })
        .click();
      await waitFor(() => fs.existsSync(alive), 'the checkout to run');
      assert.ok(holdsStartLock(profile));
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].close(),
      );
      await waitFor(
        () => !holdsStartLock(profile),
        'the app to let another start',
      );
      again = await launch();
      const shown = await again.firstWindow();
      await shown.locator('.commit', { hasText: 'second' }).waitFor();
    } finally {
      fs.writeFileSync(stop, '');
      if (again) {
        await closeOrKill(again);
      }
      await closeOrKill(app);
      removeFolder(folder);
    }
  });
});

suite('App whose page is gone', () => {
  test('loads the page again once its process is gone, such as killed or out of memory, saying so in the log, as the window stayed blank', async () => {
    const folder = tempFolder('page-gone');
    const profile = path.join(folder, 'profile');
    const log = path.join(profile, 'logs', 'Fastforward.log');
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({ tabs: [repository.root], activeTab: repository.root }),
    );
    const app = await _electron.launch({
      args: [appFolder, `--user-data-dir=${profile}`],
      cwd: appFolder,
    });
    try {
      const page = await app.firstWindow();
      await page.locator('.commit', { hasText: 'first' }).waitFor();
      const gone = await within(
        app.evaluate(({ BrowserWindow }) => {
          const contents = BrowserWindow.getAllWindows()[0].webContents;
          const went = new Promise<{ reason: string; exitCode: number }>(
            (resolve) =>
              contents.once('render-process-gone', (_event, details) =>
                resolve(details),
              ),
          );
          process.kill(contents.getOSProcessId(), 'SIGKILL');
          return went;
        }),
        'the page to go',
      );
      await waitFor(
        () =>
          fs
            .readFileSync(log, 'utf8')
            .includes(strings.log.pageGone(gone.reason, gone.exitCode)),
        'the page going to be logged',
      );
      const windowShowsTheHistoryAgain = () =>
        app.evaluate(async ({ BrowserWindow }) => {
          const contents = BrowserWindow.getAllWindows()[0].webContents;
          if (contents.isCrashed() || contents.isLoading()) {
            return false;
          }
          const shown: unknown = await Promise.race([
            contents.executeJavaScript(
              "[...document.querySelectorAll('.commit')].some((row) => row.textContent.includes('first'))",
            ),
            new Promise((resolve) => setTimeout(() => resolve(false), 1000)),
          ]);
          return shown === true;
        });
      await waitFor(
        windowShowsTheHistoryAgain,
        'the page to show the history again',
      );
    } finally {
      await closeOrKill(app);
      removeFolder(folder);
    }
  });
});

const windowsNotedIn = (file: string) =>
  [
    "const { app } = require('electron');",
    "const { appendFileSync } = require('node:fs');",
    `const note = (what) => appendFileSync(${JSON.stringify(file)}, what + '\\n');`,
    "app.on('browser-window-created', (_event, window) => {",
    "  note(window.isVisible() ? 'shown' : 'created');",
    "  window.on('show', () => note('shown'));",
    '});',
  ].join('\n');

const toolsGtkRunsToLoadIcons = ['bwrap'];

function linkFromPath(names: readonly string[], folder: string): void {
  const folders = (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean);
  for (const name of names) {
    const found = folders
      .map((inside) => path.join(inside, name))
      .find((file) => fs.existsSync(file));
    if (found !== undefined) {
      fs.symlinkSync(found, path.join(folder, name));
    }
  }
}

suite('App without git', () => {
  test('says it needs git, showing no window, whether its alert keeps it running or it quits by itself, with git kept off its PATH but the tools GTK runs to load the icon of the alert left on it, as Ubuntu 26.04 aborts without them', async () => {
    const folder = tempFolder('no-git');
    const profile = path.join(folder, 'profile');
    const log = path.join(profile, 'logs', 'Fastforward.log');
    const windows = path.join(folder, 'windows.txt');
    const noting = path.join(folder, 'noteWindows.cjs');
    fs.writeFileSync(noting, windowsNotedIn(windows));
    linkFromPath(toolsGtkRunsToLoadIcons, folder);
    const app = await _electron.launch({
      args: ['-r', noting, appFolder, `--user-data-dir=${profile}`],
      cwd: appFolder,
      env: {
        ...process.env,
        PATH: folder,
        Path: folder,
        SHELL: path.join(folder, 'no-shell'),
        ELECTRON_ENABLE_STACK_DUMPING: 'true',
      },
    });
    const child = app.process();
    const exited = once(child, 'exit');
    let printed = '';
    for (const output of [child.stdout, child.stderr]) {
      output?.on('data', (chunk: Buffer) => {
        printed += chunk.toString();
      });
    }
    try {
      await waitFor(() => {
        try {
          return fs.readFileSync(log, 'utf8').includes('Install git');
        } catch {
          return false;
        }
      }, 'the missing git to be logged');
      const gitAlertHoldsTheMainProcess = process.platform === 'darwin';
      if (!gitAlertHoldsTheMainProcess) {
        await Promise.race([
          app.firstWindow().then(async (page) => {
            await page.waitForLoadState('load');
            await new Promise((resolve) => setTimeout(resolve, 500));
          }),
          exited,
        ]).catch(async (error: unknown) => {
          await within(exited, 'the app to quit').catch(() => {
            throw error;
          });
        });
      }
      assert.strictEqual(fs.readFileSync(windows, 'utf8'), 'created\n');
      if (child.exitCode !== null || child.signalCode !== null) {
        assert.deepStrictEqual(
          [child.exitCode, child.signalCode],
          [0, null],
          `The app quit with ${String(child.exitCode ?? child.signalCode)}, printing:\n${printed}`,
        );
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await exited;
      }
      await app.close();
      removeFolder(folder);
    }
  });
});
