import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { tempRepository } from '../helpers/repositories';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { untilSettled } from './waits';
import { commitRow } from './commitRows';

const tools = ['commander', 'viewer', 'editor', 'git', 'diff'] as const;

type Tool = (typeof tools)[number];

const searches: Record<Tool, number> = {
  commander: 0,
  viewer: 0,
  editor: 0,
  git: 1,
  diff: 0,
};

interface Bar {
  readonly name: string;
  readonly tall: number;
  readonly above: number;
  readonly below: number;
  readonly before: number;
  readonly after: number;
  readonly gaps: readonly number[];
  readonly heights: readonly number[];
  readonly left: number;
  readonly right: number;
  readonly searching: boolean;
  readonly endsRight: boolean;
  readonly fits: boolean;
  readonly single: boolean;
}

function barsShown(): Bar[] {
  const parts = '.nav-button, .search-box';
  const buttonsIn = (within: Element) =>
    [...within.querySelectorAll(parts)]
      .map((part) => part.getBoundingClientRect())
      .filter((box) => box.width > 0)
      .toSorted((one, other) => one.left - other.left);
  return [
    ...document.querySelectorAll<HTMLElement>('.column-title, .locations-bar'),
  ]
    .filter((bar) => bar.getBoundingClientRect().height > 0)
    .map((bar) => {
      const box = bar.getBoundingClientRect();
      const style = getComputedStyle(bar);
      const line = parseFloat(style.paddingTop) || 0;
      const under = parseFloat(style.borderBottomWidth) || 0;
      const all = buttonsIn(bar);
      const groups = [...bar.querySelectorAll('.toolbar')].filter(
        (group) => group.parentElement?.closest('.toolbar') === null,
      );
      const [first] = all;
      const last = all.at(-1);
      const ends = groups.map((group) => group.getBoundingClientRect());
      return {
        name: [...bar.classList].join('.'),
        tall: box.height - under,
        above: (first?.top ?? 0) - box.top - line,
        below: box.bottom - under - (first?.bottom ?? 0),
        before: (first?.left ?? 0) - box.left - line,
        after: box.right - line - (last?.right ?? 0),
        gaps: groups.flatMap((group) => {
          const within = buttonsIn(group);
          return within
            .slice(1)
            .map((each, index) => each.left - (within[index]?.right ?? 0));
        }),
        heights: all.map((each) => each.height),
        left: first?.left ?? 0,
        right: last?.right ?? 0,
        searching: bar.contains(document.activeElement),
        endsRight:
          bar.querySelector(
            ':scope > .column-actions, :scope > .search-bar',
          ) !== null,
        single: bar.closest('.columns.bars-outside') !== null,
        fits:
          bar.scrollWidth <= bar.clientWidth &&
          ends.every(
            (end, index) =>
              index === 0 || end.left >= (ends[index - 1]?.right ?? 0),
          ),
      };
    });
}

const fitting = 5;

const apart = (one: number, other: number) => Math.abs(one - other) > 0.1;

function unlike(bar: Bar, model: Bar): string[] {
  const space = model.below;
  const [height] = model.heights;
  const around = bar.single ? 0 : space;
  const tall = bar.single ? (height ?? 0) + space : model.tall;
  return [
    apart(bar.tall, tall) && 'height',
    apart(bar.above, around) && 'top',
    apart(bar.below, space) && 'bottom',
    apart(bar.before, around) && 'left',
    bar.endsRight && apart(bar.after, around) && 'right',
    bar.gaps.some((each) => apart(each, space)) && 'gaps',
    bar.heights.some((each) => height === undefined || apart(each, height)) &&
      'buttons',
  ].filter((part) => part !== false);
}

