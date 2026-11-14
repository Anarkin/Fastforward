import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { closeOrKill, launchApp } from './appFixtures';
import { waitFor } from '../helpers/fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
} from '../helpers/repositories';

interface ButtonLayout {
  readonly gaps: readonly number[];
  readonly widths: readonly number[];
}

const buttonsOf = (page: Page): Promise<ButtonLayout> =>
  page.evaluate(() => {
    const gaps: number[] = [];
    const widths: number[] = [];
    for (const title of document.querySelectorAll('.column-title')) {
      const buttons = [...title.querySelectorAll('.nav-button')]
        .map((button) => ({
          round: !button.matches('.labelled, .arrowed'),
          box: button.getBoundingClientRect(),
          group: button.closest('.column-start, .column-actions'),
        }))
        .filter(({ box }) => box.width > 0 && box.height > 0)
        .toSorted((one, other) => one.box.left - other.box.left);
      buttons.forEach(({ round, box, group }, at) => {
        if (round) {
          widths.push(box.width * devicePixelRatio);
        }
        const next = buttons[at + 1];
        if (next !== undefined && next.group === group) {
          gaps.push((next.box.left - box.right) * devicePixelRatio);
        }
      });
    }
    return { gaps, widths };
  });

const whole = (values: readonly number[]) =>
  values.every((value) => Math.abs(value - Math.round(value)) < 0.02);

const distinct = (values: readonly number[]) =>
  [...new Set(values.map((value) => Math.round(value)))].toSorted(
    (one, other) => one - other,
  );

suite('App buttons', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('app-buttons');
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first', { 'a.txt': 'one\n' });
    await repository.commit('second', { 'a.txt': 'two\n' });
    const profile = path.join(folder, 'profile');
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
    app = await launchApp(profile);
    page = await app.firstWindow();
    await page.locator('.commit', { hasText: 'second' }).waitFor();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  test('spaces the buttons of every header alike at 125%, each gap and each round button a whole number of screen pixels, as Chromium drew a gap of 2.5 pixels as 2 or 3 and a button of 32.5 as 32 or 33', async () => {
    const display = await page.evaluate(() => devicePixelRatio);
    await app.evaluate(
      ({ BrowserWindow }, zoom) =>
        BrowserWindow.getAllWindows()
          .toSorted((a, b) => a.id - b.id)[0]
          ?.webContents.setZoomFactor(zoom),
      1.25 / display,
    );
    await waitFor(
      () =>
        page.evaluate(
          () =>
            devicePixelRatio === 1.25 &&
            getComputedStyle(document.documentElement)
              .getPropertyValue('--device-pixel')
              .trim() === '0.8px',
        ),
      'the window zoomed to 125%',
    );
    await page.locator('.commit', { hasText: 'second' }).click();
    await page
      .locator('.diff-line')
      .filter({ visible: true })
      .first()
      .waitFor();
    const git = await buttonsOf(page);
    await page
      .locator('.tabs .tab', { hasText: strings.tools.commander })
      .click();
    const right = page.locator('.commander-pane').nth(1);
    await right.locator('.commander-row', { hasText: 'atxt' }).click();
    const commander = await buttonsOf(page);
    await page.keyboard.press('F3');
    await page.locator('.viewer').waitFor();
    const viewer = await buttonsOf(page);
    const all = [git, commander, viewer];
    const gaps = all.flatMap((layout) => layout.gaps);
    const widths = all.flatMap((layout) => layout.widths);

    assert.ok(git.gaps.length > 10 && commander.gaps.length > 6);
    assert.ok(viewer.gaps.length > 4);
    assert.ok(whole(gaps), gaps.join());
    assert.strictEqual(distinct(gaps.filter((gap) => gap < 10)).length, 1);
    assert.ok(whole(widths), widths.join());
    assert.deepStrictEqual(distinct(widths).length, 1);
  });
});
