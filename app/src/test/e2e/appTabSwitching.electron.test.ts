import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { tempRepository } from '../helpers/repositories';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { settledLooks, showTab, sizedWindow, tabs } from './tabReturns';

const longText = Array.from(
  { length: 400 },
  (_, index) => `${index} ${'line '.repeat(index % 30)}`,
).join('\n');

const kinds = ['commander', 'viewer', 'editor', 'diff', 'git'] as const;

function recordFrames(lasting: number): void {
  const bare = new Set([
    document.documentElement,
    document.body,
    document.querySelector('.app'),
  ]);
  const drawnAt = (x: number, y: number): string => {
    let element = document.elementFromPoint(x, y);
    while (element !== null) {
      if (bare.has(element)) {
        return 'bare';
      }
      const color = getComputedStyle(element).backgroundColor;
      if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
        return color.replace(/rgba?\(|\)| /g, '');
      }
      element = element.parentElement;
    }
    return 'bare';
  };
  const frames: string[] = [];
  Reflect.set(window, 'switchFrames', frames);
  Reflect.set(window, 'switchFramesEnded', false);
  const fewest = 12;
  const longest = 5000;
  const started = performance.now();
  const step = () => {
    frames.push(
      [0.2, 0.5, 0.8]
        .flatMap((x) =>
          [0.2, 0.5, 0.8].map((y) => drawnAt(innerWidth * x, innerHeight * y)),
        )
        .join(' '),
    );
    const lasted = performance.now() - started;
    if (lasted < lasting || (frames.length < fewest && lasted < longest)) {
      requestAnimationFrame(step);
    } else {
      Reflect.set(window, 'switchFramesEnded', true);
    }
  };
  requestAnimationFrame(step);
}

async function framesSwitchingTo(page: Page, index: number): Promise<string[]> {
  await page.evaluate(recordFrames, 800);
  await tabs(page).nth(index).click();
  await page.waitForFunction(
    () => Reflect.get(window, 'switchFramesEnded') === true,
  );
  const frames: unknown = await page.evaluate(() =>
    Reflect.get(window, 'switchFrames'),
  );
  assert.ok(Array.isArray(frames));
  assert.ok(frames.length > 10, `${frames.length} frames recorded`);
  return frames.map(String);
}

suite('App switching tabs', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('app-tab-switching');
    const profile = path.join(folder, 'profile');
    const opened = path.join(folder, 'opened');
    fs.mkdirSync(opened, { recursive: true });
    fs.writeFileSync(path.join(opened, 'long.txt'), longText);
    fs.writeFileSync(path.join(opened, 'edited.txt'), longText);
    fs.writeFileSync(path.join(opened, 'older.txt'), `${longText}\nolder`);
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first', { 'long.txt': longText });
    fs.mkdirSync(profile, { recursive: true });
    const roots = {
      commander: { root: opened },
      viewer: { root: path.join(opened, 'long.txt') },
      editor: { root: path.join(opened, 'edited.txt') },
      diff: {
        compare: {
          old: path.join(opened, 'older.txt'),
          new: path.join(opened, 'long.txt'),
        },
      },
      git: { root: repository.root },
    };
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: kinds.map((tool, index) => ({
          id: String(index + 1),
          tool,
          ...roots[tool],
        })),
        activeTab: '1',
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await sizedWindow(app);
    await waitFor(
      async () => (await tabs(page).count()) === kinds.length,
      'every tab',
    );
    await page.emulateMedia({ colorScheme: 'dark' });
    for (let index = 0; index < kinds.length; index++) {
      await showTab(page, index);
      await settledLooks(page);
    }
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  test('draws the tab switched to, or keeps the one left, in every frame, never the bare window between them, whichever tool it switches from and to', async () => {
    const bare: string[] = [];
    for (const [to, tool] of kinds.entries()) {
      for (const [from, left] of kinds.entries()) {
        if (from === to) {
          continue;
        }
        await showTab(page, from);
        await settledLooks(page);
        const frames = await framesSwitchingTo(page, to);
        const shownBare = frames.filter((frame) => frame.includes('bare'));
        if (shownBare.length > 0) {
          bare.push(
            `${left} to ${tool}: ${shownBare.length} of ${frames.length} frames bare`,
          );
        }
      }
    }
    assert.deepStrictEqual(bare, []);
  });
});
