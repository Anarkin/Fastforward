import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from 'playwright-core';
import { afterAll, suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { launchedForPerf, measure } from './perfFixtures';
import { sleep, wheelNotches } from './perfInput';

const folder = tempFolder('perf-marks');

const linesOf = (changed: boolean) =>
  Array.from(
    { length: 6000 },
    (_, at) =>
      `    name${at}: (value: string, other: boolean) => \`\${value}: ${at}\`,${changed && at % 40 === 7 ? ' // changed' : ''}`,
  ).join('\n');

const older = path.join(folder, 'strings-v1.ts');
const newer = path.join(folder, 'strings-v2.ts');
fs.writeFileSync(older, linesOf(false));
fs.writeFileSync(newer, linesOf(true));

afterAll(() => removeFolder(folder));

const tools = [
  {
    name: 'viewer',
    tab: 0,
    rows: '.viewer-rows :is(.viewer-row, .cell-rows[data-rows]:has(canvas))',
    pane: '.viewer-body',
  },
  {
    name: 'editor',
    tab: 1,
    rows: '.editor .cm-line',
    pane: '.editor .cm-scroller',
  },
  {
    name: 'diff',
    tab: 2,
    rows: '.diff-view .diff-cells[data-rows]:has(canvas)',
    pane: '.diff-view > .virtual-rows',
  },
] as const;

async function colonSelected(page: Page, rows: string): Promise<void> {
  const cells = await page
    .locator(rows)
    .first()
    .evaluate((host) =>
      host instanceof HTMLElement ? host.seenRows?.()[3] : undefined,
    );
  const drawn =
    cells === undefined || !cells.text.includes(':')
      ? undefined
      : {
          left: cells.left + (cells.text.indexOf(':') + 0.1) * cells.advance,
          right: cells.left + (cells.text.indexOf(':') + 0.9) * cells.advance,
          y: cells.top + cells.height / 2,
        };
  const place =
    drawn ??
    (await page
      .locator(rows)
      .nth(3)
      .evaluate((row) => {
        const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const at = node.textContent?.indexOf(':') ?? -1;
          if (at !== -1) {
            const range = document.createRange();
            range.setStart(node, at);
            range.setEnd(node, at + 1);
            const box = range.getBoundingClientRect();
            return {
              left: box.left + 0.5,
              right: box.right - 0.5,
              y: box.top + box.height / 2,
            };
          }
        }
        return undefined;
      }));
  assert.ok(place, 'no colon to select');
  await page.mouse.move(place.left, place.y);
  await page.mouse.down();
  await page.mouse.move(place.right, place.y, { steps: 4 });
  await page.mouse.up();
}

suite('Frames of the copies of a colon marked', () => {
  const perf = launchedForPerf(
    {
      state: {
        tabs: [
          { id: '1', tool: 'viewer', root: older },
          { id: '2', tool: 'editor', root: older },
          { id: '3', tool: 'diff', compare: { old: older, new: newer } },
        ],
        activeTab: '1',
      },
      settings: { scrolling: { smooth: true }, text: { wordWrap: false } },
    },
    (page) => page.locator('.viewer').waitFor(),
  );

  for (const tool of tools) {
    const shown = async () => {
      const { page } = perf();
      await page.locator('.tabs .tab').nth(tool.tab).click();
      const drawn = page.locator(tool.rows);
      await (tool.name === 'viewer' ? drawn.first() : drawn.nth(10)).waitFor();
      if (tool.name === 'viewer') {
        await page.locator(tool.pane).first().focus();
        await page.keyboard.press('2');
        await drawn.first().waitFor();
      }
      await sleep(1000);
    };

    test(`${tool.name} colon selected`, async () => {
      await shown();
      const { page } = perf();
      const result = await measure(
        perf(),
        `marks: ${tool.name}, a colon selected`,
        () => colonSelected(page, tool.rows),
        1000,
      );
      assert.ok(result.frames.updates >= 0);
    });

    test(`${tool.name} wheel with a colon selected`, async () => {
      const { page } = perf();
      const result = await measure(
        perf(),
        `marks: ${tool.name}, wheel with a colon selected`,
        () => wheelNotches(page, page.locator(tool.pane).first(), 40),
      );
      assert.ok(result.frames.updates >= 0);
    });
  }
});
