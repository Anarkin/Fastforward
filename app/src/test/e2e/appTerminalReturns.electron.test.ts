import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { closeOrKill, launchApp } from './appLaunch';
import {
  comesBackFromEach,
  scrolledAround,
  settledLooks,
  showTab,
} from './tabReturns';
import { waitFor } from '../helpers/fixtures';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { onceDrawn, untilSettled } from './waits';

const windows = process.platform === 'win32';

const shell = windows
  ? { shell: '', shellArgs: ['-NoLogo', '-NoProfile'] }
  : { shell: '/bin/bash', shellArgs: ['--norc', '--noprofile'] };

const printedThenLate = windows
  ? '1..100 | % { "line$_" }; Start-Sleep 3; 1..5 | % { "late$_" }'
  : 'for i in $(seq 1 100); do echo line$i; done; sleep 3; for i in 1 2 3 4 5; do echo late$i; done';

const printing = (sequences: readonly string[], sleeping = true) => {
  const escaped = sequences
    .map((each) => (windows ? `$([char]27)${each}` : `\\033${each}`))
    .join('');
  return windows
    ? `[Console]::Write("${escaped}")${sleeping ? '; Start-Sleep 30' : ''}`
    : `printf '${escaped}'${sleeping ? '; sleep 30' : ''}`;
};

const awayTabs = [1, 2] as const;

let folder: string;
let app: ElectronApplication;
let page: Page;

interface TerminalLooks {
  readonly rows: readonly string[];
  readonly selection: readonly string[];
  readonly cursor: string | null;
}

const terminalLooks = (): Promise<TerminalLooks> =>
  page.evaluate(() => {
    const screen = document.querySelector('.terminal-screen');
    return {
      rows: [...(screen?.querySelectorAll('.xterm-rows > div') ?? [])].map(
        (row) => (row.textContent ?? '').replaceAll(' ', ' ').trimEnd(),
      ),
      selection: [
        ...(screen?.querySelectorAll<HTMLElement>('.xterm-selection div') ??
          []),
      ].map((part) => part.style.cssText),
      cursor:
        screen?.querySelector('.xterm-rows .xterm-cursor')?.className ?? null,
    };
  });

async function run(command: string): Promise<void> {
  await page.locator('.terminal-screen').click();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
}

const lastRow = async () =>
  (await terminalLooks()).rows.findLast((row) => row !== '') ?? '';

async function interrupted(): Promise<void> {
  const running = await lastRow();
  await page.locator('.terminal-screen').click();
  await page.keyboard.press('Control+C');
  await waitFor(async () => {
    const row = await lastRow();
    return row !== running && /[>$#%]$/.test(row);
  }, 'the prompt of the shell once its command is interrupted');
}

function settledTerminal(): Promise<TerminalLooks> {
  return untilSettled(
    async () => {
      await onceDrawn(page);
      return terminalLooks();
    },
    'the terminal to settle',
    { quiet: 500 },
  );
}

const rowShown = async (row: string) =>
  (await terminalLooks()).rows.includes(row);

async function comesBack(left: TerminalLooks, away: number): Promise<void> {
  await showTab(page, away);
  await settledLooks(page);
  await showTab(page, 0);
  let back = await terminalLooks();
  try {
    await waitFor(
      async () => {
        back = await terminalLooks();
        return JSON.stringify(back) === JSON.stringify(left);
      },
      `the terminal as left for tab ${away}`,
      10_000,
    );
  } catch {
    assert.deepStrictEqual(back, left, `the terminal left for tab ${away}`);
  }
}

suite('Terminal tab shown again', () => {
  beforeAll(async () => {
    folder = tempFolder('terminal-returns');
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
          { id: '3', tool: 'terminal', root: work },
        ],
        activeTab: '1',
      }),
    );
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify({
        scrolling: { wheelRows: 2, smooth: false },
        tools: { terminal: { ...shell, renderer: 'dom' } },
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await page.locator('.terminal-screen .xterm-rows').waitFor();
  });

  afterAll(async () => {
    await closeOrKill(app);
    removeFolder(folder);
  });

  test('brings back the lines scrolled back to and the text selected in them, from a tab of another tool and from another terminal tab, though the shell printed meanwhile', async () => {
    await run(printedThenLate);
    await waitFor(() => rowShown('line100'), 'the last line', 30_000);
    await page.locator('.terminal-screen').hover();
    for (let notch = 0; notch < 5; notch++) {
      await page.mouse.wheel(0, -100);
    }
    await waitFor(
      async () => !(await rowShown('line100')),
      'the terminal scrolled back',
    );
    const rows = page.locator('.terminal-screen .xterm-rows > div');
    const [first, last] = await Promise.all([
      rows.nth(2).boundingBox(),
      rows.nth(4).boundingBox(),
    ]);
    assert.ok(first && last);
    await page.mouse.move(first.x + 2, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + 40, last.y + last.height / 2, { steps: 5 });
    await page.mouse.up();
    await waitFor(
      async () => (await terminalLooks()).selection.length > 0,
      'the text selected',
    );
    const left = await settledTerminal();
    for (const away of awayTabs) {
      await comesBack(left, away);
    }
    await waitFor(
      async () => {
        await page.locator('.terminal-screen').hover();
        await page.mouse.wheel(0, 2000);
        return rowShown('late5');
      },
      'what the shell printed meanwhile',
      15_000,
    );
  });

  test('brings back a terminal scrolled around as it was left, every scroller of it where it was, from a tab of another tool and from another terminal tab', async () => {
    await settledLooks(page);
    await scrolledAround(page);
    await comesBackFromEach(
      page,
      awayTabs,
      (away) => `The terminal left for tab ${away}`,
    );
  });

  test('brings back the shape a program gave the cursor and the cursor it hid, from a tab of another tool and from another terminal tab', async () => {
    await run(printing(['[6 q']));
    await waitFor(
      async () =>
        (await terminalLooks()).cursor?.includes('xterm-cursor-bar') === true,
      'the bar the program asked for',
    );
    const bar = await settledTerminal();
    for (const away of awayTabs) {
      await comesBack(bar, away);
    }
    await interrupted();
    await run(printing(['[?25l']));
    await waitFor(
      async () => (await terminalLooks()).cursor === null,
      'the cursor hidden',
    );
    const hidden = await settledTerminal();
    for (const away of awayTabs) {
      await comesBack(hidden, away);
    }
    await interrupted();
    await run(printing(['[?25h', '[0 q'], false));
  });
});
