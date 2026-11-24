import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { strings } from '../../lib/shared/strings';
import { closeOrKill, launchApp } from './appLaunch';
import { barsOffGrid, gridLines } from './gridLines';
import { barOf, barParts } from './scrollbarsShown';
import { waitFor } from '../helpers/fixtures';
import { writeSettings } from './settingsWritten';
import { untilSettled } from './waits';
import { removeFolder, tempFolder } from '../helpers/tempFolders';

const hundredLines =
  process.platform === 'win32'
    ? '1..100 | % { "line$_" }'
    : 'for i in $(seq 1 100); do echo line$i; done';

const shell =
  process.platform === 'win32'
    ? { shell: '', shellArgs: ['-NoLogo', '-NoProfile'] }
    : { shell: '/bin/bash', shellArgs: ['--norc', '--noprofile'] };

const settingsWith = (smooth: boolean) => ({
  scrolling: { wheelRows: 2, smooth },
  tools: { terminal: { ...shell, renderer: 'dom' } },
});

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
let profile: string;
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
    profile = path.join(folder, 'profile');
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
      JSON.stringify(settingsWith(true)),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await page.locator('.terminal-screen .xterm-rows').waitFor();
  });

  afterAll(async () => {
    await closeOrKill(app);
    removeFolder(folder);
  });

  test('draws what a program prints on the grid the viewer and the diff draw text on, an emoji joined from several code points or asked for by a selector two cells, so the same text lines up alike everywhere, to a pixel of the cell its renderer puts it in', async () => {
    fs.writeFileSync(
      path.join(folder, 'work', 'grid.txt'),
      `${gridLines.join('\n')}\n`,
    );
    await run(
      process.platform === 'win32'
        ? 'Clear-Host; Get-Content -Encoding utf8 grid.txt'
        : 'clear; cat grid.txt',
    );
    const bars = page
      .locator('.terminal-screen .xterm-rows > div')
      .filter({ hasText: '|' });
    await waitFor(
      async () => (await bars.count()) === gridLines.length,
      'every line of the grid',
    );
    const offsets = await bars.evaluateAll(barsOffGrid);
    assert.deepStrictEqual(
      offsets.map((offset) => Math.abs(offset) < 1),
      gridLines.slice(1).map(() => true),
      JSON.stringify(offsets),
    );
  });

  test('runs a shell in the folder of its tab, showing what it prints', async () => {
    await run('echo fastforward-ok');
    await waitForRow((row) => row === 'fastforward-ok', 'the echo');
    await run('ls');
    await waitForRow((row) => row.includes('marker-file.txt'), 'the listing');
  });

  test('searches the output on Ctrl+Shift+F in a search floating over the terminal, coloring every match, counting them and stepping through them on Enter, and gives the keyboard back to the shell on Escape, the matches no longer colored', async () => {
    await run('echo needle-one needle-two needle-three');
    await waitForRow(
      (row) =>
        row === 'needle-three' ||
        (row.startsWith('needle-one') && row.endsWith('needle-three')),
      'the needles',
    );
    await page.keyboard.press('ControlOrMeta+Shift+F');
    const box = page.locator('.terminal .floating-search .search-box-input');
    await box.waitFor();
    await box.fill('needle-');
    const shown = async () => ({
      count: await page
        .locator('.terminal .floating-search .search-count')
        .evaluateAll((counts) => counts[0]?.textContent),
      colored: await page.locator('.terminal-screen .xterm-decoration').count(),
      current: await page
        .locator('.terminal-screen .terminal-find-current')
        .count(),
    });
    const found = await untilSettled(shown, 'the needles found');
    await box.press('Enter');
    const stepped = await untilSettled(shown, 'the next needle');
    await box.press('Escape');
    await page.locator('.terminal .floating-search').waitFor({
      state: 'detached',
    });
    const closed = await untilSettled(shown, 'the needles no longer colored');
    assert.deepStrictEqual(
      {
        found: { ...found, colored: found.colored >= 6 },
        stepped: stepped.count,
        closed: { colored: closed.colored, current: closed.current },
        shell: await page.evaluate(() =>
          document.activeElement?.classList.contains('xterm-helper-textarea'),
        ),
      },
      {
        found: { count: '1 of 6', colored: true, current: 1 },
        stepped: '2 of 6',
        closed: { colored: 0, current: 0 },
        shell: true,
      },
    );
  });

  test('scrolls back the rows of the setting for each notch of the wheel, at once and gliding there as the settings say, coming to rest on the same rows either way', async () => {
    await run(hundredLines);
    await waitForRow((row) => row === 'line100', 'the last line');
    for (const smooth of [false, true]) {
      await writeSettings(page, profile, settingsWith(smooth));
      await page.locator('.terminal-screen .xterm-rows').waitFor();
      await waitForRow((row) => /^line\d+$/.test(row), 'the lines again');
      const before = await rows();
      await page.locator('.terminal-screen').hover();
      await page.mouse.wheel(0, -100);
      const expected = JSON.stringify(before.slice(0, before.length - 2));
      await waitFor(
        async () => JSON.stringify((await rows()).slice(2)) === expected,
        `the terminal to scroll back two rows, gliding ${String(smooth)}`,
      );
    }
  });

  test('scrolls back as many rows as the wheel and the buttons of its scrollbar ask for while it glides, each starting where the glide before it was going rather than where it had come to, as two notches of two rows turned one after the other scrolled back three, and a press of a button right after a notch one', async () => {
    await page.locator('.terminal-screen').hover();
    await page.mouse.wheel(0, 1000);
    const last = await untilSettled(
      rows,
      'the terminal to rest on its last lines',
    );
    const backBy = async (lines: number, what: string) => {
      const expected = JSON.stringify(last.slice(0, last.length - lines));
      await waitFor(
        async () => JSON.stringify((await rows()).slice(lines)) === expected,
        what,
      );
    };
    await page.mouse.wheel(0, -100);
    await page.mouse.wheel(0, -100);
    await backBy(4, 'two notches to scroll back four rows');
    const { box } = await barOf(
      page,
      '.terminal-panel .scroll-proxy.vertical',
      'vertical',
    );
    const { start } = await barParts(page, box, 'vertical');
    await page.mouse.wheel(0, -100);
    await page.mouse.click(
      start.left + start.width / 2,
      start.top + start.height / 2,
    );
    await backBy(
      7,
      'a notch and a press of the button to scroll back three more',
    );
  });

  test('gives the terminal the scrollbar every tool has, beside its screen, the lines scrolled off the top making its thumb: a press of the button at its top scrolls a line back, and a press of its track to where the pointer is', async () => {
    const { box } = await barOf(
      page,
      '.terminal-panel .scroll-proxy.vertical',
      'vertical',
    );
    const parts = await barParts(page, box, 'vertical');
    assert.ok(parts.thumb);
    await page.mouse.wheel(0, 100);
    const below = await untilSettled(
      rows,
      'the terminal to rest after the wheel',
    );
    await page.mouse.click(
      parts.start.left + parts.start.width / 2,
      parts.start.top + parts.start.height / 2,
    );
    const expected = JSON.stringify(below.slice(0, below.length - 1));
    await waitFor(
      async () => JSON.stringify((await rows()).slice(1)) === expected,
      'the terminal to scroll a line back',
    );
    await page.mouse.click(
      box.left + box.width / 2,
      parts.start.top + parts.start.height + 2,
    );
    await waitFor(
      async () =>
        (await page
          .locator('.terminal-panel .scroll-proxy.vertical')
          .evaluate((proxy) => proxy.scrollTop)) < 1,
      'the terminal to scroll to its first lines',
    );
    const screen = await page.locator('.terminal-screen').boundingBox();
    assert.ok(screen);
    assert.ok(screen.x + screen.width <= box.left + 0.5);
    await run('echo back-below');
    await waitForRow((row) => row === 'back-below', 'the screen below again');
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
    await page
      .locator('.submenu .menu-item', { hasText: strings.terminal.newTab })
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
    const shown = popup.locator('.open-with-folders > div');
    await run('cd inner');
    await waitFor(
      async () =>
        (await tabs.first().locator('.tab-name').textContent()) === 'inner',
      'the tab to be named after the folder the shell went to',
    );
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
        ['terminal', true],
        ['commander', false],
        ['git', true],
      ],
    );
    await page.keyboard.press('Enter');
    await waitFor(async () => (await tabs.count()) === 2, 'a second tab');
    assert.ok(
      sameFolder((await tabs.nth(1).getAttribute('data-tip')) ?? '', inner),
    );
    await page.keyboard.press('ControlOrMeta+Shift+W');
    await waitFor(async () => (await tabs.count()) === 1, 'the tab to close');
    await page.locator('.terminal-screen .xterm-rows').waitFor();
  });

  test('offers a folder a command ran in under Terminal in the + menu, opening a terminal there', async () => {
    const inner = path.join(folder, 'work', 'inner');
    const tabs = page.locator('.tabs .tab');
    await run('echo counted');
    await waitForRow((row) => row === 'counted', 'the echo');
    const offered = page.locator('.submenu .menu-item', {
      hasText: /inner$/,
    });
    await waitFor(async () => {
      await page.locator('.tab-add').click();
      await page
        .locator('.context-menu .menu-item', {
          hasText: strings.tools.terminal,
        })
        .click();
      await page.locator('.submenu').waitFor();
      if ((await offered.count()) > 0) {
        return true;
      }
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      return false;
    }, 'the folder to be offered');
    await offered.click();
    await waitFor(async () => (await tabs.count()) === 2, 'a second tab');
    assert.ok(
      sameFolder((await tabs.nth(1).getAttribute('data-tip')) ?? '', inner),
    );
    const popup = page.locator('.confirm-popup');
    await page.keyboard.press('ControlOrMeta+Shift+W');
    await popup.waitFor();
    await page.keyboard.press('Enter');
    await waitFor(async () => (await tabs.count()) === 1, 'the tab to close');
  });

  test('asks before quitting while a terminal tab is open, staying open on Cancel and quitting on Enter', async () => {
    const close = () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .toSorted((a, b) => a.id - b.id)[0]
          ?.close(),
      );
    const popup = page.locator('.confirm-popup');
    await close();
    await popup.waitFor();
    await popup.locator('.confirm-button', { hasText: 'Cancel' }).click();
    await popup.waitFor({ state: 'detached' });
    assert.strictEqual(
      await app.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().filter((each) => each.isVisible())
            .length,
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
