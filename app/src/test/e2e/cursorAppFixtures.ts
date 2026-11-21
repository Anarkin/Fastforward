import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as stateModule from '@codemirror/state';
import type * as viewModule from '@codemirror/view';
import * as esbuild from 'esbuild';
import type { ElectronApplication, JSHandle, Page } from 'playwright-core';
import { afterAll, beforeAll } from 'vitest';
import type { CursorStyle } from '../../lib/shared/cursorSettings';
import type * as editorKeymapModule from '../../tools/editor/page/keymap';
import { type CursorBox } from '../../lib/page/cursor';
import { pixelBox, type Box } from '../../lib/page/pixelBoxes';
import type * as cursorModule from '../../lib/page/cursor';
import type * as editorSelectionModule from '../../tools/editor/page/selection';
import type * as editorTextModule from '../../tools/editor/page/text';
import type * as cellTableModule from '../../lib/page/cellTable';
import { closeOrKill, launchApp, within } from './appLaunch';
import { waitFor } from '../helpers/fixtures';
import {
  type Shot,
  drawnBox,
  cursorWidth,
  selectedBeside,
} from './cursorPixels';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { fitWindow, windowOfPage } from './cursorWindow';
import { onceDrawn, untilSettled } from './waits';

const shell =
  process.platform === 'win32'
    ? { shell: '', shellArgs: ['-NoLogo', '-NoProfile'] }
    : { shell: '/bin/bash', shellArgs: ['--norc', '--noprofile'] };

const clearScreen =
  process.platform === 'win32'
    ? "Set-PSReadLineOption -PredictionSource None; function global:prompt { '> ' }; Clear-Host"
    : "PS1='> '; clear";

export const ratios = [1, 1.25, 1.5, 1.75];

const launchSwitches = [
  '--force-color-profile=srgb',
  ...(process.platform === 'linux' ? ['--enable-unsafe-swiftshader'] : []),
];

const clearLine = process.platform === 'win32' ? 'Escape' : 'Control+U';

type PageParts = Pick<typeof viewModule, 'EditorView'> &
  Pick<typeof stateModule, 'EditorSelection'> &
  Pick<typeof editorTextModule, 'appTextLook'> &
  Pick<typeof editorSelectionModule, 'appSelection'> &
  Pick<typeof editorKeymapModule, 'editorKeymap'> &
  Pick<typeof cellTableModule, 'terminalCells'> &
  Pick<typeof cursorModule, 'pageCursorLook'>;

let folder: string;
let settingsFile: string;
let app: ElectronApplication;
export let page: Page;

function writeSettings(style: CursorStyle, blink = false): void {
  fs.writeFileSync(
    settingsFile,
    JSON.stringify({
      theme: 'light',
      cursor: { style, width: cursorWidth, blink },
      tools: { terminal: { ...shell, renderer: 'webgl' } },
    }),
  );
}

export async function partsInPage(): Promise<JSHandle<PageParts>> {
  const built = await esbuild.build({
    stdin: {
      contents: [
        "export { EditorView } from '@codemirror/view';",
        "export { EditorSelection } from '@codemirror/state';",
        "export { appTextLook } from '../../tools/editor/page/text';",
        "export { appSelection } from '../../tools/editor/page/selection';",
        "export { editorKeymap } from '../../tools/editor/page/keymap';",
        "export { terminalCells } from './cellTable';",
        "export { pageCursorLook } from './cursor';",
      ].join('\n'),
      resolveDir: path.join(__dirname, '..', '..', 'lib', 'page'),
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    globalName: 'cursorPartsOfTheApp',
    write: false,
  });
  return page.evaluateHandle<PageParts>(
    `${built.outputFiles[0].text};cursorPartsOfTheApp`,
  );
}

let windowId: number;

export async function shot(): Promise<Shot> {
  const taken = await app.evaluate(async ({ BrowserWindow, screen }, id) => {
    const window = BrowserWindow.fromId(id);
    if (window === null) {
      throw new Error('The window of the page is gone.');
    }
    const scale = screen.getDisplayMatching(window.getBounds()).scaleFactor;
    const image = await window.webContents.capturePage();
    return {
      width: image.getSize(scale).width,
      pixels: image.toBitmap({ scaleFactor: scale }).toString('base64'),
    };
  }, windowId);
  return { width: taken.width, pixels: Buffer.from(taken.pixels, 'base64') };
}

export async function useStyle(
  style: CursorStyle,
  blink = false,
): Promise<void> {
  writeSettings(style, blink);
  const wanted = `${style} ${blink ? 'on' : 'off'}`;
  await waitFor(
    () =>
      page
        .evaluate(() => {
          const root = getComputedStyle(document.documentElement);
          return ['--cursor-style', '--cursor-blink']
            .map((name) => root.getPropertyValue(name).trim())
            .join(' ');
        })
        .then((shown) => shown === wanted)
        .catch(() => false),
    `the ${style} cursor of the settings`,
  );
  await page.locator('.terminal-screen canvas').first().waitFor();
}

export async function zoomTo(ratio: number): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow, screen }, [id, wanted]) => {
      const window = BrowserWindow.fromId(id);
      if (window !== null) {
        const display = screen.getDisplayMatching(window.getBounds());
        window.webContents.setZoomFactor(wanted / display.scaleFactor);
      }
    },
    [windowId, ratio] as const,
  );
  await waitFor(
    () =>
      page.evaluate(
        (wanted) =>
          devicePixelRatio === wanted &&
          Math.abs(
            parseFloat(
              getComputedStyle(document.documentElement).getPropertyValue(
                '--device-pixel',
              ),
            ) -
              1 / wanted,
          ) < 1e-6,
        ratio,
      ),
    `the window at ${ratio * 100}%`,
  );
}

