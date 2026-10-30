import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
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
    : { shell: '/bin/bash', shellArgs: ['--norc', '--noprofile'] };

function luminance(color: string): number {
  const [red = 0, green = 0, blue = 0] = (color.match(/\d+/g) ?? []).map(
    (channel) => {
      const value = Number(channel) / 255;
      return value <= 0.039_28
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    },
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const [darker, lighter] = [
    luminance(foreground),
    luminance(background),
  ].toSorted((a, b) => a - b);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

function runningWith(marker: string): number {
  if (process.platform === 'win32') {
    const counted = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*${marker}*' }).Count`,
      ],
      { encoding: 'utf8' },
    );
    return Number(counted.trim());
  }
  return execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.includes(marker)).length;
}

function sameFolder(told: string, expected: string): boolean {
  if (!fs.existsSync(told)) {
    return false;
  }
  const [real, wanted] = [told, expected].map((each) =>
    fs.realpathSync.native(each),
  );
  return process.platform === 'win32'
    ? real?.toLowerCase() === wanted?.toLowerCase()
    : real === wanted;
}

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

  test('lightens or darkens text to stay readable on its background, even blue on blue', async () => {
    await run(
      process.platform === 'win32'
        ? `Write-Host "$([char]27)[34;44m$('hid' + 'den')$([char]27)[0m"`
        : `printf '\\033[34;44m%s%s\\033[0m\\n' hid den`,
    );
    const hidden = page.locator('.terminal-screen .xterm-rows span', {
      hasText: /^hidden$/,
    });
    await hidden.waitFor();
    const painted = await hidden.evaluate((span) => {
      const style = getComputedStyle(span);
      return { color: style.color, background: style.backgroundColor };
    });
    assert.ok(
      contrast(painted.color, painted.background) >= 4.5,
      JSON.stringify(painted),
    );
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

  test('asks before closing a terminal tab, keeping it on Escape and closing it on Enter, ending what runs in it', async () => {
    const tabs = page.locator('.tabs .tab');
    await page.locator('.tab-add').click();
    await page
      .locator('.context-menu .menu-item', { hasText: strings.tools.terminal })
      .click();
    await waitFor(async () => (await tabs.count()) === 2, 'a second tab');
    await page.locator('.terminal-screen .xterm-rows').waitFor();
    const marker = `fastforward-orphan-check-${Date.now()}`;
    await run(
      process.platform === 'win32'
        ? `pwsh -NoLogo -NoProfile -Command "Start-Sleep 600; '${marker}'"`
        : `sh -c 'sleep 600; echo ${marker}'`,
    );
    await waitFor(() => runningWith(marker) > 0, 'the program to run');
    const popup = page.locator('.confirm-popup');
    await page.keyboard.press('ControlOrMeta+Shift+W');
    await popup.waitFor();
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
    assert.strictEqual(await tabs.count(), 2);
    await page.locator('.terminal-screen').click();
    await page.keyboard.press('ControlOrMeta+Shift+W');
    await popup.waitFor();
    await page.keyboard.press('Enter');
    await waitFor(async () => (await tabs.count()) === 1, 'the tab to close');
    await waitFor(
      () => runningWith(marker) === 0,
      'the program in it to end',
      15_000,
    );
  });

  test('opens the folder the shell is in in another tool on Ctrl+Shift+O, offering every tool but the Terminal', async () => {
    const inner = path.join(folder, 'work', 'inner');
    fs.mkdirSync(inner);
    const tabs = page.locator('.tabs .tab');
    const popup = page.locator('.open-with-popup');
    const shown = popup.locator('.open-with-folders > span');
    await run('cd inner');
    await waitFor(async () => {
      await page.locator('.terminal-screen').click();
      await page.keyboard.press('ControlOrMeta+Shift+O');
      await popup.waitFor();
      if (sameFolder((await shown.textContent()) ?? '', inner)) {
        return true;
      }
      await page.keyboard.press('Escape');
      await popup.waitFor({ state: 'detached' });
      return false;
    }, 'the folder the shell went to');
    assert.deepStrictEqual(
      await popup
        .locator('.open-with-tool')
        .evaluateAll((buttons: HTMLButtonElement[]) =>
          buttons.map((button) => [button.dataset.tool, button.disabled]),
        ),
      [
        ['git', true],
        ['files', false],
        ['terminal', true],
      ],
    );
    await page.keyboard.press('Enter');
    await waitFor(async () => (await tabs.count()) === 2, 'a second tab');
    assert.ok(
      sameFolder((await tabs.nth(1).getAttribute('title')) ?? '', inner),
    );
    await page.keyboard.press('ControlOrMeta+Shift+W');
    await waitFor(async () => (await tabs.count()) === 1, 'the tab to close');
    await page.locator('.terminal-screen .xterm-rows').waitFor();
  });

  test('asks before quitting while a terminal tab is open, staying open on Cancel and quitting on Enter', async () => {
    const close = () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.close(),
      );
    const popup = page.locator('.confirm-popup');
    await close();
    await popup.waitFor();
    await popup.locator('.confirm-button', { hasText: 'Cancel' }).click();
    await popup.waitFor({ state: 'detached' });
    assert.strictEqual(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      ),
      1,
    );
    const quit = app.waitForEvent('close');
    await close();
    await popup.waitFor();
    const pressed = page.keyboard.press('Enter').catch(() => undefined);
    await quit;
    await pressed;
  });
});
