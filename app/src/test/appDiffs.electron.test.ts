import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { JSHandle } from 'playwright-core';
import { suite, test } from 'vitest';
import {
  longLines,
  openChangedFile,
  page,
  repository,
  savedSetting,
  scrollPlaces,
  sharedApp,
  waitForCount,
  waitForFocus,
} from './appFixtures';
import { defaultSettings, waitFor } from './fixtures';

async function drawnCodeRow(): Promise<number> {
  return page
    .locator('.diff-line')
    .first()
    .evaluate((line) => parseFloat(getComputedStyle(line).lineHeight));
}

const commented = (answer: number) =>
  `/* the answer\na\nb\nc\n*/\nexport const answer = ${answer};\n`;

suite('App', () => {
  sharedApp({
    'code.ts': 'export const answer = 42;\n',
    'commented.ts': commented(42),
    'long.txt': `${longLines.join('\n')}\n`,
  });

  test('colors code away from the page, offers every language for a file selected from a button in line with the others, opening rightwards from the button, as it starts the toolbar, but only Auto and Plain Text for many, leaves code plain on Plain Text until Auto, and colors a file in a language chosen for it until another is selected', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'code.ts' }).click();
    await page.locator('.syntax-keyword', { hasText: 'export' }).waitFor();
    await page.locator('.syntax-number', { hasText: '42' }).waitFor();
    const button = page.locator('.diff-options .language-button');
    const label = () => button.locator('.menu-button-label').textContent();
    const keyword = page.locator('.diff-line .syntax-keyword').first();
    const choose = async (item: string, typed?: string) => {
      await button.locator('.menu-button-trigger').click();
      if (typed !== undefined) {
        await page.keyboard.type(typed);
      }
      await button
        .locator('.menu-item', { hasText: new RegExp(`^${item}$`) })
        .click();
      await button.locator('.menu').waitFor({ state: 'detached' });
    };
    assert.strictEqual(await label(), 'TypeScript');
    const middles = await Promise.all(
      [
        button.locator('.menu-button-trigger'),
        page.locator('.diff-options [title="Show Whitespace"]'),
      ].map(async (each) => {
        const box = await each.boundingBox();
        return box && box.y + box.height / 2;
      }),
    );
    assert.strictEqual(middles[0], middles[1]);
    await page.keyboard.press('l');
    await button.locator('.menu-filter').waitFor();
    assert.ok((await button.locator('.menu-item').count()) > 200);
    const [menuBox, buttonBox] = await Promise.all([
      button.locator('.menu').boundingBox(),
      button.locator('.menu-button').boundingBox(),
    ]);
    assert.strictEqual(menuBox?.x, buttonBox?.x);
    await page.keyboard.press('Escape');
    await button.locator('.menu').waitFor({ state: 'detached' });

    await choose('Plain Text');
    await keyword.waitFor({ state: 'detached' });
    assert.strictEqual(await label(), 'Plain Text');
    await choose('TypeScript', 'typescript');
    await keyword.waitFor();
    assert.strictEqual(await label(), 'TypeScript');

    await page.locator('.row.group', { hasText: 'All Changes' }).click();
    await page
      .locator('.row.group.selected', { hasText: 'All Changes' })
      .waitFor();
    assert.strictEqual(await label(), 'Plain Text');
    await keyword.waitFor({ state: 'detached' });
    await button.locator('.menu-button-trigger').click();
    assert.deepStrictEqual(
      await button.locator('.menu-item').allTextContents(),
      ['Auto', '✓Plain Text'],
    );
    assert.strictEqual(await button.locator('.menu-filter').count(), 0);
    await button.locator('.menu-item', { hasText: /^Auto$/ }).click();
    await keyword.waitFor();
    assert.strictEqual(await label(), 'Auto');
    await page.locator('.row.file', { hasText: 'code.ts' }).click();
    await waitFor(async () => (await label()) === 'TypeScript', 'the language');
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
    const field = page.locator('.find-field-input');
    await waitForFocus(field, 'the find field');
    await field.fill('T');
    const count = page.locator('.find-field-count');
    await page.locator('.find-field-count', { hasText: '1 of 2' }).waitFor();
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
    await page.locator('.find-field-count', { hasText: '2 of 2' }).waitFor();
    await waitForCount(page.locator('.minimap-mark.match'), 2, 'match marks');
    await page.locator('.minimap-mark.added').first().waitFor();
    await page.locator('.row.group', { hasText: 'All Changes' }).click();
    await page.locator('.find-field-count', { hasText: '1 of 2' }).waitFor();
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
    const field = page.locator('.find-field-input');
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

  test('gives the keyboard back to the diff once Esc closes the find field', async () => {
    await openChangedFile();
    await page.locator('.diff-view .virtual-rows').focus();
    await page.keyboard.press('ControlOrMeta+F');
    await waitForFocus(page.locator('.find-field-input'), 'the find field');
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

  test('scrolls the diff by whole lines, gliding to each line, after its scrollbar dragged too, and coming to rest with a line at the top of the view', async () => {
    const file = path.join(repository.root, 'long.txt');
    fs.writeFileSync(
      file,
      `${longLines.map((line, index) => (index % 10 === 0 ? `changed ${index}` : line)).join('\n')}\n`,
    );
    try {
      await page.locator('.commit', { hasText: 'second' }).click();
      await page.locator('.commit.selected', { hasText: 'second' }).waitFor();
      await page
        .locator('.commit.working-tree', { hasText: '1 uncommitted change' })
        .click();
      await page.locator('.row.file', { hasText: 'long.txt' }).click();
      await page.locator('.diff-line.added').first().waitFor();
      const list = page.locator('.diff-view .virtual-rows');
      const place = () =>
        list.evaluate((element) => {
          const top = element.getBoundingClientRect().top;
          const line =
            element.querySelector('.diff-line')?.getBoundingClientRect()
              .height ?? 1;
          const first = [...element.querySelectorAll('.virtual-row')]
            .map((row) => row.getBoundingClientRect())
            .filter((box) => box.height > 0 && box.bottom > top + 0.5)
            .toSorted((one, other) => one.top - other.top)[0];
          return {
            scrolled: element.scrollTop,
            lines: element.scrollTop / line,
            offset: (first?.top ?? top) - top,
          };
        });
      await list.hover();
      const wheeled = await scrollPlaces(page, list, () =>
        page.mouse.wheel(0, 50),
      );
      const scrolled = await place();
      assert.ok((wheeled.at(-1) ?? 0) > 0, JSON.stringify(wheeled));
      assert.ok(
        Math.abs(scrolled.lines - Math.round(scrolled.lines)) < 0.01 &&
          Math.abs(scrolled.offset) < 0.01,
        JSON.stringify(scrolled),
      );

      await list.hover();
      const grabbed = await page.locator('.diff-minimap').boundingBox();
      assert.ok(grabbed, 'the scrollbar of the diff');
      await list.evaluate((element) => {
        const offsets: number[] = [];
        Reflect.set(window, 'lineOffsets', offsets);
        const painted = new MessageChannel();
        painted.port1.addEventListener('message', () => {
          const top = element.getBoundingClientRect().top;
          const first = [...element.querySelectorAll('.virtual-row')]
            .map((row) => row.getBoundingClientRect())
            .filter((box) => box.height > 0 && box.bottom > top + 0.5)
            .toSorted((one, other) => one.top - other.top)[0];
          offsets.push((first?.top ?? top) - top);
          if (Reflect.get(window, 'lineOffsets') === offsets) {
            requestAnimationFrame(() => painted.port2.postMessage(null));
          }
        });
        painted.port1.start();
        requestAnimationFrame(() => painted.port2.postMessage(null));
      });
      const x = grabbed.x + grabbed.width / 2;
      const y = grabbed.y + grabbed.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let step = 1; step <= 30; step++) {
        await page.mouse.move(x, y + step);
        await page.evaluate(
          () => new Promise((resolve) => requestAnimationFrame(resolve)),
        );
      }
      await page.mouse.up();
      const offsets = await page.evaluate(() => {
        const recorded: unknown = Reflect.get(window, 'lineOffsets');
        Reflect.set(window, 'lineOffsets', undefined);
        return Array.isArray(recorded) ? recorded.map(Number) : [];
      });
      assert.ok((await place()).scrolled > scrolled.scrolled);
      assert.ok(
        offsets.some((offset) => Math.abs(offset) >= 0.01),
        'the diff to glide after the scrollbar',
      );
      await waitFor(async () => {
        const { lines, offset } = await place();
        return (
          Math.abs(lines - Math.round(lines)) < 0.01 && Math.abs(offset) < 0.01
        );
      }, 'the diff to come to rest on a line');
    } finally {
      await repository.git('checkout', '-q', 'HEAD', '--', 'long.txt');
    }
    await page.locator('.commit.working-tree.empty').waitFor();
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
      const row = await drawnCodeRow();
      await waitFor(
        async () => (await belowTop()) === Math.round(3 * row),
        'the change to be shown at its place',
      );
      await page.getByRole('button', { name: 'Show the Entire File' }).click();
      await page
        .getByRole('button', { name: 'Show the Entire File', pressed: false })
        .waitFor();
      await waitFor(
        () => savedSetting('showEntireFile') === false,
        'the entire file turned off to be saved',
      );
      await waitFor(
        async () =>
          (await page.locator('.diff-line').count()) < 20 &&
          (await belowTop()) === Math.round(4 * row),
        'only the changes to be shown, too few to scroll',
      );
      await page.getByRole('button', { name: 'Show the Entire File' }).click();
      await page
        .getByRole('button', { name: 'Show the Entire File', pressed: true })
        .waitFor();
      await waitFor(
        async () => (await belowTop()) === Math.round(3 * row),
        'the entire file to be shown at its change',
      );
      await waitFor(
        () => savedSetting('showEntireFile') === undefined,
        'the entire file left to the default again',
      );
    } finally {
      await repository.git('checkout', '-q', 'HEAD', '--', 'long.txt');
    }
    await page.locator('.commit.working-tree.empty').waitFor();
  });

  test('scrolls the diff on the wheel over its scrollbar as over its lines, rather than the column around it', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    await page.locator('.diff-line', { hasText: 'line0 ' }).first().waitFor();
    const list = page.locator('.diff-view .virtual-rows');
    await list.evaluate((element) => {
      element.scrollTop = 0;
    });
    const minimap = await page.locator('.diff-minimap').boundingBox();
    assert.ok(minimap);
    await page.mouse.move(
      minimap.x + minimap.width / 2,
      minimap.y + minimap.height / 2,
    );
    await page.mouse.wheel(0, 100);
    const lines = () =>
      list.evaluate((element) => {
        const line =
          element.querySelector('.diff-line')?.getBoundingClientRect().height ??
          1;
        return {
          lines: element.scrollTop / line,
          column: element.closest('.column-body')?.scrollTop ?? 0,
        };
      });
    await waitFor(
      async () =>
        Math.abs(
          (await lines()).lines - defaultSettings().scrolling.wheelRows,
        ) < 0.01,
      'the diff to scroll the lines of a notch',
    );
    assert.strictEqual((await lines()).column, 0);
  });

  test('keeps the scrollbar and the minimap of a diff against the line its column draws on the right and at the bottom, clipped to its rounded corner', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    await page.locator('.diff-line', { hasText: 'line0 ' }).first().waitFor();
    await page.locator('.diff-view .virtual-rows').hover();
    const edges = await page.locator('.diff-minimap').evaluate((minimap) => {
      const column = minimap.closest('.column');
      const viewport = minimap.querySelector('.minimap-viewport');
      if (column === null || viewport === null) {
        return undefined;
      }
      const style = getComputedStyle(column);
      const line = parseFloat(style.getPropertyValue('--column-line'));
      const edge = column.getBoundingClientRect();
      return {
        right: Math.round(
          edge.right - line - viewport.getBoundingClientRect().right,
        ),
        bottom: Math.round(
          edge.bottom - line - minimap.getBoundingClientRect().bottom,
        ),
        corner: Math.round(parseFloat(style.borderBottomRightRadius) - line),
        clipped: getComputedStyle(minimap).overflow,
        rounded: Math.round(
          parseFloat(getComputedStyle(minimap).borderBottomRightRadius),
        ),
      };
    });

    assert.deepStrictEqual(
      [edges?.right, edges?.bottom, edges?.clipped, edges?.rounded],
      [0, 0, 'hidden', edges?.corner],
      JSON.stringify(edges),
    );
  });

  test('never scrolls the column around the diff, which has its own scrollbar, even when the diff sticks out of it by a few pixels', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    await page.locator('.diff-line', { hasText: 'line0 ' }).first().waitFor();
    const taller = await page.addStyleTag({
      content: '.diff-view { margin-bottom: 4px; }',
    });
    try {
      const minimap = await page.locator('.diff-minimap').boundingBox();
      assert.ok(minimap);
      await page.mouse.move(
        minimap.x + minimap.width / 2,
        minimap.y + minimap.height / 2,
      );
      await page.mouse.move(
        minimap.x + minimap.width / 2,
        minimap.y + minimap.height / 2 + 10,
      );
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => setTimeout(resolve, 50)),
          ),
      );
      assert.strictEqual(
        await page.locator('.overlay-scrollbar.vertical.shown').count(),
        0,
      );
    } finally {
      await taller.evaluate((element) =>
        element.parentNode?.removeChild(element),
      );
    }
  });

  test('draws the rows of where its scrollbar is dragged to in the frame it scrolls there, rather than once the scroll event of the frame after comes, which left every other frame without new rows', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'long.txt' }).click();
    await page.locator('.diff-line', { hasText: 'line0 ' }).first().waitFor();
    await page.evaluate(() => {
      const list = document.querySelector('.diff-view .virtual-rows');
      const seen: boolean[] = [];
      Reflect.set(window, 'coveredMoves', seen);
      let last = list?.scrollTop;
      const check = () => {
        if (!list || list.scrollTop === last) {
          return;
        }
        last = list.scrollTop;
        const rows = [...list.querySelectorAll<HTMLElement>('.diff-row')];
        const end = rows.find((row) => row.textContent?.includes('line199 '));
        const top = Math.min(
          list.scrollTop + list.clientHeight - 2,
          end ? parseFloat(end.style.top) + end.offsetHeight - 2 : Infinity,
        );
        seen.push(
          rows.some(
            (row) =>
              parseFloat(row.style.top) <= top &&
              top < parseFloat(row.style.top) + row.offsetHeight,
          ),
        );
      };
      window.addEventListener('scroll', check, { capture: true });
    });
    const minimap = await page.locator('.diff-minimap').boundingBox();
    assert.ok(minimap);
    const x = minimap.x + minimap.width / 2;
    await page.mouse.move(x, minimap.y + 2);
    await page.mouse.down();
    for (let step = 1; step <= 5; step++) {
      await page.mouse.move(
        x,
        minimap.y + 2 + (minimap.height - 4) * (step / 5),
      );
    }
    await page.mouse.up();

    const covered = await page.evaluate(() =>
      Reflect.get(window, 'coveredMoves'),
    );
    assert.ok(
      Array.isArray(covered) && covered.length > 2,
      JSON.stringify(covered),
    );
    assert.ok(covered.every(Boolean), JSON.stringify(covered));
  });
});
