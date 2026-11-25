import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import { viewerRows } from './cellsSeen';
import { wheelsByWholeRows } from './scrollProbes';
import { barOf, barParts } from './scrollbarsShown';
import { menuRows } from '../../lib/page/menuControls';
import {
  opened,
  app,
  page,
  right,
  rowNames,
  selected,
  select,
  sharedCommanderApp,
  textOnClipboard,
} from './commanderAppFixtures';
import { rounded } from './rounding';

const focusIn = (selector: string) =>
  page.evaluate(
    (wanted) => Boolean(document.activeElement?.closest(wanted)),
    selector,
  );

const choose = async (menu: string, item: string) => {
  await page.locator(menu).locator('.menu-button-trigger').click();
  await page.locator(menu).locator(item).first().click();
};

const languageMenu = '.viewer .language-button .menu';

const thumbHeld = () =>
  page.evaluate(() => {
    const thumb = document.querySelector<HTMLElement>(
      '.scrollbar-cover.vertical.shown .scrollbar-thumb',
    );
    if (thumb === null || thumb.hidden) {
      return undefined;
    }
    const { top, height } = thumb.getBoundingClientRect();
    return { top, height };
  });

const closeLanguageMenu = async (file: string) => {
  if (await page.locator(languageMenu).isVisible()) {
    await page.keyboard.press('Escape');
    await page.locator(languageMenu).waitFor({ state: 'detached' });
  }
  if (await page.locator('.viewer').isVisible()) {
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
  }
  fs.rmSync(path.join(opened, file));
  await waitFor(
    async () => !(await rowNames()).includes(file),
    `${file} to be gone from the list`,
  );
};

