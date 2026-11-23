import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { manyFolder, tableFile } from './perfData';
import { launchedForPerf, measure, perfData } from './perfFixtures';
import { barOf, barParts } from '../e2e/scrollbarsShown';
import { dragged, sleep } from './perfInput';

const views = [
  {
    name: 'commander',
    tab: 0,
    pane: '.commander-pane:not(.inactive) .virtual-rows',
    down: '.commander-pane:not(.inactive) .virtual-rows',
    across: undefined,
  },
  {
    name: 'viewer',
    tab: 1,
    pane: '.viewer-body',
    down: '.viewer-body .scroll-proxy.vertical',
    across: '.viewer-sideways',
  },
  {
    name: 'editor',
    tab: 2,
    pane: '.editor :is(.cm-scroller, .editor-scroller)',
    down: '.editor :is(.cm-scroller, .editor-scroller)',
    across:
      '.editor :is(.cm-editor, .editor-surface) > .scroll-proxy-frame .scroll-proxy',
  },
  {
    name: 'diff',
    tab: 3,
    pane: '.compare-view .diff-view .virtual-rows',
    down: '.compare-view .diff-view > .virtual-rows',
    across: '.compare-view .diff-view .scroll-proxy.horizontal',
  },
  {
    name: 'commit list',
    tab: 4,
    pane: '.virtual-rows.list',
    down: '.virtual-rows.list',
    across: undefined,
  },
] as const;

for (const smooth of [true, false]) {
  suite(`Frames of scrollbars dragged, gliding ${smooth}`, () => {
    const { files, repository } = perfData();
    const folder = tempFolder('perf-bars');
    const table = path.join(files, tableFile);
    const changed = path.join(folder, 'padded-changed.md');
    fs.writeFileSync(
      changed,
      fs
        .readFileSync(table, 'utf8')
        .split('\n')
        .map((line, index) =>
          index % 40 === 7 ? line.replace('|', '| changed') : line,
        )
        .join('\n'),
    );
    afterAll(() => removeFolder(folder));
    const perf = launchedForPerf(
      {
        state: {
          tabs: [
            {
              id: '1',
              tool: 'commander',
              root: path.join(files, manyFolder),
            },
            { id: '2', tool: 'viewer', root: table },
            { id: '3', tool: 'editor', root: table },
            { id: '4', tool: 'diff', compare: { old: table, new: changed } },
            { id: '5', tool: 'git', root: repository },
          ],
          activeTab: '1',
        },
        settings: { scrolling: { smooth }, text: { wordWrap: false } },
      },
      (page) =>
        page
          .locator('.commander-pane')
          .nth(1)
          .locator('.commander-row')
          .nth(5)
          .waitFor(),
    );
    const mode = `smooth ${smooth ? 'on' : 'off'}`;

    for (const view of views) {
      test(`${view.name} down`, async () => {
        const { page } = perf();
        await page.locator('.tabs .tab').nth(view.tab).click();
        const pane = page.locator(view.pane).first();
        await pane.waitFor();
        if (view.name === 'viewer') {
          await pane.focus();
          await page.keyboard.press('2');
          await page
            .locator(
              '.viewer :is(.viewer-row:not(.viewer-probe), .cell-rows[data-rows]:has(canvas))',
            )
            .first()
            .waitFor();
        }
        await sleep(1500);
        const { box } = await barOf(page, view.down, 'vertical');
        const { thumb, start, end } = await barParts(page, box, 'vertical');
        assert.ok(thumb);
        const from = {
          x: thumb.left + thumb.width / 2,
          y: thumb.top + Math.min(thumb.height / 2, 12),
        };
        const room = box.height - start.height - end.height - thumb.height - 40;
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await sleep(300);
        const result = await measure(
          perf(),
          `drag: ${view.name}, down, ${mode}`,
          () => dragged(page, from, { x: 0, y: room }),
        );
        await page.mouse.up();
        assert.ok(result.frames.updates > 100, String(result.frames.updates));
      });

      const { across } = view;
      if (across !== undefined) {
        test(`${view.name} across`, async () => {
          const { page } = perf();
          const { box } = await barOf(page, across, 'horizontal');
          const { thumb, start, end } = await barParts(page, box, 'horizontal');
          assert.ok(thumb);
          const from = {
            x: thumb.left + Math.min(thumb.width / 2, 12),
            y: thumb.top + thumb.height / 2,
          };
          await page.mouse.move(from.x, from.y);
          await page.mouse.down();
          await sleep(300);
          const result = await measure(
            perf(),
            `drag: ${view.name}, across, ${mode}`,
            () =>
              dragged(page, from, {
                x: box.width - start.width - end.width - thumb.width - 40,
                y: 0,
              }),
          );
          await page.mouse.up();
          assert.ok(result.frames.updates > 100, String(result.frames.updates));
        });
      }
    }
  });
}
