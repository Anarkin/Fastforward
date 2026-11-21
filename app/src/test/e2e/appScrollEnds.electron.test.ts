import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Locator, Page } from 'playwright-core';
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

const shrunkBy = [0, 1, 2, 3];

const everyHeightTime = 150_000;

const topOf = (scroller: Locator) =>
  scroller.evaluate((element) => element.scrollTop);

const furthestOf = (scroller: Locator) =>
  scroller.evaluate((element) => {
    const was = element.scrollTop;
    element.scrollTop = Number.MAX_SAFE_INTEGER;
    const most = element.scrollTop;
    element.scrollTop = was;
    return most;
  });

const restingAtEnd = async (name: ViewName, scroller: Locator) => {
  const stopped = await untilSettled(
    () => topOf(scroller),
    `the ${name} to come to rest at its end`,
  );
  return { stopped, furthest: await furthestOf(scroller) };
};

suite('App scrolled to its ends', () => {
  let app: ElectronApplication;
  let page: Page;
  let base: { readonly width: number; readonly height: number };

  beforeAll(async () => {
    const profile = await scrollbarProfile();
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify(settingsWith(true)),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    base = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
  });

  afterAll(async () => {
    await closeOrKill(app);
  });

  const sizedTo = async (height: number) => {
    await app.evaluate(
      ({ BrowserWindow }, [width, tall]) => {
        const window = BrowserWindow.getAllWindows().find((each) =>
          each.isVisible(),
        );
        window?.setMinimumSize(1, 1);
        window?.setContentSize(width, tall);
      },
      [base.width, height] as const,
    );
    return untilSettled(
      () => page.evaluate(() => innerHeight),
      'the window to take its height',
    );
  };

  const byKey = async (name: ViewName, scroller: Locator) => {
    await page.locator(focused[name]).first().focus();
    await page.keyboard.press(
      name === 'editor' ? 'ControlOrMeta+Home' : 'Home',
    );
    await untilSettled(() => topOf(scroller), `the ${name} at its start`);
    await page.keyboard.press(endKeys[name]);
    await waitFor(
      async () => (await topOf(scroller)) > 0,
      `the ${name} to leave its start`,
    );
    return restingAtEnd(name, scroller);
  };

  const byWheel = async (name: ViewName, scroller: Locator) => {
    await scroller.evaluate((element) => {
      element.scrollTop = Math.max(
        0,
        element.scrollHeight - 3 * element.clientHeight,
      );
    });
    const box = await scroller.boundingBox();
    assert.ok(box, `the ${name} has no box`);
    await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
    let was = await untilSettled(
      () => topOf(scroller),
      `the ${name} two views from its end`,
    );
    for (let batch = 0; batch < 20; batch++) {
      for (let notch = 0; notch < 10; notch++) {
        await page.mouse.wheel(0, 100);
      }
      const now = await untilSettled(
        () => topOf(scroller),
        `the ${name} to rest after a turn of the wheel`,
      );
      if (now === was) {
        break;
      }
      was = now;
    }
    return restingAtEnd(name, scroller);
  };

  for (const name of everyView) {
    test(
      `glides the ${name} to as far as the browser scrolls it, on the key that goes to its end and on the wheel turned on and on, in a window of every height a device pixel can fall at, rather than to the end the sizes it rounds give, so the end of a list or a text is never left a fraction of a pixel out of sight, as the editor and the commit list stopped a device pixel short of it at 175% in the window CI has`,
      async () => {
        const view = views[name];
        await page.locator('.tabs .tab').nth(view.tab).click();
        await page.locator(view.rows).nth(5).waitFor();
        const scroller = page.locator(view.vertical).first();
        const seen: Record<string, { stopped: number; furthest: number }> = {};
        try {
          for (const shrink of shrunkBy) {
            const tall = await sizedTo(base.height - shrink);
            if (name !== 'commit list') {
              seen[`by key, ${tall} tall`] = await byKey(name, scroller);
            }
            seen[`by wheel, ${tall} tall`] = await byWheel(name, scroller);
          }
        } finally {
          await sizedTo(base.height);
        }
        assert.ok(
          Object.values(seen).every(
            ({ stopped, furthest }) => Math.abs(stopped - furthest) < 0.01,
          ),
          JSON.stringify(seen),
        );
      },
      everyHeightTime,
    );
  }
});
