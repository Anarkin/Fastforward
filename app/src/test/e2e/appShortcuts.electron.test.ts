import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { page, sharedApp } from './appFixtures';
import { waitFor } from '../helpers/fixtures';
import { wheelsByWholeRows } from './scrollProbes';
import { paneRows } from '../../shell/page/shortcutsList';
import {
  app as commanderApp,
  page as commanderPage,
  sharedCommanderApp,
} from './commanderAppFixtures';

const marks = () =>
  commanderPage.evaluate(() => {
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

suite('App', () => {
  sharedApp({});

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

  test('opens the shortcuts on the diff while the diff has the focus, and on git while the commits have it', async () => {
    const shortcuts = page.getByRole('dialog', { name: 'Shortcuts' });
    const open = page.locator('.shortcuts-tool.open .shortcuts-tool-name');
    const opensOn = async (entry: string) => {
      await page.keyboard.press('F1');
      await shortcuts.waitFor();
      assert.strictEqual(await open.textContent(), entry);
      await page.keyboard.press('Escape');
      await shortcuts.waitFor({ state: 'detached' });
    };
    await page.locator('.commit', { hasText: 'first' }).click();
    await opensOn('Git');
    await page.locator('.row.file').first().click();
    await page.locator('.diff-view .virtual-rows').click();
    await waitFor(
      () =>
        page.evaluate(
          () =>
            document.activeElement?.closest('.diff-view') !== null &&
            document.activeElement !== null,
        ),
      'the diff to have the focus',
    );
    await opensOn('Diff');
  });
});

suite('App commander', () => {
  sharedCommanderApp();

  test('scrolls the shortcuts on the wheel by whole rows, each notch coming to rest with a shortcut or a heading starting right below the heading stuck at the top, down and up alike, and at the end too', async () => {
    await commanderPage.keyboard.press('F1');
    const pane = commanderPage.locator('.shortcuts-pane');
    await pane.locator('.shortcuts-heading', { hasText: 'Archives' }).waitFor();
    await wheelsByWholeRows(commanderPage, pane, paneRows);
    await commanderPage.keyboard.press('F1');
    await pane.waitFor({ state: 'detached' });
  });

  test('lists the shortcuts of the commander beside the tools, scrolling them only down in a small window, marking every group with a shortcut in view as it scrolls, brings a group clicked or stepped to to the top, and goes on to the next tool once the pane can scroll no further, each shortcut one key cap a line high', async () => {
    const size = await commanderApp.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows().toSorted(
        (a, b) => a.id - b.id,
      );
      const before = window?.getSize();
      window?.setSize(900, 600);
      return before;
    });
    await commanderPage.keyboard.press('F1');
    const pane = commanderPage.locator('.shortcuts-pane');
    await pane.locator('.shortcuts-heading', { hasText: 'Archives' }).waitFor();
    const markedAsShown = async (first: string) => {
      const { showing, marked } = await marks();
      return (
        marked[0] === first &&
        marked.join() === showing.join() &&
        marked.length > 0
      );
    };
    const laidOut = await commanderPage.evaluate(() => {
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
    await commanderPage
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
    await commanderPage.keyboard.press('ArrowUp');
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
    await commanderPage.keyboard.press('ArrowDown');
    await commanderPage
      .locator('.shortcuts-tool.open', { hasText: 'Viewer' })
      .waitFor();
    await commanderPage
      .locator('.shortcuts-tool', { hasText: 'Terminal' })
      .click();
    await waitFor(
      async () =>
        (await marks()).marked.join() === 'Clipboard,Kept from the shell',
      'both groups of the terminal to be marked, as both show',
    );
    const focused = await commanderPage.evaluate(() =>
      document.activeElement?.matches('.shortcuts-filter input'),
    );
    await commanderPage.keyboard.press('F1');
    await pane.waitFor({ state: 'detached' });
    await commanderApp.evaluate(
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
});
