import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { waitFor } from '../helpers/fixtures';
import { clippedCorner } from './scrollProbes';
import {
  opened,
  app,
  page,
  right,
  rowNames,
  selected,
  select,
  sharedCommanderApp,
} from './commanderAppFixtures';

const focusIn = (selector: string) =>
  page.evaluate(
    (wanted) => Boolean(document.activeElement?.closest(wanted)),
    selector,
  );

const choose = async (menu: string, item: string) => {
  await page.locator(menu).locator('.menu-button-trigger').click();
  await page.locator(menu).locator(item).first().click();
};

suite('App commander', () => {
  sharedCommanderApp();

  test('hands the focus to the list of a side once a layout or a bookmark is chosen with the pointer from the menus of its header, and to the text of a file viewed once an encoding or a language is, so their keys work at once', async () => {
    const inList = '.commander-pane:nth-child(2) .column-body';
    await select('notes');

    const chosen: boolean[] = [];
    await choose(
      `.commander-pane:nth-child(2) .commander-layout`,
      `.menu-item:has-text("${strings.commander.layouts.details}")`,
    );
    chosen.push(await focusIn(inList));
    const bookmarks = right().locator(
      `button[title="${strings.commander.bookmarks}"]`,
    );
    const addOrRemove = page.locator('.menu-item', {
      hasText: new RegExp(
        `^(${strings.commander.addBookmark}|${strings.commander.removeBookmark})$`,
      ),
    });
    const toggleBookmark = async () => {
      await bookmarks.click();
      await addOrRemove.click();
      return focusIn(inList);
    };
    chosen.push(await toggleBookmark(), await toggleBookmark());

    await page.keyboard.press('F3');
    await page.locator('.viewer .viewer-rows .viewer-row').first().waitFor();
    await choose('.viewer-encoding', '.menu-item[aria-checked="true"]');
    chosen.push(await focusIn('.viewer-body'));
    await choose('.viewer .language-button', '.menu-item[aria-checked="true"]');
    chosen.push(await focusIn('.viewer-body'));

    assert.deepStrictEqual(chosen, [true, true, true, true, true]);
    await page.keyboard.press('Escape');
    await page.locator('.viewer').waitFor({ state: 'detached' });
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
