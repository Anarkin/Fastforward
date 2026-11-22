import * as assert from 'node:assert';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { closeOrKill, launchApp } from './appLaunch';
import { writeSettings } from './settingsWritten';
import { untilSettled } from './waits';
import { untilRowsShown } from './rowsShown';
import { everyView, views, type ViewName } from './scrollbarViews';
import { scrollbarProfile, settingsWith } from './scrollbarFixture';

suite('App scroll heights', () => {
  let app: ElectronApplication;
  let page: Page;
  let profile: string;

  beforeAll(async () => {
    profile = await scrollbarProfile();
    app = await launchApp(profile);
    page = await app.firstWindow();
  });

  afterAll(async () => {
    await closeOrKill(app);
  });

  const show = async (name: ViewName) => {
    await page.locator('.tabs .tab').nth(views[name].tab).click();
    await untilRowsShown(page, views[name].rows, 6);
    await page.locator(views[name].vertical).first().waitFor();
    await page.mouse.move(2, 2);
  };

  const heightOf = (name: ViewName) =>
    page
      .locator(views[name].vertical)
      .first()
      .evaluate(async (element) => {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        return Math.round(element.scrollHeight);
      });

  const heightsWhileScrolled = async (name: ViewName) => {
    await show(name);
    const scroller = page.locator(views[name].vertical).first();
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    const heights = new Set([
      await untilSettled(() => heightOf(name), `${name} at its start`),
    ]);
    for (let step = 0; step < 60; step++) {
      const atEnd = await scroller.evaluate((element) => {
        element.scrollTop += element.clientHeight;
        return (
          element.scrollTop + element.clientHeight >= element.scrollHeight - 1
        );
      });
      heights.add(await heightOf(name));
      if (atEnd) {
        break;
      }
    }
    heights.add(await untilSettled(() => heightOf(name), `${name} at its end`));
    return [...heights];
  };

  test('keeps the height every view scrolls through the same while it scrolls from its start to its end, the text wrapped, within a few pixels short of a row, as the heights a text measures add up its fractions of a pixel, so its thumb keeps its size, as the editor guessed the heights of the lines it had not drawn yet from their length and the commit list a line of bubbles for a commit with sixty, and their thumbs grew as they drew them', async () => {
    await writeSettings(page, profile, settingsWith(true, true));
    const grown: string[] = [];
    for (const name of everyView) {
      const heights = await heightsWhileScrolled(name);
      if (Math.max(...heights) - Math.min(...heights) > 4) {
        grown.push(`${name}: ${heights.join(' -> ')}`);
      }
    }
    assert.deepStrictEqual(grown, []);
  });
});
