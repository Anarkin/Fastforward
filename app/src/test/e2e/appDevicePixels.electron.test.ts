import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from 'playwright-core';
import { suite, test } from 'vitest';
import { closeOrKill, launchApp } from './appLaunch';
import { tempRepository } from '../helpers/repositories';
import { removeFolder, tempFolder } from '../helpers/tempFolders';

function thinLinesOffPixels(): string[] {
  const ratio = devicePixelRatio;
  const thinnest = 3;
  const found = new Set<string>();
  for (const element of document.querySelectorAll('body *')) {
    const style = getComputedStyle(element);
    const painted =
      !/^(?:transparent|rgba\(\d+, \d+, \d+, 0\))$/.test(
        style.backgroundColor,
      ) || style.backgroundImage !== 'none';
    if (style.visibility !== 'visible' || !painted) {
      continue;
    }
    const { width, height } = element.getBoundingClientRect();
    for (const [side, thick] of [
      ['wide', width],
      ['tall', height],
    ] as const) {
      const device = thick * ratio;
      if (
        device > 0 &&
        device < thinnest &&
        Math.abs(device - Math.round(device)) >= 1 / 64
      ) {
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
        found.add(`${parts.join(' > ')} ${side} ${device} device pixels`);
      }
    }
  }
  return [...found];
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
  await page.locator('.tabs [role="tab"]').nth(1).click();
  const right = page.locator('.commander-pane').nth(1);
  await right.locator('.commander-row', { hasText: 'changed' }).click();
  await look('commander');
  await page.keyboard.press('F3');
  await page.locator('.viewer-rows .viewer-row').first().waitFor();
  await look('viewer');
  await page.keyboard.press('F4');
  await page.locator('.editor .cm-content').waitFor();
  await look('editor');
  await page.keyboard.press('Escape');
  await page.locator('.editor').waitFor({ state: 'detached' });
  await page.keyboard.press('Escape');
  await page.locator('.viewer').waitFor({ state: 'detached' });
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
    test(`draws every thin line of the git, commander, viewer and editor tabs, a menu and the shortcuts a whole number of device pixels thick at ${scale * 100}%, as a line between pixels comes out one device pixel thick in one place and two in another, as the dividers of the tabs did at 125% and 175%`, async () => {
      const folder = tempFolder('device-pixels');
      const profile = path.join(folder, 'profile');
      const app = await (async () => {
        const repository = await tempRepository(path.join(folder, 'repo'));
        await repository.commit('first', {
          'changed.txt': 'line\n'.repeat(40),
        });
        await repository.commit('second', {
          'changed.txt': 'changed\n'.repeat(20) + 'line\n'.repeat(40),
        });
        fs.mkdirSync(profile, { recursive: true });
        fs.writeFileSync(
          path.join(profile, 'state.json'),
          JSON.stringify({
            tabs: [
              { id: '1', tool: 'git', root: repository.root },
              { id: '2', tool: 'commander', root: repository.root },
            ],
            activeTab: '1',
          }),
        );
        return launchApp(profile, { scale });
      })();
      try {
        const page = await app.firstWindow();
        const seen = await viewsOf(page);
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
