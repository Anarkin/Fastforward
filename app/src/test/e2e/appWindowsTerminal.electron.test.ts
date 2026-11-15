import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { closeOrKill, launchApp } from './appLaunch';
import { shownWindows } from './windowFixtures';
import { waitFor } from '../helpers/fixtures';
import { removeFolder, tempFolder } from '../helpers/tempFolders';

const shell =
  process.platform === 'win32'
    ? { shell: '', shellArgs: ['-NoLogo', '-NoProfile'] }
    : { shell: '/bin/bash', shellArgs: ['--norc', '--noprofile'] };

let folder: string;
let app: ElectronApplication;
let page: Page;

const rowShown = (wanted: string) =>
  waitFor(
    async () =>
      (
        await page
          .locator('.terminal-screen .xterm-rows > div')
          .evaluateAll((rows) =>
            rows.map((row) =>
              (row.textContent ?? '').replaceAll(' ', ' ').trimEnd(),
            ),
          )
      ).includes(wanted),
    wanted,
    30_000,
  );

async function run(command: string): Promise<void> {
  await page.locator('.terminal-screen').click();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
}

suite('Terminal in a window a tab leaves', () => {
  beforeAll(async () => {
    folder = tempFolder('windows-terminal');
    const profile = path.join(folder, 'profile');
    const work = path.join(folder, 'work');
    fs.mkdirSync(profile, { recursive: true });
    fs.mkdirSync(work);
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [
          { id: '1', tool: 'terminal', root: work },
          { id: '2', tool: 'commander', root: work },
        ],
        activeTab: '1',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({ tools: { terminal: { ...shell, renderer: 'dom' } } }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await page.locator('.terminal-screen .xterm-rows').waitFor();
  });

  afterAll(async () => {
    await closeOrKill(app);
    removeFolder(folder);
  });

  test('goes on showing what the shell of the terminal shown prints once a tab behind it is moved to a new window, as it froze until another tab was shown', async () => {
    await run('echo before-move');
    await rowShown('before-move');
    await page.locator('.tabs [role="tab"]').nth(1).click({ button: 'right' });
    await page
      .locator('.context-menu .menu-item', {
        hasText: strings.tabs.moveToNewWindow,
      })
      .click();
    await shownWindows(app, 2);
    await run('echo after-move');
    await rowShown('after-move');
  });
});
