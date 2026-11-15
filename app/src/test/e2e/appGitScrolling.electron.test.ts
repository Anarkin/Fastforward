import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { page, repository, sharedApp } from './appFixtures';
import { scrollPlaces } from './scrollProbes';
import { longLines } from './wrappingFixtures';
import { defaultSettings, waitFor } from '../helpers/fixtures';

suite('App', () => {
  sharedApp({
    'long.txt': `${longLines.join('\n')}\n`,
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
