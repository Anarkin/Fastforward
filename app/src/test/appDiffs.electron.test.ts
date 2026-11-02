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
  sharedApp,
  waitForCount,
  waitForFocus,
} from './appFixtures';
import { waitFor } from './fixtures';

async function codeRow(lineHeight = 1.4): Promise<number> {
  const ratio = await page.evaluate(() => devicePixelRatio);
  return Math.round(12 * lineHeight * ratio) / ratio;
}

const commented = (answer: number) =>
  `/* the answer\na\nb\nc\n*/\nexport const answer = ${answer};\n`;

suite('App', () => {
  sharedApp({
    'code.ts': 'export const answer = 42;\n',
    'commented.ts': commented(42),
    'long.txt': `${longLines.join('\n')}\n`,
  });

  test('colors code away from the page, and none while syntax highlighting is off on its button', async () => {
    await page.locator('.commit', { hasText: 'first' }).click();
    await page.locator('.row.file', { hasText: 'code.ts' }).click();
    await page.locator('.syntax-keyword', { hasText: 'export' }).waitFor();
    await page.locator('.syntax-number', { hasText: '42' }).waitFor();
    const highlight = page.getByRole('button', { name: 'Highlight Syntax' });
    await highlight.click();
    await page.locator('.diff-line .syntax-keyword').first().waitFor({
      state: 'detached',
    });
    assert.strictEqual(await highlight.getAttribute('aria-pressed'), 'false');
    await highlight.click();
    await page.locator('.syntax-keyword', { hasText: 'export' }).waitFor();
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

  test('scrolls the diff by whole lines, each line starting at the top of the view, at every frame while its scrollbar is dragged too rather than between lines and then snapping', async () => {
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
      await page.mouse.wheel(0, 50);
      await waitFor(
        async () => (await place()).scrolled > 0,
        'the diff to scroll',
      );
      const scrolled = await place();
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
      assert.deepStrictEqual(
        offsets.filter((offset) => Math.abs(offset) >= 0.01),
        [],
      );
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
      const row = await codeRow();
      await waitFor(
        async () => (await belowTop()) === Math.round(3 * row),
        'the change to be shown at its place',
      );
      await page.getByRole('button', { name: 'Pin Entire Files' }).click();
      await page
        .getByRole('button', { name: 'Show the Entire File', pressed: false })
        .waitFor();
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
        () => savedSetting('entireFilePinned') === false,
        'the unpinning to be saved',
      );
    } finally {
      await repository.git('checkout', '-q', 'HEAD', '--', 'long.txt');
    }
    await page.locator('.commit.working-tree.empty').waitFor();
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
