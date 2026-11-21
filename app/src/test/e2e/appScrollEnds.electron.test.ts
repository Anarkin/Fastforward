import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { closeOrKill, launchApp } from './appLaunch';
import { scrollbarProfile, settingsWith } from './scrollbarFixture';
import { everyView, views, type ViewName } from './scrollbarViews';
import { waitFor } from '../helpers/fixtures';
import { untilSettled } from './waits';

const endKeys: Record<ViewName, string> = {
  commander: 'End',
  viewer: 'End',
  editor: 'ControlOrMeta+End',
  diff: 'End',
  'commit list': 'End',
};

const focused: Record<ViewName, string> = {
  commander: views.commander.vertical,
  viewer: '.viewer-body',
  editor: '.editor .cm-content',
  diff: views.diff.vertical,
  'commit list': views['commit list'].vertical,
};

suite('App scrolled to its ends', () => {
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    const profile = await scrollbarProfile();
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify(settingsWith(true)),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
  });

  afterAll(async () => {
    await closeOrKill(app);
  });

  test('glides every view to as far as the browser scrolls it, on the key that goes to its end and on the wheel turned on and on, rather than to the end the sizes it rounds give, so the end of a list or a text is never left a fraction of a pixel out of sight', async () => {
    const seen: Record<string, { stopped: number; furthest: number }> = {};
    const scrolledTo = async (name: ViewName, how: 'key' | 'wheel') => {
      const view = views[name];
      await page.locator('.tabs .tab').nth(view.tab).click();
      await page.locator(view.rows).nth(5).waitFor();
      await page.locator(focused[name]).first().focus();
      await page.keyboard.press(
        name === 'editor' ? 'ControlOrMeta+Home' : 'Home',
      );
      const scroller = page.locator(view.vertical).first();
      await untilSettled(
        () => scroller.evaluate((element) => element.scrollTop),
        `the ${name} at its start`,
      );
      if (how === 'key') {
        await page.keyboard.press(endKeys[name]);
      } else {
        const box = await scroller.boundingBox();
        assert.ok(box, `the ${name} has no box`);
        await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
        for (let notch = 0; notch < 300; notch++) {
          await page.mouse.wheel(0, 100);
        }
      }
      await waitFor(
        async () =>
          (await scroller.evaluate((element) => element.scrollTop)) > 0,
        `the ${name} to leave its start`,
      );
      const stopped = await untilSettled(
        () => scroller.evaluate((element) => element.scrollTop),
        `the ${name} to come to rest at its end`,
      );
      const furthest = await scroller.evaluate((element) => {
        const was = element.scrollTop;
        element.scrollTop = Number.MAX_SAFE_INTEGER;
        const most = element.scrollTop;
        element.scrollTop = was;
        return most;
      });
      seen[`${name} by ${how}`] = { stopped, furthest };
    };
    for (const name of everyView) {
      if (name !== 'commit list') {
        await scrolledTo(name, 'key');
      }
      await scrolledTo(name, 'wheel');
    }
    assert.ok(
      Object.values(seen).every(
        ({ stopped, furthest }) => Math.abs(stopped - furthest) < 0.01,
      ),
      JSON.stringify(seen),
    );
  });
});
