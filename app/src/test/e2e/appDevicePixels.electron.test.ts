import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { suite, test } from 'vitest';
import { closeOrKill, launchApp } from './appLaunch';
import { barOf, barParts, paintedAt } from './scrollbarsShown';
import { waitFor } from '../helpers/fixtures';
import { tempRepository } from '../helpers/repositories';
import { removeFolder, tempFolder } from '../helpers/tempFolders';

function thinLinesOffPixels(): string[] {
  const ratio = devicePixelRatio;
  const thinnest = 3;
  const off: [Element, string, string, number][] = [];
  const check = (
    element: Element,
    pseudo: string,
    wide: number,
    tall: number,
  ) => {
    for (const [side, length] of [
      ['wide', wide],
      ['tall', tall],
    ] as const) {
      const device = length * ratio;
      if (
        device > 0 &&
        device < thinnest &&
        Math.abs(device - Math.round(device)) >= 1 / 64
      ) {
        off.push([element, pseudo, side, device]);
      }
    }
  };
  for (const element of document.querySelectorAll('body *')) {
    for (const pseudo of ['::before', '::after']) {
      const drawn = getComputedStyle(element, pseudo);
      if (
        !['none', 'normal'].includes(drawn.content) &&
        drawn.display !== 'none'
      ) {
        check(
          element,
          pseudo,
          parseFloat(drawn.width),
          parseFloat(drawn.height),
        );
      }
    }
    const style = getComputedStyle(element);
    const painted =
      !/^(?:transparent|rgba\(\d+, \d+, \d+, 0\))$/.test(
        style.backgroundColor,
      ) || style.backgroundImage !== 'none';
    if (style.visibility === 'visible' && painted) {
      const { width, height } = element.getBoundingClientRect();
      check(element, '', width, height);
    }
  }
  return [
    ...new Set(
      off.map(([element, pseudo, side, device]) => {
        const parts: string[] = [];
        for (
          let at: Element | null = element;
          at !== null && at !== document.body && parts.length < 3;
          at = at.parentElement
        ) {
          parts.unshift(
            [at.tagName.toLowerCase(), ...[...at.classList].slice(0, 2)].join(
              '.',
            ),
          );
        }
        return `${parts.join(' > ')}${pseudo} ${side} ${device} device pixels`;
      }),
    ),
  ];
}

async function coverMisses(
  app: ElectronApplication,
  page: Page,
): Promise<string[]> {
  await page.keyboard.press('Escape');
  await page.locator('.shortcuts-popup').waitFor({ state: 'detached' });
  await page.locator('.tabs [role="tab"]').first().click();
  const ratio = await page.evaluate(() => devicePixelRatio);
  const misses: string[] = [];
  for (const list of ['.diff-view > .virtual-rows']) {
    await page.mouse.move(2, 2);
    await waitFor(
      () =>
        page.evaluate(
          () => document.querySelector('[data-scrollbar-hover]') === null,
        ),
      'no scrollbar to be pointed at',
    );
    const { box } = await barOf(page, list, 'vertical');
    const { thumb } = await barParts(page, box, 'vertical');
    const y = thumb === undefined ? box.top + 4 : thumb.top + thumb.height + 6;
    const from = Math.floor(box.left * ratio) - 3;
    const columns = Array.from({ length: 7 }, (_, index) => from + index);
    const [inside, ...drawn] = await paintedAt(app, page, [
      { x: box.left + box.width / 2, y },
      ...columns.map((x) => ({ x: x / ratio, y })),
    ]);
    const first = columns.find(
      (_, index) =>
        index > 0 && drawn[index] === inside && drawn[index - 1] !== inside,
    );
    await page.mouse.move(box.left + box.width / 2, y);
    await waitFor(
      () =>
        page.evaluate(
          () =>
            document.querySelector('.scrollbar-cover.vertical.shown') !== null,
        ),
      `the scrollbar of ${list} to be pointed at`,
    );
    const hits = await page.evaluate(
      ({ at, row, scale }) =>
        at.map(
          (x) =>
            document
              .elementFromPoint(x / scale, row)
              ?.closest('.scrollbar-cover') !== null,
        ),
      {
        at: first === undefined ? [] : [first - 1, first],
        row: y,
        scale: ratio,
      },
    );
    const [before, on] = hits;
    if (first === undefined || before === undefined || before || !on) {
      misses.push(
        `${list} drawn from device column ${first} takes the pointer ${JSON.stringify(hits)} on the column before it and on it`,
      );
    }
  }
  await page.mouse.move(2, 2);
  return misses;
}

