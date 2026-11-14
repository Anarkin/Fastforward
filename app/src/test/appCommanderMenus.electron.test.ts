import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../lib/shared/strings';
import { waitFor } from './fixtures';
import { clippedCorner, waitForFocus } from './appFixtures';
import {
  opened,
  app,
  page,
  threeLines,
  right,
  rowNames,
  markedSorted,
  markedNames,
  shownState,
  closeViewer,
  firstViewerRow,
  selected,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';

const marks = () =>
  page.evaluate(() => {
    const box = document.querySelector<HTMLElement>('.shortcuts-pane');
    const heading = box?.querySelector<HTMLElement>('.shortcuts-heading');
    if (!box || !heading) {
      return { showing: [], marked: [] };
    }
    const { top, bottom } = box.getBoundingClientRect();
    const below = top + heading.getBoundingClientRect().height;
    const showing = [...box.querySelectorAll<HTMLElement>('.shortcuts-group')]
      .filter((group) =>
        [...group.querySelectorAll('.shortcut-row')].some((row) => {
          const place = row.getBoundingClientRect();
          return place.bottom > below + 1 && place.top < bottom - 1;
        }),
      )
      .map(
        (group) => group.querySelector('.shortcuts-heading')?.textContent ?? '',
      );
    const marked = [
      ...document.querySelectorAll('.shortcuts-group-link.in-view'),
    ].map((link) => link.textContent ?? '');
    return { showing, marked };
  });

const rowTexts = () =>
  page.locator('.viewer-rows .viewer-row').allTextContents();

const firstKeywords = () =>
  page
    .locator('.viewer-rows .viewer-row')
    .evaluateAll((rows) =>
      rows.map((row) => row.querySelector('.syntax-keyword')?.textContent),
    );

suite('App commander', () => {
  sharedCommanderApp();

  test('compares the two files marked on a side with Shift+F3 in a git tab of their own, showing their diff, with every language in its menu on L, as it shows one file', async () => {
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
        'Diff,Searching',
      'the shortcuts of the diff',
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
    const language = page.locator('.compare-view .language-button');
    assert.strictEqual(
      await language.locator('.menu-button-label').textContent(),
      'Plain Text',
    );
    await page.keyboard.press('l');
    await language.locator('.menu-filter').waitFor();
    await page.keyboard.press('Escape');
    await language.locator('.menu').waitFor({ state: 'detached' });
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

  test('opens two files compared at their first change, where J lands from the top, though the rows the diff draws as it opens turn out shorter than guessed', async () => {
    const lines = Array.from({ length: 200 }, (_, index) => `line${index}`);
    fs.writeFileSync(
      path.join(opened, 'jump-old.txt'),
      `${lines.join('\n')}\n`,
    );
    fs.writeFileSync(
      path.join(opened, 'jump-new.txt'),
      `${lines.map((line, index) => (index === 150 ? 'changed far down' : line)).join('\n')}\n`,
    );
    await select('jump-old');
    await page.keyboard.press('Space');
    await select('jump-new');
    await page.keyboard.press('Space');
    await waitFor(
      async () => (await markedSorted()) === 'jump-new,jump-old',
      'both files to be marked',
    );
    await page.keyboard.press('Shift+F3');
    const change = page.locator('.compare-view .split-side', {
      hasText: 'line150',
    });
    await change.waitFor();
    const row = await change.evaluate((line) =>
      parseFloat(getComputedStyle(line).lineHeight),
    );
    const belowTop = () =>
      change.evaluate((line) => {
        const list = line.closest('.virtual-rows');
        if (!list) {
          throw new Error('No diff list');
        }
        return Math.round(
          line.getBoundingClientRect().top - list.getBoundingClientRect().top,
        );
      });
    await waitFor(
      async () => (await belowTop()) === Math.round(3 * row),
      'the first change to be shown 3 rows below the top, as J shows it',
    );

    await page.keyboard.press('Escape');
    await page.locator('.tabs .tab.active', { hasText: 'Commander' }).waitFor();
    for (const name of ['jump-old.txt', 'jump-new.txt']) {
      fs.rmSync(path.join(opened, name));
    }
    await waitFor(async () => {
      const names = await rowNames();
      return !names.includes('jump-old.txt') && !names.includes('jump-new.txt');
    }, 'the files to be gone from the list');
  });

  test('lists the shortcuts of the commander beside the tools, scrolling them only down in a small window, marking every group with a shortcut in view as it scrolls, brings a group clicked or stepped to to the top, and goes on to the next tool once the pane can scroll no further, each shortcut one key cap a line high', async () => {
    const size = await app.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows().toSorted(
        (a, b) => a.id - b.id,
      );
      const before = window?.getSize();
      window?.setSize(900, 600);
      return before;
    });
    await page.keyboard.press('F1');
    const pane = page.locator('.shortcuts-pane');
    await pane.locator('.shortcuts-heading', { hasText: 'Archives' }).waitFor();
    const markedAsShown = async (first: string) => {
      const { showing, marked } = await marks();
      return (
        marked[0] === first &&
        marked.join() === showing.join() &&
        marked.length > 0
      );
    };
    const laidOut = await page.evaluate(() => {
      const scrollers = [
        ...document.querySelectorAll<HTMLElement>(
          '.shortcuts-pane, .shortcuts-tree',
        ),
      ];
      const heights = [
        ...document.querySelectorAll<HTMLElement>(
          '.shortcuts-pane .shortcut-combo',
        ),
      ].map((cap) => cap.getBoundingClientRect().height);
      const box = document.querySelector<HTMLElement>('.shortcuts-pane');
      return {
        sideways: scrollers.filter(
          (scroller) => scroller.scrollWidth > scroller.clientWidth,
        ).length,
        down: box !== null && box.scrollHeight > box.clientHeight,
        heights: [Math.min(...heights), Math.max(...heights)],
        mice: document.querySelectorAll('.shortcuts-pane .mouse-icon').length,
      };
    });
    const atFirst = await marks();
    await pane.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await waitFor(
      async () => (await marks()).marked.at(-1) === 'Archives',
      'the last group to be marked at the end',
    );
    const atEnd = await marks();
    await page
      .locator('.shortcuts-group-link', { hasText: 'Filtering' })
      .click();
    await waitFor(
      () => markedAsShown('Filtering'),
      'the group clicked to come to the top',
    );
    const atFiltering = await pane.evaluate((element) => {
      const section = [
        ...element.querySelectorAll<HTMLElement>('[data-group]'),
      ].find((each) => each.dataset.group === 'commander/Filtering');
      return Math.abs(element.scrollTop - (section?.offsetTop ?? -1)) < 1;
    });
    await page.keyboard.press('ArrowUp');
    await waitFor(
      () => markedAsShown('Listing'),
      'the group before to come to the top',
    );
    await pane.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await waitFor(
      async () => (await marks()).marked.at(-1) === 'Archives',
      'the end again',
    );
    await page.keyboard.press('ArrowDown');
    await page.locator('.shortcuts-tool.open', { hasText: 'Viewer' }).waitFor();
    await page.locator('.shortcuts-tool', { hasText: 'Terminal' }).click();
    await waitFor(
      async () =>
        (await marks()).marked.join() === 'Clipboard,Kept from the shell',
      'both groups of the terminal to be marked, as both show',
    );
    const focused = await page.evaluate(() =>
      document.activeElement?.matches('.shortcuts-filter input'),
    );
    await page.keyboard.press('F1');
    await pane.waitFor({ state: 'detached' });
    await app.evaluate(
      ({ BrowserWindow }, [width, height]) => {
        BrowserWindow.getAllWindows()
          .toSorted((a, b) => a.id - b.id)[0]
          ?.setSize(width, height);
      },
      size ?? [1280, 800],
    );
    assert.strictEqual(laidOut.sideways, 0, 'Something scrolls sideways');
    assert.ok(laidOut.down, 'The shortcuts fit without scrolling down');
    const [lowest = 0, highest = 0] = laidOut.heights;
    assert.ok(
      highest - lowest < 2,
      `The key caps are ${lowest} to ${highest} high`,
    );
    assert.ok(laidOut.mice > 0);
    assert.deepStrictEqual(atFirst.marked, atFirst.showing);
    assert.ok(atFirst.marked.length > 1, atFirst.marked.join());
    assert.strictEqual(atFirst.marked[0], 'Moving around');
    assert.deepStrictEqual(atEnd.marked, atEnd.showing);
    assert.ok(atFiltering, 'The group clicked is not at the top of the pane');
    assert.ok(focused, 'The filter lost the keyboard');
  });

  test('reads a file in the encoding its byte order mark names, and in the one chosen from the menu E opens, found by what is typed, staying where it was', async () => {
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
    await waitFor(
      async () => (await rowTexts())[0] === 'ligne 0 é',
      'the text read as UTF-16',
    );
    assert.strictEqual(
      await page.locator('.viewer-encoding .menu-button-label').textContent(),
      'UTF-16 LE',
    );

    await page.keyboard.press('End');
    await waitFor(
      async () => (await rowTexts()).at(-1) === 'ligne 299 é',
      'the end of the text',
    );
    await page.keyboard.press('e');
    const encodingItems = page.locator('.viewer-encoding .menu-item');
    assert.strictEqual(
      await encodingItems
        .and(page.locator('[aria-checked="true"]'))
        .textContent(),
      '✓Auto: UTF-16 LE',
    );
    await encodingItems.filter({ hasText: /^Bytes$/ }).click();
    await waitFor(
      async () => (await rowTexts()).join('').includes('2.9.9. .é.'),
      'the end of the file as bytes',
    );
    await page.keyboard.press('e');
    await page.locator('.viewer-encoding .menu-filter').waitFor();
    await page.keyboard.type('latin2');
    await page.keyboard.press('Enter');
    await waitFor(
      async () =>
        (await page
          .locator('.viewer-encoding .menu-button-label')
          .textContent()) === '8859-2',
      'the encoding found by its other name chosen',
    );
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'wide.txt'));
    await waitFor(
      async () => !(await rowNames()).includes('wide.txt'),
      'the file to be gone from the list',
    );
  });

  test('keeps the scrollbar of the language menu below its filter, and at the last language runs it to the bottom of the menu, rounding its corner as the menu rounds its own', async () => {
    fs.writeFileSync(path.join(opened, 'menu.ts'), 'const a = 1;');
    await select('menu');
    await page.keyboard.press('F3');
    await page.locator('.viewer-rows .viewer-row').first().waitFor();
    await page.keyboard.press('l');
    const menu = page.locator('.viewer .language-button .menu');
    await menu.waitFor();
    const thumb = page.locator('.overlay-scrollbar.vertical.shown');
    const boxes = async () => {
      await thumb.waitFor();
      const [menuBox, filterBox, thumbBox] = await Promise.all([
        menu.boundingBox(),
        page.locator('.viewer .language-button .menu-filter').boundingBox(),
        thumb.boundingBox(),
      ]);
      assert.ok(menuBox && filterBox && thumbBox);
      return { menuBox, filterBox, thumbBox };
    };

    await menu.hover();
    const top = await boxes();
    const subpixel = 0.5;
    assert.ok(
      top.thumbBox.y >= top.filterBox.y + top.filterBox.height - subpixel,
      JSON.stringify(top),
    );

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await waitFor(
      async () =>
        (await boxes()).thumbBox.y > top.thumbBox.y + top.thumbBox.height,
      'the thumb at the end of its track',
    );
    const end = await boxes();
    const [thumbClip, menuRadius] = await Promise.all([
      thumb.evaluate((element) => getComputedStyle(element).clipPath),
      menu.evaluate(
        (element) => getComputedStyle(element).borderBottomRightRadius,
      ),
    ]);
    assert.ok(
      Math.abs(
        end.thumbBox.y +
          end.thumbBox.height -
          (end.menuBox.y + end.menuBox.height),
      ) < subpixel &&
        Math.abs(
          end.thumbBox.x +
            end.thumbBox.width -
            (end.menuBox.x + end.menuBox.width),
        ) < subpixel,
      JSON.stringify(end),
    );
    assert.strictEqual(
      clippedCorner(thumbClip),
      parseFloat(menuRadius),
      thumbClip,
    );

    await page.keyboard.press('Home');
    await waitFor(
      async () => (await boxes()).thumbBox.y === top.thumbBox.y,
      'the thumb back at the start of its track',
    );
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'menu.ts'));
    await waitFor(
      async () => !(await rowNames()).includes('menu.ts'),
      'menu.ts to be gone from the list',
    );
  });

  test('scrolls the language menu to where its track is pressed, the thumb centered there and following the pointer while held, without choosing the language under it or selecting text', async () => {
    fs.writeFileSync(path.join(opened, 'track.ts'), 'const a = 1;');
    await select('track');
    await page.keyboard.press('F3');
    await page.locator('.viewer-rows .viewer-row').first().waitFor();
    const label = page.locator('.viewer .language-button .menu-button-label');
    const language = await label.textContent();
    await page.keyboard.press('l');
    const menu = page.locator('.viewer .language-button .menu');
    await menu.waitFor();
    const thumb = page.locator('.overlay-scrollbar.vertical.shown');
    await menu.hover();
    await thumb.waitFor();
    const [menuBox, top] = await Promise.all([
      menu.boundingBox(),
      thumb.boundingBox(),
    ]);
    assert.ok(menuBox && top);
    const x = top.x + top.width / 2;
    const trackTop = top.y;
    const trackBottom = menuBox.y + menuBox.height - 6;
    const centered = async (y: number) => {
      const box = await thumb.boundingBox();
      return box !== null && Math.abs(box.y + box.height / 2 - y) <= 1;
    };

    const middle = (trackTop + trackBottom) / 2;
    await page.mouse.move(x, middle);
    await page.mouse.down();
    await waitFor(() => centered(middle), 'the thumb centered where pressed');
    const lower = trackTop + ((trackBottom - trackTop) * 3) / 4;
    await page.mouse.move(x, lower, { steps: 5 });
    await waitFor(() => centered(lower), 'the thumb following the pointer');
    await page.mouse.up();
    await page.mouse.click(x, trackTop + 2);
    await waitFor(
      async () => (await thumb.boundingBox())?.y === top.y,
      'the thumb back at the start of its track',
    );

    assert.strictEqual(await menu.count(), 1);
    assert.strictEqual(
      await page.evaluate(() => getSelection()?.toString() ?? ''),
      '',
    );
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
    assert.strictEqual(await label.textContent(), language);
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'track.ts'));
    await waitFor(
      async () => !(await rowNames()).includes('track.ts'),
      'track.ts to be gone from the list',
    );
  });

  test('colors the code of a file in any encoding, from the first line of one with a byte order mark', async () => {
    try {
      const code = ['const a = 1;', "let b = 'é';"].join(
        String.fromCharCode(10),
      );
      const files = {
        'wide.ts': Buffer.concat([
          Buffer.from([0xff, 0xfe]),
          Buffer.from(code, 'utf16le'),
        ]),
        'marked.ts': Buffer.concat([
          Buffer.from([0xef, 0xbb, 0xbf]),
          Buffer.from(code),
        ]),
      };
      for (const [name, bytes] of Object.entries(files)) {
        fs.writeFileSync(path.join(opened, name), bytes);
        await select(name.replace('.ts', ''));
        await page.keyboard.press('F3');
        await waitFor(
          async () => (await firstKeywords()).join(' ') === 'const let',
          `the keywords of both lines of ${name} colored`,
        ).catch(async (error: unknown) => {
          throw new Error(`${String(error)}: ${await shownState()}`);
        });
        await page.keyboard.press('Escape');
        await page.locator('.viewer').waitFor({ state: 'detached' });
        fs.rmSync(path.join(opened, name));
        await waitFor(
          async () => !(await rowNames()).includes(name),
          `${name} to be gone from the list`,
        );
      }
    } finally {
      await closeViewer();
    }
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
          (await page
            .locator('.viewer-encoding .menu-button-label')
            .textContent()) ?? '',
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

  test.skipIf(process.platform !== 'win32')(
    'shows the menu of the app for a file right-clicked, selecting it, for the folder shown on .., and for the file selected on Shift+F10, the menu of Windows from its last item or straight away on Shift and a right click, with the commands Explorer shows, and goes on once that menu is closed',
    async () => {
      const file = path.join(opened, 'menu.txt');
      fs.writeFileSync(file, 'menu\n');
      await waitFor(
        async () => (await rowNames()).includes('menu.txt'),
        'the file to be listed',
      );
      const { default: koffi } = await import('koffi');
      const user32 = koffi.load('user32.dll');
      const findWindow = user32.func(
        'void *FindWindowExW(void *parent, void *after, const char16_t *className, const char16_t *title)',
      );
      const visible = user32.func('bool IsWindowVisible(void *window)');
      const sendMessage = user32.func(
        'intptr_t SendMessageW(void *window, uint32_t message, uintptr_t w, intptr_t l)',
      );
      const postMessage = user32.func(
        'bool PostMessageW(void *window, uint32_t message, uintptr_t w, intptr_t l)',
      );
      const itemCount = user32.func('int GetMenuItemCount(intptr_t menu)');
      const shown = (): unknown => {
        for (
          let menu: unknown = findWindow(null, null, '#32768', null);
          menu !== null;
          menu = findWindow(null, menu, '#32768', null)
        ) {
          if (visible(menu) === true) {
            return menu;
          }
        }
        return null;
      };
      const appMenu = page.locator('.context-menu');
      const appMenuItems = () =>
        appMenu.locator('.menu-item').allTextContents();
      const closeWindowsMenu = async (closing: string) => {
        postMessage(shown(), 0x100, 0x1b, 0);
        await waitFor(() => shown() === null, closing);
      };
      const menuRow = right().locator('.commander-row', { hasText: 'menutxt' });
      try {
        await menuRow.click({ button: 'right' });
        await appMenu.waitFor();
        assert.match(await selected(), /menu/);
        assert.deepStrictEqual(await appMenuItems(), [
          strings.commander.openWithSevenZip,
          strings.commander.copyPath,
          strings.commander.copyName,
          strings.commander.showMoreOptions,
        ]);
        const choosing = appMenu
          .getByRole('menuitem', {
            name: strings.commander.showMoreOptions,
            exact: true,
          })
          .click();
        await waitFor(() => shown() !== null, 'the menu of Windows');
        assert.ok(Number(itemCount(sendMessage(shown(), 0x1e1, 0, 0))) > 3);
        await closeWindowsMenu('the menu to close');
        await choosing;
        await appMenu.waitFor({ state: 'detached' });

        await right()
          .locator('.commander-row')
          .first()
          .click({ button: 'right' });
        await appMenu.waitFor();
        assert.strictEqual(
          (await appMenuItems()).at(0),
          strings.commander.newTerminalHere,
        );
        await page.keyboard.press('Escape');
        await appMenu.waitFor({ state: 'detached' });

        const clicking = menuRow.click({
          button: 'right',
          modifiers: ['Shift'],
        });
        await waitFor(
          () => shown() !== null,
          'the menu of Windows on Shift and a right click',
        );
        await closeWindowsMenu('the menu to close again');
        await clicking;
        assert.strictEqual(await appMenu.count(), 0);

        await page.keyboard.press('Shift+F10');
        await appMenu.waitFor();
        assert.deepStrictEqual(await appMenuItems(), [
          strings.commander.openWithSevenZip,
          strings.commander.copyPath,
          strings.commander.copyName,
          strings.commander.showMoreOptions,
        ]);
        await page.keyboard.press('Escape');
        await appMenu.waitFor({ state: 'detached' });
        assert.strictEqual(await app.evaluate(() => 'answering'), 'answering');
      } finally {
        const open = shown();
        if (open !== null) {
          postMessage(open, 0x10, 0, 0);
        }
        fs.rmSync(file);
      }
    },
  );
});