for (const scale of ['1', '1.25', '1.5']) {
  suite(`App toolbars alike at ${scale}`, () => {
    let folder: string;
    let app: ElectronApplication;
    let page: Page;

    const bars = (what: string) =>
      untilSettled(() => page.evaluate(barsShown), `the bars of ${what}`);

    const show = async (tool: Tool) => {
      await page.locator('.tabs .tab').nth(tools.indexOf(tool)).click();
      if (tool === 'git') {
        await commitRow(page, 'files').waitFor();
        await page.locator('.virtual-rows.list').first().focus();
        await page.keyboard.press('h');
        await page.locator('.diff-view .file-header').first().waitFor();
      }
      await page.mouse.move(600, 500);
      return bars(tool);
    };

    beforeAll(async () => {
      folder = tempFolder(`toolbars-${scale.replace('.', '-')}`);
      const profile = path.join(folder, 'profile');
      const opened = path.join(folder, 'opened');
      fs.mkdirSync(profile);
      fs.mkdirSync(opened);
      const one = path.join(opened, 'one.ts');
      const two = path.join(opened, 'two.ts');
      fs.writeFileSync(one, 'const one = 1;\n');
      fs.writeFileSync(two, 'const two = 2;\n');
      const repository = await tempRepository(path.join(folder, 'repo'));
      fs.writeFileSync(path.join(repository.root, 'a.ts'), 'const a = 1;\n');
      await repository.git('add', '.');
      await repository.git('commit', '-m', 'files');
      fs.writeFileSync(
        path.join(profile, 'state.json'),
        JSON.stringify({
          tabs: [
            { id: '1', tool: 'commander', root: opened },
            { id: '2', tool: 'viewer', root: one },
            { id: '3', tool: 'editor', root: one },
            { id: '4', tool: 'git', root: repository.root },
            { id: '5', tool: 'diff', compare: { old: one, new: two } },
          ],
          activeTab: '1',
        }),
      );
      app = await launchApp(profile, {
        scale: Number(scale),
      });
      page = await app.firstWindow();
      await page.locator('.commander-pane').first().waitFor();
    });

    afterAll(async () => {
      await closeOrKill(app);
      removeFolder(folder);
    });

    test('stands the buttons of every header that has room for them at its top and at its start, and at its end where it has buttons there, with the space of a bar under them alone and between one another, all of one height, the same in every tool, its bars standing outside the frame of the block below, as each header had spaces of its own, wider between some buttons than others and closer to one edge than another', async () => {
      const [model] = await show('git');
      assert.ok(model);
      assert.ok(model.below > 0, JSON.stringify(model));
      assert.ok(model.gaps.length > 0, JSON.stringify(model));
      const off: string[] = [];
      let seen = 0;
      let single = 0;
      for (const tool of tools) {
        for (const bar of (await show(tool)).filter((each) => each.fits)) {
          seen += 1;
          single += Number(bar.single);
          const parts = unlike(bar, model);
          if (parts.length > 0) {
            off.push(
              `${tool} ${bar.name}: ${parts.join(', ')} ${JSON.stringify(bar)}`,
            );
          }
        }
      }
      assert.deepStrictEqual(off, []);
      assert.ok(seen >= fitting, String(seen));
      assert.strictEqual(single, seen);
    });

    test('keeps the first and the last button of a header where they were as its search opens in their place, the search of the commits alone opening so as every other floats over what it searches, the field between them, the bar of the search spaced as its header is, wherever both have room, so no button moves under the pointer that opened it', async () => {
      const [model] = await show('git');
      assert.ok(model);
      const moved: string[] = [];
      let opened = 0;
      for (const tool of tools) {
        const closed = await show(tool);
        const buttons = page.locator('.search-button:visible');
        assert.strictEqual(await buttons.count(), searches[tool], tool);
        for (let index = 0; index < searches[tool]; index += 1) {
          const button = buttons.nth(index);
          const at = await button.evaluate(
            (element) => element.getBoundingClientRect().right,
          );
          const before = closed.find((bar) => !apart(bar.right, at));
          await button.click();
          await page.locator('.search-box-input:focus').waitFor();
          const open = (await bars(`the search of ${tool}`)).find(
            (bar) => bar.searching,
          );
          await page.keyboard.press('Escape');
          await page.locator('.search-box-input:focus').waitFor({
            state: 'detached',
          });
          if (before?.fits !== true || open?.fits !== true) {
            continue;
          }
          opened += 1;
          if (
            apart(open.left, before.left) ||
            apart(open.right, before.right) ||
            unlike(open, model).length > 0
          ) {
            moved.push(
              `${tool} ${String(index)}: ${JSON.stringify({ before, open })}`,
            );
          }
        }
      }
      assert.deepStrictEqual(moved, []);
      assert.ok(opened >= 1, String(opened));
    });

    test('draws the row naming the file under the header of the viewer, the editor and a comparison of two files, and the repository above the columns of git, alike, as tall as a row of text, its name as far from the start and the top of the row in each, as the row of the viewer and the editor stood a pixel taller than the header of the diff, its name half a pixel lower', async () => {
      const rows: Record<string, unknown> = {};
      for (const tool of ['viewer', 'editor', 'diff', 'git'] as const) {
        await show(tool);
        rows[tool] = await untilSettled(
          () =>
            page.evaluate(() => {
              const row = document.querySelector(
                '.path-row, .compare-view .diff-view .file-header',
              );
              const name = row?.querySelector('.path-part');
              if (!row || !name) {
                return undefined;
              }
              const box = row.getBoundingClientRect();
              const text = name.getBoundingClientRect();
              return Object.fromEntries(
                Object.entries({
                  height: box.height,
                  left: text.left - box.left,
                  top: text.top - box.top,
                  tall: text.height,
                }).map(([key, value]) => [key, Math.round(value * 100) / 100]),
              );
            }),
          `the row naming the file of the ${tool}`,
        );
      }
      assert.ok(rows.viewer, JSON.stringify(rows));
      assert.deepStrictEqual(rows, {
        viewer: rows.viewer,
        editor: rows.viewer,
        diff: rows.viewer,
        git: rows.viewer,
      });
    });
  });
}
