import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { tempRepository } from '../helpers/repositories';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { untilSettled } from './waits';

const tools = ['commander', 'viewer', 'editor', 'git', 'diff'] as const;

type Tool = (typeof tools)[number];

const searches: Record<Tool, number> = {
  commander: 2,
  viewer: 1,
  editor: 1,
  git: 3,
  diff: 1,
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
      };
    });
}

const apart = (one: number, other: number) => Math.abs(one - other) > 0.1;

function unlike(bar: Bar, model: Bar): string[] {
  const [height] = model.heights;
  return [
    apart(bar.tall, model.tall) && 'height',
    apart(bar.above, model.above) && 'top',
    apart(bar.below, model.above) && 'bottom',
    apart(bar.before, model.above) && 'left',
    apart(bar.after, model.above) && 'right',
    bar.gaps.some((each) => apart(each, model.above)) && 'gaps',
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
        await page
          .locator('.virtual-rows.list .virtual-row', { hasText: 'files' })
          .first()
          .waitFor();
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
        before: [`--force-device-scale-factor=${scale}`],
      });
      page = await app.firstWindow();
      await page.locator('.commander-pane').first().waitFor();
    });

    afterAll(async () => {
      await closeOrKill(app);
      removeFolder(folder);
    });

    test('stands the buttons of every header as far from its top as from its bottom, from either end and from one another, all of one height in headers of one height, the same in every tool, as each header had spaces of its own, wider between some buttons than others and closer to one edge than another', async () => {
      const [model] = await show('commander');
      assert.ok(model);
      assert.ok(model.above > 0, JSON.stringify(model));
      assert.ok(model.gaps.length > 0, JSON.stringify(model));
      const off: string[] = [];
      let seen = 0;
      for (const tool of tools) {
        for (const bar of await show(tool)) {
          seen += 1;
          const parts = unlike(bar, model);
          if (parts.length > 0) {
            off.push(
              `${tool} ${bar.name}: ${parts.join(', ')} ${JSON.stringify(bar)}`,
            );
          }
        }
      }
      assert.deepStrictEqual(off, []);
      assert.strictEqual(seen, 8);
    });

    test('keeps the first and the last button of a header where they were as its search opens in their place, the field between them, the bar of the search spaced as every header is, so no button moves under the pointer that opened it', async () => {
      const [model] = await show('commander');
      assert.ok(model);
      const moved: string[] = [];
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
          if (
            before === undefined ||
            open === undefined ||
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
    });
  });
}