suite('App commander', () => {
  sharedCommanderApp();

  test('opens the menu of the folder each part of the path of a side is on with a right click on the part, the one the commander shows its items in, over the scrollbars, copying its whole path', async () => {
    const parts = right().locator('.commander-path .path-part');
    const pathMenu = page.locator('.path-menu');
    const offers = (name: string) =>
      pathMenu.getByRole('menuitem', { name }).count();
    await parts.first().click({ button: 'right' });
    await pathMenu.waitFor();
    assert.strictEqual(await offers(strings.commander.copyPath), 1);
    await page.keyboard.press('Escape');
    await pathMenu.waitFor({ state: 'detached' });

    await parts.last().click({ button: 'right' });
    await pathMenu.waitFor();
    await pathMenu
      .getByRole('menuitem', { name: strings.commander.copyPath })
      .click();
    await pathMenu.waitFor({ state: 'detached' });
    await waitFor(
      async () => (await textOnClipboard()) === opened,
      'the path of the folder shown to be on the clipboard',
    );
  });

  test('hands the focus to the list of a side once a bookmark is chosen with the pointer from the menu Ctrl+D opens atop its path, and to the text of a file viewed once an encoding or a language is, so their keys work at once', async () => {
    const inList = '.commander-pane:nth-child(2) .column-body';
    await select('notes');

    const chosen: boolean[] = [];
    const addOrRemove = page.locator('.menu-item', {
      hasText: new RegExp(
        `^(${strings.commander.addBookmark}|${strings.commander.removeBookmark})$`,
      ),
    });
    const toggleBookmark = async () => {
      await page.keyboard.press('Control+d');
      await addOrRemove.click();
      return focusIn(inList);
    };
    chosen.push(await toggleBookmark(), await toggleBookmark());

    await page.keyboard.press('F3');
    await page.locator(viewerRows).first().waitFor();
    await choose('.viewer-encoding', '.menu-item[aria-checked="true"]');
    chosen.push(await focusIn('.viewer-body'));
    await choose('.viewer .language-button', '.menu-item[aria-checked="true"]');
    chosen.push(await focusIn('.viewer-body'));

    assert.deepStrictEqual(chosen, [true, true, true, true]);
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
  });

  test('runs the scrollbar of the language menu down the whole menu, beside its filter too, rounding its ends as the menu rounds its corners once the app has a radius, its thumb at the end of its track at the last language and back at its start at the first', async () => {
    fs.writeFileSync(path.join(opened, 'menu.ts'), 'const a = 1;');
    await rounded(page);
    try {
      await select('menu');
      await page.keyboard.press('F3');
      await page.locator(viewerRows).first().waitFor();
      await page.keyboard.press('l');
      const menu = page.locator(languageMenu);
      await menu.waitFor();
      const { box } = await barOf(page, languageMenu, 'vertical');
      const placed = await menu.evaluate((element) => {
        const filter = element.querySelector('.search-bar');
        if (filter === null) {
          return undefined;
        }
        const style = getComputedStyle(element);
        const edge = element.getBoundingClientRect();
        const filtered = filter.getBoundingClientRect();
        return {
          top: edge.top,
          right: edge.right,
          bottom: edge.bottom,
          filter: { top: filtered.top, right: filtered.right },
          corners: [
            parseFloat(style.borderTopRightRadius),
            parseFloat(style.borderBottomRightRadius),
          ],
          rounds: [
            parseFloat(style.getPropertyValue('--scrollbar-round-start')),
            parseFloat(style.getPropertyValue('--scrollbar-round-end')),
          ],
        };
      });
      assert.ok(placed, 'the language menu has no filter');
      const subpixel = 0.5;
      assert.deepStrictEqual(
        {
          top: Math.round(box.top - placed.top) + 0,
          right: Math.round(placed.right - box.left - box.width) + 0,
          bottom: Math.round(placed.bottom - box.top - box.height) + 0,
          besideFilter:
            box.top <= placed.filter.top + subpixel &&
            placed.filter.right <= box.left + subpixel,
          rounds: placed.rounds,
        },
        {
          top: 0,
          right: 0,
          bottom: 0,
          besideFilter: true,
          rounds: placed.corners,
        },
        JSON.stringify({ box, placed }),
      );
      assert.ok(
        placed.corners.every((corner) => corner > 0),
        JSON.stringify(placed),
      );

      let last: unknown;
      const thumbAt = async () => {
        const { start, end, thumb } = await barParts(page, box, 'vertical');
        assert.ok(thumb, 'the scrollbar of the language menu has no thumb');
        const at = {
          fromStart: thumb.top - start.top - start.height,
          fromEnd: end.top - thumb.top - thumb.height,
        };
        last = {
          ...at,
          thumb,
          end,
          scroll: await menu.evaluate((element) => ({
            top: element.scrollTop,
            height: element.scrollHeight,
            client: element.clientHeight,
            box: element.getBoundingClientRect().height,
            ratio: devicePixelRatio,
          })),
        };
        return at;
      };
      const measured = (error: unknown): never => {
        throw new Error(`${String(error)}: ${JSON.stringify(last)}`, {
          cause: error,
        });
      };
      const top = await thumbAt();
      assert.ok(Math.abs(top.fromStart) <= subpixel, JSON.stringify(top));
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('End');
      await waitFor(
        async () => Math.abs((await thumbAt()).fromEnd) <= subpixel,
        'the thumb at the end of its track',
      ).catch(measured);
      await page.keyboard.press('Home');
      await waitFor(
        async () => Math.abs((await thumbAt()).fromStart) <= subpixel,
        'the thumb back at the start of its track',
      ).catch(measured);
    } finally {
      await closeLanguageMenu('menu.ts');
    }
  });

  test('scrolls the language menu on the wheel by whole languages, each notch coming to rest with a language starting right below its filter, down and up alike, and at its end too', async () => {
    fs.writeFileSync(path.join(opened, 'wheel.ts'), 'const a = 1;');
    await select('wheel');
    await page.keyboard.press('F3');
    await page.locator(viewerRows).first().waitFor();
    await page.keyboard.press('l');
    const menu = page.locator('.viewer .language-button .menu');
    await menu.waitFor();
    await wheelsByWholeRows(page, menu, menuRows);
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
    fs.rmSync(path.join(opened, 'wheel.ts'));
    await waitFor(
      async () => !(await rowNames()).includes('wheel.ts'),
      'wheel.ts to be gone from the list',
    );
  });

  test('scrolls the language menu to where its track is pressed, the thumb centered there and following the pointer while held as near as the whole languages it scrolls by let it, without choosing the language under it or selecting text', async () => {
    fs.writeFileSync(path.join(opened, 'track.ts'), 'const a = 1;');
    try {
      await select('track');
      await page.keyboard.press('F3');
      await page.locator(viewerRows).first().waitFor();
      const label = page.locator('.viewer .language-button .menu-button-label');
      const language = await label.textContent();
      await page.keyboard.press('l');
      const menu = page.locator(languageMenu);
      await menu.waitFor();
      const { box } = await barOf(page, languageMenu, 'vertical');
      const { start, end, thumb: top } = await barParts(page, box, 'vertical');
      assert.ok(top, 'the scrollbar of the language menu has no thumb');
      const x = box.left + box.width / 2;
      const trackTop = start.top + start.height;
      const trackBottom = end.top;
      const rowOnTrack = await menu.evaluate(
        (element, room) =>
          ((element.querySelector('.menu-entry')?.getBoundingClientRect()
            .height ?? 0) *
            room) /
          (element.scrollHeight - element.clientHeight),
        trackBottom - trackTop - top.height,
      );
      const centered = async (y: number) => {
        const thumb = await thumbHeld();
        return (
          thumb !== undefined &&
          Math.abs(thumb.top + thumb.height / 2 - y) <= Math.max(1, rowOnTrack)
        );
      };

      const middle = (trackTop + trackBottom) / 2;
      await page.mouse.move(x, middle);
      await page.mouse.down();
      try {
        await waitFor(
          () => centered(middle),
          'the thumb centered where pressed',
        );
        const lower = trackTop + ((trackBottom - trackTop) * 3) / 4;
        await page.mouse.move(x, lower, { steps: 5 });
        await waitFor(() => centered(lower), 'the thumb following the pointer');
      } finally {
        await page.mouse.up();
      }
      await page.mouse.click(x, trackTop + 2);
      await waitFor(
        async () => (await menu.evaluate((element) => element.scrollTop)) === 0,
        'the menu back at its start, where its thumb started',
      );

      assert.strictEqual(await menu.count(), 1);
      assert.strictEqual(
        await page.evaluate(() => getSelection()?.toString() ?? ''),
        '',
      );
      await page.keyboard.press('Escape');
      await menu.waitFor({ state: 'detached' });
      assert.strictEqual(await label.textContent(), language);
    } finally {
      await closeLanguageMenu('track.ts');
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
        appMenu
          .locator('.menu-item:not(:disabled)')
          .evaluateAll((items) => items.map((item) => item.textContent ?? ''));
      const keyCaps = () => appMenu.locator('kbd').count();
      const closeWindowsMenu = async (closing: string) => {
        postMessage(shown(), 0x100, 0x1b, 0);
        await waitFor(() => shown() === null, closing);
      };
      const menuRow = right().locator('.commander-row', {
        hasText: /^menu\s*txt/,
      });
      try {
        await menuRow.click({ button: 'right' });
        await appMenu.waitFor();
        assert.match(await selected(), /menu/);
        assert.deepStrictEqual(await appMenuItems(), [
          strings.commander.openWithSevenZip,
          strings.commander.openWithViewer,
          strings.commander.openWithDiff,
          strings.commander.openWithEditor,
          strings.commander.copyPath,
          strings.commander.showMoreOptions,
        ]);
        assert.strictEqual(await keyCaps(), 0);
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
          strings.commander.openWithTerminal,
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
          strings.commander.openWithViewer,
          strings.commander.openWithDiff,
          strings.commander.openWithEditor,
          strings.commander.copyPath,
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