async function viewsOf(page: Page): Promise<Record<string, string[]>> {
  const seen: Record<string, string[]> = {};
  const look = async (name: string) => {
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => setTimeout(resolve));
        }),
    );
    seen[name] = await page.evaluate(thinLinesOffPixels);
  };
  await page.locator('.commit', { hasText: 'second' }).click();
  await page.locator('.diff-line.added').first().waitFor();
  await look('git');
  seen['tab row'] = await page.evaluate(() => {
    const end =
      (document.querySelector('.tabs')?.getBoundingClientRect().bottom ?? 0) *
      devicePixelRatio;
    return Math.abs(end - Math.round(end)) < 1 / 64
      ? []
      : [`ends ${end} device pixels down`];
  });
  await page
    .locator('.columns > .column')
    .first()
    .locator('.column-actions > .search-button')
    .click();
  await page.locator('.locations-popup .search-box-input').waitFor();
  await page.keyboard.type('s');
  await look('commit search');
  await page.keyboard.press('Escape');
  await page.locator('.locations-popup').waitFor({ state: 'detached' });
  await page.locator('.tabs .tab-add').hover();
  await page.locator('.card.tip').waitFor();
  await look('tooltip');
  await page.mouse.move(1, 1);
  await page.locator('.card.tip').waitFor({ state: 'detached' });
  await page.locator('.tabs [role="tab"]').nth(1).click();
  const right = page.locator('.commander-pane').nth(1);
  await right.locator('.commander-row', { hasText: 'changed' }).click();
  await look('commander');
  await page.keyboard.press('F7');
  await page.locator('.prompt-input').waitFor();
  await look('dialog');
  await page.keyboard.press('Escape');
  await page.locator('.prompt-input').waitFor({ state: 'detached' });
  await page.keyboard.press('F3');
  await page.locator('.viewer-rows .viewer-row').first().waitFor();
  await look('viewer');
  await page.keyboard.press('ControlOrMeta+F');
  await page.keyboard.type('changed');
  await page.locator('.scrollbar-mark').first().waitFor();
  await look('viewer found');
  await page.keyboard.press('Escape');
  await page.locator('.scrollbar-mark').first().waitFor({ state: 'detached' });
  await page.keyboard.press('F4');
  await page.locator('.editor .cm-content').waitFor();
  await look('editor');
  await page.keyboard.press('Escape');
  await page.locator('.editor').waitFor({ state: 'detached' });
  await page.keyboard.press('Escape');
  await page.locator('.viewer').waitFor({ state: 'detached' });
  await page.locator('.tab.closing').first().waitFor({ state: 'detached' });
  await page.locator('.tabs [role="tab"]').nth(2).click();
  await page.locator('.compare-view .diff-line.added').first().waitFor();
  await look('diff of two files');
  await page.locator('.tabs .tab-add').click();
  await page.locator('.menu').first().waitFor();
  await look('menu');
  await page.keyboard.press('Escape');
  await page.locator('.menu').first().waitFor({ state: 'detached' });
  await page.keyboard.press('F1');
  await page.locator('.shortcuts-popup').waitFor();
  await look('shortcuts');
  return seen;
}

suite('Thin lines on whole device pixels', () => {
  for (const scale of [1, 1.25, 1.5, 1.75]) {
    test(`draws every thin line of the git, commander, viewer, editor and diff tabs, the search of the commits, a dialog, a tooltip, a menu and the shortcuts a whole number of device pixels thick at ${scale * 100}%, ends the row of tabs on a whole device pixel and takes the pointer over a scrollbar from the first column of device pixels it is drawn on, as a line between pixels comes out one device pixel thick in one place and two in another, as the dividers of the tabs did at 125% and 175%, and the row of tabs ended on half of one at 150%, so every tool under it stood between pixels and the search of the commits could not scroll to the start of a row at its end, and the cover of a scrollbar stood 1/64 of a device pixel right of where the bar is drawn at 175%, so a press on its first column went to the scrollbar of the browser`, async () => {
      const folder = tempFolder('device-pixels');
      const profile = path.join(folder, 'profile');
      const app = await (async () => {
        const repository = await tempRepository(path.join(folder, 'repo'));
        await repository.commit('first', {
          'changed.txt': 'line\n'.repeat(2000),
        });
        await repository.commit('second', {
          'changed.txt': Array.from({ length: 2000 }, (_, at) =>
            at % 100 === 0 ? 'changed\n' : 'line\n',
          ).join(''),
        });
        fs.mkdirSync(profile, { recursive: true });
        fs.writeFileSync(path.join(folder, 'old.txt'), 'line\n'.repeat(300));
        fs.writeFileSync(
          path.join(folder, 'new.txt'),
          Array.from({ length: 300 }, (_, at) =>
            at % 30 === 0 ? 'changed\n' : 'line\n',
          ).join(''),
        );
        fs.writeFileSync(
          path.join(profile, 'state.json'),
          JSON.stringify({
            tabs: [
              { id: '1', tool: 'git', root: repository.root },
              { id: '2', tool: 'commander', root: repository.root },
              {
                id: '3',
                tool: 'diff',
                compare: {
                  old: path.join(folder, 'old.txt'),
                  new: path.join(folder, 'new.txt'),
                },
              },
            ],
            activeTab: '1',
          }),
        );
        return launchApp(profile, { scale });
      })();
      try {
        const page = await app.firstWindow();
        const seen = await viewsOf(page);
        seen['cover of a scrollbar'] = await coverMisses(app, page);
        assert.deepStrictEqual(
          seen,
          Object.fromEntries(Object.keys(seen).map((name) => [name, []])),
        );
      } finally {
        await closeOrKill(app);
        removeFolder(folder);
      }
    });
  }
});