async function ratioOfPage(): Promise<number> {
  return page.evaluate(() => devicePixelRatio);
}

async function terminalCell(): Promise<Box> {
  const rect = await page
    .locator('.terminal-screen .xterm-helper-textarea')
    .evaluate((element) => {
      const { left, top, width, height } = element.getBoundingClientRect();
      return { left, top, width, height };
    });
  return pixelBox(rect, await ratioOfPage());
}

async function clickTerminal(): Promise<void> {
  await page.evaluate(() => {
    for (const probe of document.querySelectorAll('.cursor-probe')) {
      if (probe instanceof HTMLElement) {
        probe.style.display = 'none';
      }
    }
  });
  await page.locator('.terminal-screen').click();
}

export async function typeInTerminal(keys: string): Promise<void> {
  await clickTerminal();
  await page.keyboard.type(keys);
}

export async function settledShot(
  ready: (taken: Shot) => boolean,
  what: string,
) {
  let last: Shot | undefined;
  await waitFor(async () => {
    last = await shot();
    return ready(last);
  }, what);
  if (last === undefined) {
    throw new Error(`No shot of ${what}`);
  }
  return last;
}

async function screenLeftTop(): Promise<[number, number]> {
  const rect = await page
    .locator('.terminal-screen .xterm-screen')
    .evaluate((element) => {
      const { left, top } = element.getBoundingClientRect();
      return [left, top] as const;
    });
  const ratio = await ratioOfPage();
  return [Math.round(rect[0] * ratio), Math.round(rect[1] * ratio)];
}

export function settledCell(
  accept: (cell: Box) => boolean | Promise<boolean>,
  what: string,
  quiet = 1000,
): Promise<Box> {
  return untilSettled(
    async () => {
      await onceDrawn(page);
      return terminalCell();
    },
    what,
    { quiet, accepted: accept, timeout: 30_000 },
  );
}

export async function promptAtTop(): Promise<Box> {
  const [left, top] = await screenLeftTop();
  await clickTerminal();
  await page.keyboard.press(clearLine);
  await settledCell(
    (cell) => cell.width > 0 && cell.left > left,
    'the prompt of the shell',
  );
  await typeInTerminal(clearScreen);
  await page.keyboard.press('Enter');
  return settledCell(
    (cell) => cell.width > 0 && cell.top === top && cell.left > left,
    'the prompt at the top of the terminal',
  );
}

export async function mountEditorAndField(
  parts: JSHandle<PageParts>,
  text: string,
  head: number,
): Promise<void> {
  await parts.evaluate(
    async (inPage, shown) => {
      for (const old of document.querySelectorAll('.cursor-probe')) {
        const editor = old.querySelector('.cm-editor');
        if (editor instanceof HTMLElement) {
          inPage.EditorView.findFromDOM(editor)?.destroy();
        }
        old.remove();
      }
      const box = document.createElement('div');
      box.className = 'cursor-probe editor-probe';
      box.style.cssText =
        'position: fixed; left: 40px; top: 160px; width: 300px; z-index: 10; background: var(--color-panel-background)';
      document.body.append(box);
      const view = new inPage.EditorView({
        doc: shown.text,
        selection: inPage.EditorSelection.cursor(shown.head),
        extensions: [
          inPage.appTextLook(await inPage.terminalCells()),
          inPage.appSelection(
            inPage.editorKeymap.rowEnd,
            inPage.pageCursorLook(),
          ),
        ],
      });
      view.dom.style.outline = 'none';
      box.append(view.dom);
      const fieldBox = document.createElement('div');
      fieldBox.className = 'cursor-probe field-probe';
      fieldBox.style.cssText =
        'position: fixed; left: 40px; top: 220px; width: 300px; z-index: 10; display: flex; flex-direction: column';
      const field = document.createElement('input');
      field.className = 'prompt-input';
      field.value = shown.text;
      fieldBox.append(field);
      document.body.append(fieldBox);
    },
    { text, head },
  );
}

