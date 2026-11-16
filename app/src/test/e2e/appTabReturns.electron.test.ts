import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { tempRepository } from '../helpers/repositories';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { strings } from '../../lib/shared/strings';
import { tools } from '../../shell/shared/tools';
import { closeOrKill, launchApp } from './appLaunch';
import {
  comesBackAfter,
  comesBackAsLeft,
  scrolledAround,
  settledLooks,
  showTab,
  sizedWindow,
  tabs,
} from './tabReturns';

const lines = (count: number, line: (index: number) => string) =>
  Array.from({ length: count }, (_, index) => line(index)).join(
    String.fromCharCode(10),
  );

const longText = lines(400, (index) =>
  index % 40 === 7
    ? `${index} adam ${'wide '.repeat(40)}`
    : `${index} ${'line '.repeat(index % 30)}`,
);

const shownTabs = (opened: string, repository: string) =>
  [
    { kind: 'commander', tab: { tool: 'commander', root: opened } },
    {
      kind: 'viewer',
      tab: { tool: 'viewer', root: path.join(opened, 'long.txt') },
    },
    {
      kind: 'editor',
      tab: {
        tool: 'commander',
        root: path.join(opened, 'edited.txt'),
        edit: true,
      },
    },
    { kind: 'git', tab: { tool: 'git', root: repository } },
    { kind: 'terminal', tab: { tool: 'terminal', root: opened } },
    {
      kind: 'viewer',
      tab: {
        tool: 'commander',
        root: path.join(opened, 'readme.md'),
        view: true,
      },
    },
  ] as const;

const everyTab = 600_000;

const kinds = shownTabs('', '').map((tab) => tab.kind);

suite('App tabs shown again', () => {
  let folder: string;
  let settingsFile: string;
  let app: ElectronApplication;
  let page: Page;

  beforeAll(async () => {
    folder = tempFolder('app-tab-returns');
    const profile = path.join(folder, 'profile');
    settingsFile = path.join(profile, 'settings.user.json');
    const opened = path.join(folder, 'opened');
    fs.mkdirSync(opened, { recursive: true });
    for (let index = 0; index < 80; index++) {
      fs.writeFileSync(path.join(opened, `file ${index}.txt`), String(index));
    }
    const listed = path.join(folder, 'listed');
    fs.mkdirSync(listed);
    for (let index = 0; index < 80; index++) {
      fs.writeFileSync(path.join(listed, `entry ${index}.txt`), String(index));
    }
    fs.writeFileSync(path.join(opened, 'long.txt'), longText);
    fs.writeFileSync(path.join(opened, 'edited.txt'), longText);
    fs.writeFileSync(
      path.join(opened, 'readme.md'),
      lines(200, (index) => `Paragraph ${index}, adam.\n`),
    );
    const repository = await tempRepository(path.join(folder, 'repo'));
    await repository.commit('first', { 'long.txt': longText });
    await repository.commit('second', {
      'long.txt': longText.replaceAll('adam', 'eve'),
    });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: shownTabs(opened, repository.root).map(({ tab }, index) => ({
          id: String(index + 1),
          ...tab,
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
    const left = page.locator('.commander-pane').first();
    await left.locator('.commander-row').first().click();
    await page.keyboard.press('Control+Shift+F6');
    await page.locator('.prompt-input').waitFor();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(listed);
    await page.keyboard.press('Enter');
    await waitFor(
      async () =>
        (await left.locator('.commander-row', { hasText: 'entry 0' }).count()) >
        0,
      'the left side in a folder of the test',
    );
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });

  const throughEveryOther = async (index: number, what: string) => {
    for (let away = 0; away < kinds.length; away++) {
      if (away !== index) {
        await comesBackAsLeft(
          page,
          away,
          `${what} left for the ${kinds[away]} tab`,
        );
      }
    }
  };

  test('opens a tab of every tool the app has, so a tool added later is held to coming back as left too', () => {
    assert.deepStrictEqual(
      tools.filter(
        (tool) => !shownTabs('', '').some(({ tab }) => tab.tool === tool),
      ),
      [],
    );
  });

  test(
    'brings back a file viewed with its find open, its query, the match it was on and the caret in its box, from every other tab, of the same tool or another',
    async () => {
      await showTab(page, 1);
      await settledLooks(page);
      await page.keyboard.press('ControlOrMeta+F');
      await page.keyboard.type('adam');
      await waitFor(
        async () =>
          (
            (await page.locator('.viewer .search-count').textContent()) ?? ''
          ).endsWith('of 10'),
        'the matches counted',
      );
      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowLeft');
      await throughEveryOther(1, 'The viewer searching');
    },
    everyTab,
  );

  test(
    'brings back every search opened, typed in and toggled, with its caret, from every other tab',
    async () => {
      for (const [index, kind] of kinds.entries()) {
        if (kind === 'terminal') {
          continue;
        }
        await showTab(page, index);
        await settledLooks(page);
        await page.keyboard.press('ControlOrMeta+F');
        const typing = await page.evaluate(
          () => document.activeElement instanceof HTMLInputElement,
        );
        if (typing) {
          await page.keyboard.type('adam');
          await page.keyboard.press('ArrowLeft');
          await page.keyboard.press('ArrowLeft');
          await page
            .locator('.search-bar:has(:focus) .search-toggle')
            .first()
            .click();
        }
        await throughEveryOther(index, `The ${kind} tab searching`);
      }
    },
    everyTab,
  );

  test(
    'brings back every tab scrolled around as it was left, every scroller of it where it was, from every other tab',
    async () => {
      for (const [index, kind] of kinds.entries()) {
        await showTab(page, index);
        await settledLooks(page);
        await scrolledAround(page);
        await throughEveryOther(index, `The ${kind} tab scrolled around`);
      }
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
            const loaded = page.waitForEvent('load');
            fs.writeFileSync(
              settingsFile,
              JSON.stringify({ tabs: { recentFolders: 16 + index } }),
            );
            await loaded;
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
