import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { manyFolder, tableFile } from './perfData';
import { launchedForPerf, measure, perfData } from './perfFixtures';
import { dragged, sleep } from './perfInput';

const overlay = (axis: 'vertical' | 'horizontal') =>
  `.overlay-scrollbar.${axis}.shown`;

const views = [
  {
    name: 'commander',
    tab: 0,
    pane: '.commander-pane:not(.inactive) .virtual-rows',
    down: overlay('vertical'),
    across: undefined,
  },
  {
    name: 'viewer',
    tab: 1,
    pane: '.viewer-body',
    down: '.viewer-thumb',
    across: overlay('horizontal'),
  },
  {
    name: 'editor',
    tab: 2,
    pane: '.editor .cm-scroller',
    down: overlay('vertical'),
    across: overlay('horizontal'),
  },
  {
    name: 'diff',
    tab: 3,
    pane: '.compare-view .diff-view .virtual-rows',
    down: '.diff-minimap',
    across: overlay('horizontal'),
  },
  {
    name: 'commit list',
    tab: 4,
    pane: '.virtual-rows.list',
    down: overlay('vertical'),
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
          await page.locator('.viewer-row').nth(8).waitFor();
        }
        await sleep(1500);
        const box = await pane.boundingBox();
        assert.ok(box);
        await page.mouse.move(box.x + box.width / 3, box.y + 80);
        const bar = page.locator(view.down).first();
        await bar.waitFor();
        const thumb = await bar.boundingBox();
        assert.ok(thumb);
        const whole = view.name === 'diff';
        const from = {
          x: thumb.x + thumb.width / 2,
          y: whole ? thumb.y + 40 : thumb.y + Math.min(thumb.height / 2, 12),
        };
        const room = whole
          ? thumb.height - 120
          : box.height - thumb.height - 40;
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await sleep(300);
        const result = await measure(
          perf(),
          `drag: ${view.name}, down, ${mode}`,
          () => dragged(page, from, { x: 0, y: room }),
        );
        await page.mouse.up();
        assert.ok(result.frames.updates > 0);
      });

      const { across } = view;
      if (across !== undefined) {
        test(`${view.name} across`, async () => {
          const { page } = perf();
          const pane = page.locator(view.pane).first();
          const box = await pane.boundingBox();
          assert.ok(box);
          await page.mouse.move(box.x + box.width / 3, box.y + 120);
          await page.mouse.move(box.x + box.width / 3 + 4, box.y + 124);
          const bar = page.locator(across).first();
          await bar.waitFor();
          const thumb = await bar.boundingBox();
          assert.ok(thumb);
          const from = {
            x: thumb.x + Math.min(thumb.width / 2, 12),
            y: thumb.y + thumb.height / 2,
          };
          await page.mouse.move(from.x, from.y);
          await page.mouse.down();
          await sleep(300);
          const result = await measure(
            perf(),
            `drag: ${view.name}, across, ${mode}`,
            () =>
              dragged(page, from, {
                x: box.width - thumb.width - 80,
                y: 0,
              }),
          );
          await page.mouse.up();
          assert.ok(result.frames.updates > 0);
        });
      }
    }
  });
}
