import * as path from 'node:path';
import { beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { strings } from '../../lib/shared/strings';
import {
  app,
  everyTab,
  kinds,
  page,
  searchEveryTab,
  searchTheViewer,
  settingsFile,
  sharedEveryToolApp,
  throughEveryOther,
} from './everyToolAppFixtures';
import {
  comesBackAfter,
  scrolledAround,
  settledLooks,
  showTab,
  sizedWindow,
  tabs,
} from './tabReturns';
import { writeSettings } from './settingsWritten';

async function scrolledAroundEach(how: string): Promise<void> {
  for (const [index, kind] of kinds.entries()) {
    await showTab(page, index);
    await settledLooks(page);
    await scrolledAround(page);
    await throughEveryOther(index, `The ${kind} tab ${how}`);
  }
}

suite('App tabs shown again once scrolled around while searching', () => {
  sharedEveryToolApp();

  beforeAll(async () => {
    await searchTheViewer();
    await searchEveryTab();
  }, everyTab);

  test(
    'brings back every tab scrolled around as it was left, every scroller of it where it was, from every other tab',
    () => scrolledAroundEach('scrolled around'),
    everyTab,
  );

  test(
    'brings them back alike where the settings have scrolling not glide, as the tabs were only ever left and shown again in the one way of scrolling the settings had by default, and a file viewed stayed between two rows the day that became the other',
    async () => {
      await writeSettings(page, path.dirname(settingsFile), {
        scrolling: { smooth: false },
      });
      await scrolledAroundEach('scrolled around without gliding');
    },
    everyTab,
  );

  test(
    'brings back every tab as it was left once the settings are saved, which reloads its window',
    async () => {
      for (const [index, kind] of kinds.entries()) {
        await showTab(page, index);
        await comesBackAfter(
          page,
          async () => {
            await writeSettings(page, path.dirname(settingsFile), {
              tabs: { recentFolders: 16 + index },
            });
            return page;
          },
          `The ${kind} tab once the settings are saved`,
        );
      }
    },
    everyTab,
  );

  test(
    'brings back every tab as it was left once it is moved to a window of its own',
    async () => {
      for (const kind of kinds.slice(0, -1)) {
        await page.bringToFront();
        await showTab(page, 0);
        await comesBackAfter(
          page,
          async () => {
            const opened = app.waitForEvent('window');
            await tabs(page).first().click({ button: 'right' });
            await page
              .locator('.context-menu .menu-item', {
                hasText: strings.tabs.moveToNewWindow,
              })
              .click();
            const moved = await opened;
            await moved.waitForLoadState();
            await waitFor(
              async () => (await tabs(moved).count()) === 1,
              'the tab in its window',
            );
            await sizedWindow(app);
            return moved;
          },
          `The ${kind} tab moved to a window of its own`,
        );
      }
    },
    everyTab,
  );
});
