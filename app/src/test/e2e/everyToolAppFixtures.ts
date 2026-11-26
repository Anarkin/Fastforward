import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { tempRepository } from '../helpers/repositories';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import {
  comesBackFromEach,
  settledLooks,
  showTab,
  sizedWindow,
  tabs,
} from './tabReturns';
import { clickLine, linesCount } from './commanderRows';

const lines = (count: number, line: (index: number) => string) =>
  Array.from({ length: count }, (_, index) => line(index)).join(
    String.fromCharCode(10),
  );

const longText = lines(400, (index) =>
  index % 40 === 7
    ? `${index} adam ${'wide '.repeat(40)}`
    : `${index} ${'line '.repeat(index % 30)}`,
);

export const shownTabs = (opened: string, repository: string) =>
  [
    { kind: 'commander', tab: { tool: 'commander', root: opened } },
    {
      kind: 'viewer',
      tab: { tool: 'viewer', root: path.join(opened, 'long.txt') },
    },
    {
      kind: 'editor',
      tab: { tool: 'editor', root: path.join(opened, 'edited.txt') },
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
    {
      kind: 'diff',
      tab: {
        tool: 'diff',
        compare: {
          old: path.join(opened, 'long.txt'),
          new: path.join(opened, 'compared.txt'),
        },
      },
    },
  ] as const;

export const everyTab = 600_000;

export const kinds = shownTabs('', '').map((tab) => tab.kind);

let folder: string;
export let settingsFile: string;
export let app: ElectronApplication;
export let page: Page;

export function sharedEveryToolApp(): void {
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
      path.join(opened, 'compared.txt'),
      longText.replaceAll('adam', 'eve'),
    );
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
    await clickLine(page, left, /^/);
    await page.keyboard.press('Control+Shift+F6');
    await page.locator('.prompt-input').waitFor();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(listed);
    await page.keyboard.press('Enter');
    await waitFor(
      async () => (await linesCount(left, 'entry 0')) > 0,
      'the left side in a folder of the test',
    );
  });

  afterAll(async () => {
    if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });
}

export const throughEveryOther = (index: number, what: string) =>
  comesBackFromEach(
    page,
    [...kinds.keys()].filter((away) => away !== index),
    (away) => `${what} left for the ${kinds[away]} tab`,
  );

export async function searchTheViewer(): Promise<void> {
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
}

export async function searchEveryTab(
  searched: (index: number, kind: string) => Promise<unknown> = async () =>
    undefined,
): Promise<void> {
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
    await searched(index, kind);
  }
}
