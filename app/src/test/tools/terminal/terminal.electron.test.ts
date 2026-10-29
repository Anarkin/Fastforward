import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../../../shared/strings';
import { closeOrKill, launchApp } from '../../appFixtures';
import { waitFor } from '../../fixtures';
import { removeFolder, tempFolder } from '../../repositories';

const shell =
  process.platform === 'win32'
    ? { shell: '', shellArgs: ['-NoLogo', '-NoProfile'] }
    : { shell: '/bin/sh', shellArgs: [] };

let folder: string;
let app: ElectronApplication;
let page: Page;

function rows(): Promise<string[]> {
  return page
    .locator('.terminal-screen .xterm-rows > div')
    .evaluateAll((divs) =>
      divs.map((div) =>
        (div.textContent ?? '').replaceAll('\u00a0', ' ').trimEnd(),
      ),
    );
}

function waitForRow(
  matches: (row: string) => boolean,
  what: string,
): Promise<void> {
  return waitFor(async () => (await rows()).some(matches), what, 30_000);
}

async function run(command: string): Promise<void> {
  await page.locator('.terminal-screen').click();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
}

suite('Terminal', () => {
  beforeAll(async () => {
    folder = tempFolder('terminal');
    const profile = path.join(folder, 'profile');
    const work = path.join(folder, 'work');
    fs.mkdirSync(profile, { recursive: true });
    fs.mkdirSync(work);
    fs.writeFileSync(path.join(work, 'marker-file.txt'), '');
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [{ id: '1', tool: 'terminal', root: work }],
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

  test('runs a shell in the folder of its tab, showing what it prints', async () => {
    await run('echo fastforward-ok');
    await waitForRow((row) => row === 'fastforward-ok', 'the echo');
    await run('ls');
    await waitForRow((row) => row.includes('marker-file.txt'), 'the listing');
  });

  test('keeps the shell running while the page reloads, showing what it printed before', async () => {
    await run('echo before-reload');
    await waitForRow((row) => row === 'before-reload', 'the first echo');
    await page.reload();
    await waitForRow((row) => row === 'before-reload', 'the restored screen');
    await run('echo after-reload');
    await waitForRow((row) => row === 'after-reload', 'the second echo');
  });

  test('starts a new shell on Enter once the shell exits', async () => {
    await run('exit');
    await waitForRow(
      (row) => row.includes(strings.terminal.exited(0)),
      'the exit to be told',
    );
    await page.keyboard.press('Enter');
    await run('echo restarted');
    await waitForRow((row) => row === 'restarted', 'the echo of the new shell');
  });
});