export async function focusEditor(
  parts: JSHandle<PageParts>,
  head: number,
): Promise<void> {
  await parts.evaluate((inPage, at) => {
    const dom = document.querySelector('.editor-probe .cm-editor');
    const view =
      dom instanceof HTMLElement ? inPage.EditorView.findFromDOM(dom) : null;
    view?.focus();
    view?.dispatch({ selection: inPage.EditorSelection.cursor(at) });
  }, head);
}

export async function focusField(head: number): Promise<void> {
  await page.locator('.field-probe input').evaluate((field, at) => {
    if (field instanceof HTMLInputElement) {
      field.focus();
      field.setSelectionRange(at, at);
    }
  }, head);
}

export async function editorCell(text: string, head: number): Promise<Box> {
  const rect = await page
    .locator('.editor-probe .cm-line')
    .evaluate((line, upTo) => {
      const node = document
        .createTreeWalker(line, NodeFilter.SHOW_TEXT)
        .nextNode();
      if (node === null) {
        throw new Error('No text in the line of the editor');
      }
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 1);
      const advance = range.getBoundingClientRect().width;
      range.setEnd(node, upTo);
      const row = line.getBoundingClientRect();
      return {
        left: range.getBoundingClientRect().right,
        top: row.top,
        width: advance,
        height: row.height,
      };
    }, head);
  assert.ok(text.length >= head);
  return pixelBox(rect, await ratioOfPage());
}

export async function fieldArea(): Promise<Box> {
  const rect = await page.locator('.field-probe input').evaluate((field) => {
    const { left, top, width, height } = field.getBoundingClientRect();
    return {
      left: left + 2,
      top: top + 2,
      width: width - 4,
      height: height - 4,
    };
  });
  return pixelBox(rect, await ratioOfPage());
}

export async function shotShowing(
  area: Box,
  expected: CursorBox,
  what: string,
): Promise<Shot> {
  let last = await shot();
  const wanted = JSON.stringify({ box: expected, strays: 0 });
  const seen = (taken: Shot) => {
    const { box, strays } = drawnBox(taken, area, expected);
    return JSON.stringify({ box, strays });
  };
  await waitFor(async () => {
    last = await shot();
    return seen(last) === wanted;
  }, what).catch(() => undefined);
  return last;
}

export async function moveField(by: number): Promise<void> {
  await page.locator('.field-probe input').evaluate((field, shift) => {
    if (field instanceof HTMLElement) {
      field.style.marginLeft = `${shift}px`;
    }
  }, by);
}

export const fieldCursor = () => page.locator('.field-probe .text-cursor');

export const spaceAt = (start: number, cell: number) =>
  Math.floor(start + 2.5 * cell);

export async function selectedAlike(
  drawn: Box,
  space: number,
  what: string,
): Promise<void> {
  const seen = (taken: Shot) => selectedBeside(taken, drawn, space);
  const same = (taken: Shot) => {
    const { selected, cursor } = seen(taken);
    return JSON.stringify(selected) === JSON.stringify(cursor);
  };
  const { selected, cursor } = seen(
    await settledShot(same, `the selection of ${what}`).catch(() => shot()),
  );
  assert.deepStrictEqual(selected, cursor, what);
}

export function sharedCursorApp(): void {
  beforeAll(async () => {
    folder = tempFolder('cursor');
    const profile = path.join(folder, 'profile');
    const work = path.join(folder, 'work');
    fs.mkdirSync(profile, { recursive: true });
    fs.mkdirSync(work);
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [{ id: '1', tool: 'terminal', root: work }],
        activeTab: '1',
      }),
    );
    settingsFile = path.join(profile, 'settings.user.json');
    writeSettings('block');
    app = await launchApp(profile, {
      before: launchSwitches,
      colorScheme: 'light',
      scale: 1,
    });
    page = await app.firstWindow();
    await page
      .locator('.terminal-screen canvas:not(.xterm-link-layer)')
      .first()
      .waitFor()
      .catch((error: unknown) => {
        throw new Error(
          `The terminal shows no canvas of its WebGL renderer, which these tests compare the editor and text boxes with: ${String(error)}`,
        );
      });
    windowId = await windowOfPage(app, page);
    await fitWindow(app, windowId);
  });

  afterAll(async () => {
    if (app !== undefined && windowId !== undefined) {
      const quit = app.waitForEvent('close').catch(() => undefined);
      await app
        .evaluate(
          ({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.close(),
          windowId,
        )
        .catch(() => undefined);
      const asked = await page
        .locator('.confirm-popup')
        .waitFor({ timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (asked) {
        await page.keyboard.press('Enter').catch(() => undefined);
      }
      await within(quit, 'the app to quit').catch(() => closeOrKill(app));
    } else if (app !== undefined) {
      await closeOrKill(app);
    }
    removeFolder(folder);
  });
}
