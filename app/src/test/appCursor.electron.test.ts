import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as stateModule from '@codemirror/state';
import type * as viewModule from '@codemirror/view';
import * as esbuild from 'esbuild';
import type { ElectronApplication, JSHandle, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import type { CursorStyle } from '../shell/shared/cursorSettings';
import type * as commanderKeymapModule from '../tools/commander/shared/keymap';
import {
  cursorBlinkInterval,
  cursorBox,
  pixelBox,
  type Box,
  type CursorBox,
  type CursorShape,
} from '../ui/cursor';
import type * as cursorModule from '../ui/cursor';
import type * as editorSelectionModule from '../ui/editorSelection';
import type * as editorTextModule from '../ui/editorText';
import type * as textWidthsModule from '../ui/textWidths';
import { closeOrKill, launchApp, within } from './appFixtures';
import { waitFor } from './fixtures';
import { removeFolder, tempFolder } from './repositories';

const shell =
  process.platform === 'win32'
    ? { shell: '', shellArgs: ['-NoLogo', '-NoProfile'] }
    : { shell: '/bin/bash', shellArgs: ['--norc', '--noprofile'] };

const clearScreen =
  process.platform === 'win32'
    ? 'Set-PSReadLineOption -PredictionSource None; Clear-Host'
    : 'clear';

const barWidth = 2;

const ratios = [1, 1.25, 1.5, 1.75];

const launchSwitches = [
  '--force-color-profile=srgb',
  ...(process.platform === 'linux' ? ['--enable-unsafe-swiftshader'] : []),
];

const clearLine = process.platform === 'win32' ? 'Escape' : 'Control+U';

type PageParts = Pick<typeof viewModule, 'EditorView'> &
  Pick<typeof stateModule, 'EditorSelection'> &
  Pick<typeof editorTextModule, 'appTextLook'> &
  Pick<typeof editorSelectionModule, 'appSelection'> &
  Pick<typeof commanderKeymapModule, 'editorKeymap'> &
  Pick<typeof textWidthsModule, 'terminalCells'> &
  Pick<typeof cursorModule, 'pageCursorLook'>;

let folder: string;
let settingsFile: string;
let app: ElectronApplication;
let page: Page;

function writeSettings(style: CursorStyle, blink = false): void {
  fs.writeFileSync(
    settingsFile,
    JSON.stringify({
      theme: 'light',
      cursor: { style, barWidth, blink },
      tools: { terminal: { ...shell, renderer: 'webgl' } },
    }),
  );
}

async function partsInPage(): Promise<JSHandle<PageParts>> {
  const built = await esbuild.build({
    stdin: {
      contents: [
        "export { EditorView } from '@codemirror/view';",
        "export { EditorSelection } from '@codemirror/state';",
        "export { appTextLook } from './editorText';",
        "export { appSelection } from './editorSelection';",
        "export { editorKeymap } from '../tools/commander/shared/keymap';",
        "export { terminalCells } from './textWidths';",
        "export { pageCursorLook } from './cursor';",
      ].join('\n'),
      resolveDir: path.join(__dirname, '..', 'ui'),
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

interface Shot {
  readonly width: number;
  readonly pixels: Buffer;
}

let windowId: number;

async function windowOfPage(): Promise<number> {
  await page.evaluate(() => {
    window.name = 'cursor-test';
  });
  return app.evaluate(async ({ BrowserWindow }) => {
    for (const each of BrowserWindow.getAllWindows()) {
      if (
        (await each.webContents.executeJavaScript('window.name')) ===
        'cursor-test'
      ) {
        return each.id;
      }
    }
    throw new Error('No window of the page');
  });
}

async function shot(): Promise<Shot> {
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

type Rgb = readonly [number, number, number];

function pixelAt(taken: Shot, x: number, y: number): Rgb {
  const at = (y * taken.width + x) * 4;
  return [taken.pixels[at], taken.pixels[at + 1], taken.pixels[at + 2]];
}

const sameColor = (a: Rgb, b: Rgb) =>
  a.every((value, channel) => Math.abs(value - b[channel]) <= 2);

const sortedColor = (color: Rgb) => [...color].toSorted((a, b) => a - b);

async function focusColor(): Promise<number[]> {
  const color = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-focus)';
    document.body.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  });
  return (color.match(/\d+/g) ?? [])
    .slice(0, 3)
    .map(Number)
    .toSorted((a, b) => a - b);
}

function isDark(taken: Shot, x: number, y: number): boolean {
  const at = (y * taken.width + x) * 4;
  return (
    (taken.pixels[at] + taken.pixels[at + 1] + taken.pixels[at + 2]) / 3 < 128
  );
}

function darkBox(taken: Shot, area: Box): Box | undefined {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let y = area.top; y < area.top + area.height; y++) {
    for (let x = area.left; x < area.left + area.width; x++) {
      if (isDark(taken, x, y)) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      }
    }
  }
  return left === Infinity
    ? undefined
    : { left, top, width: right - left, height: bottom - top };
}

interface Drawn {
  readonly box: CursorBox | undefined;
  readonly strays: number;
  readonly color: Rgb;
}

function drawnBox(taken: Shot, area: Box, at: Box): Drawn {
  const color = pixelAt(taken, at.left, at.top);
  const background = pixelAt(taken, area.left, area.top);
  const isCursor = (x: number, y: number) =>
    sameColor(pixelAt(taken, x, y), color);
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let strays = 0;
  for (let y = area.top; y < area.top + area.height; y++) {
    for (let x = area.left; x < area.left + area.width; x++) {
      if (isCursor(x, y)) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      } else if (!sameColor(pixelAt(taken, x, y), background)) {
        strays++;
      }
    }
  }
  if (left === Infinity || sameColor(color, background)) {
    return { box: undefined, strays, color };
  }
  const runOf = (from: [number, number], step: [number, number]) => {
    let count = 0;
    let [x, y] = from;
    while (isCursor(x, y)) {
      count++;
      x += step[0];
      y += step[1];
    }
    return count;
  };
  const middleX = left + Math.floor((right - left) / 2);
  const middleY = top + Math.floor((bottom - top) / 2);
  return {
    box: {
      left,
      top,
      width: right - left,
      height: bottom - top,
      edges: isCursor(middleX, middleY)
        ? undefined
        : {
            top: runOf([middleX, top], [0, 1]),
            right: runOf([right - 1, middleY], [-1, 0]),
            bottom: runOf([middleX, bottom - 1], [0, -1]),
            left: runOf([left, middleY], [1, 0]),
          },
    },
    strays,
    color,
  };
}

const margin = 3;

function around(cell: Box): Box {
  return {
    left: cell.left - cell.width,
    top: cell.top - margin,
    width: cell.width * 3,
    height: cell.height + 2 * margin,
  };
}

function expectedBox(cell: Box, shape: CursorShape, ratio: number) {
  return cursorBox(cell, shape, barWidth, ratio);
}

async function useStyle(style: CursorStyle, blink = false): Promise<void> {
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

async function zoomTo(ratio: number): Promise<void> {
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

async function typeInTerminal(keys: string): Promise<void> {
  await page.locator('.terminal-screen').click();
  await page.keyboard.type(keys);
}

async function settledShot(ready: (taken: Shot) => boolean, what: string) {
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

async function settledCell(
  accept: (cell: Box) => boolean | Promise<boolean>,
  what: string,
): Promise<Box> {
  let last = '';
  let since = Date.now();
  let cell: Box | undefined;
  await waitFor(
    async () => {
      const now = await terminalCell();
      const key = JSON.stringify(now);
      if (key !== last) {
        last = key;
        since = Date.now();
      }
      cell = now;
      return (await accept(now)) && Date.now() - since > 1000;
    },
    what,
    30_000,
  );
  if (cell === undefined) {
    throw new Error(`No cell for ${what}`);
  }
  return cell;
}

async function promptAtTop(): Promise<Box> {
  const [left, top] = await screenLeftTop();
  await page.locator('.terminal-screen').click();
  await page.keyboard.press(clearLine);
  const prompt = await settledCell(
    (cell) => cell.width > 0 && cell.left > left,
    'the prompt of the shell',
  );
  await typeInTerminal(clearScreen);
  await page.keyboard.press('Enter');
  return settledCell(
    (cell) =>
      cell.width > 0 &&
      cell.top === top &&
      cell.left - left === prompt.left - left,
    'the prompt at the top of the terminal',
  );
}

async function mountEditorAndField(
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
        'position: fixed; left: 40px; top: 300px; width: 300px; z-index: 10; background: var(--color-panel-background)';
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
        'position: fixed; left: 40px; top: 400px; width: 300px; z-index: 10; display: flex; flex-direction: column';
      const field = document.createElement('input');
      field.className = 'prompt-input';
      field.value = shown.text;
      fieldBox.append(field);
      document.body.append(fieldBox);
    },
    { text, head },
  );
}

async function focusEditor(
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

async function focusField(head: number): Promise<void> {
  await page.locator('.field-probe input').evaluate((field, at) => {
    if (field instanceof HTMLInputElement) {
      field.focus();
      field.setSelectionRange(at, at);
    }
  }, head);
}

async function editorCell(text: string, head: number): Promise<Box> {
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

async function fieldArea(): Promise<Box> {
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

async function shotShowing(
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

function assertDrawn(
  taken: Shot,
  area: Box,
  expected: CursorBox,
  what: string,
): Rgb {
  const { box, strays, color } = drawnBox(taken, area, expected);
  assert.deepStrictEqual({ box, strays }, { box: expected, strays: 0 }, what);
  return color;
}

const tenths = (value: number) => Math.round(value * 10) / 10;

function lightness(taken: Shot, x: number, y: number): number {
  const at = (y * taken.width + x) * 4;
  return (taken.pixels[at] + taken.pixels[at + 1] + taken.pixels[at + 2]) / 3;
}

interface GlyphPlace {
  readonly box: Box | undefined;
  readonly middle: readonly [number, number];
}

const sidesOf = (box: Box | undefined) =>
  box === undefined
    ? []
    : [box.left, box.top, box.left + box.width, box.top + box.height];

function assertSamePlace(
  actual: GlyphPlace,
  expected: GlyphPlace,
  what: string,
): void {
  const [mine, theirs] = [sidesOf(actual.box), sidesOf(expected.box)];
  assert.ok(
    mine.length === 4 &&
      mine.every((edge, side) => Math.abs(edge - (theirs[side] ?? NaN)) <= 1),
    `${what}: ${JSON.stringify([actual.box, expected.box])}`,
  );
  assert.ok(
    actual.middle.every(
      (value, axis) => Math.abs(value - (expected.middle[axis] ?? NaN)) <= 0.25,
    ),
    `${what}: ${JSON.stringify([actual.middle, expected.middle])}`,
  );
}

function glyphPlace(taken: Shot, cell: Box, dark: boolean): GlyphPlace {
  const values: [number, number, number][] = [];
  for (let y = cell.top; y < cell.top + cell.height; y++) {
    for (let x = cell.left; x < cell.left + cell.width; x++) {
      values.push([x - cell.left, y - cell.top, lightness(taken, x, y)]);
    }
  }
  const all = values.map(([, , value]) => value);
  const low = Math.min(...all);
  const high = Math.max(...all);
  const inks = values.map(
    ([x, y, value]) =>
      [x, y, (dark ? high - value : value - low) / (high - low)] as const,
  );
  const inked = inks.filter(([, , ink]) => ink > 0.5);
  const total = inks.reduce((sum, [, , ink]) => sum + ink, 0);
  const left = Math.min(...inked.map(([x]) => x));
  const top = Math.min(...inked.map(([, y]) => y));
  return {
    box:
      inked.length === 0
        ? undefined
        : {
            left,
            top,
            width: Math.max(...inked.map(([x]) => x)) + 1 - left,
            height: Math.max(...inked.map(([, y]) => y)) + 1 - top,
          },
    middle: [
      tenths(inks.reduce((sum, [x, , ink]) => sum + x * ink, 0) / total),
      tenths(inks.reduce((sum, [, y, ink]) => sum + y * ink, 0) / total),
    ],
  };
}

function inkRuns(taken: Shot, area: Box): Box[] {
  const columns: boolean[] = [];
  for (let x = area.left; x < area.left + area.width; x++) {
    let dark = false;
    for (let y = area.top; y < area.top + area.height && !dark; y++) {
      dark = isDark(taken, x, y);
    }
    columns.push(dark);
  }
  const runs: Box[] = [];
  let start: number | undefined;
  for (const [index, dark] of [...columns, false].entries()) {
    if (dark && start === undefined) {
      start = index;
    } else if (!dark && start !== undefined) {
      const box = darkBox(taken, {
        left: area.left + start,
        top: area.top,
        width: index - start,
        height: area.height,
      });
      if (box !== undefined) {
        runs.push(box);
      }
      start = undefined;
    }
  }
  return runs;
}

interface Placed {
  readonly width: number;
  readonly height: number;
  readonly edges: CursorBox['edges'];
  readonly strays: number;
  readonly fromInk: readonly [number, number];
}

function placedAfterInk(taken: Shot, area: Box): Placed | undefined {
  const [ink, cursor] = inkRuns(taken, area);
  if (ink === undefined || cursor === undefined) {
    return undefined;
  }
  const { box, strays } = drawnBox(
    taken,
    {
      left: cursor.left - 1,
      top: cursor.top - 1,
      width: cursor.width + 2,
      height: cursor.height + 2,
    },
    cursor,
  );
  return box === undefined
    ? undefined
    : {
        width: box.width,
        height: box.height,
        edges: box.edges,
        strays,
        fromInk: [box.left - ink.left, box.top - ink.top],
      };
}

const blockShown = (taken: Shot, block: Box) =>
  isDark(taken, block.left, block.top) &&
  isDark(taken, block.left + block.width - 1, block.top + block.height - 1);

async function moveField(by: number): Promise<void> {
  await page.locator('.field-probe input').evaluate((field, shift) => {
    if (field instanceof HTMLElement) {
      field.style.marginLeft = `${shift}px`;
    }
  }, by);
}

suite('Cursor', () => {
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
    app = await launchApp(profile, { before: launchSwitches });
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
    windowId = await windowOfPage();
    await app.evaluate(({ BrowserWindow }, id) => {
      const window = BrowserWindow.fromId(id);
      window?.setContentSize(1360, 800);
      window?.focus();
    }, windowId);
    await waitFor(
      () =>
        app.evaluate(({ BrowserWindow }, id) => {
          const bounds = BrowserWindow.fromId(id)?.getContentBounds();
          return bounds?.width === 1360 && bounds.height === 800;
        }, windowId),
      'the window to take a size of whole device pixels',
    );
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

  for (const style of ['block', 'bar', 'underline'] as const) {
    for (const ratio of ratios) {
      test(`draws a ${style} of the setting alike to the device pixel at ${ratio * 100}% in the terminal and the editor, as the WebGL renderer of xterm.js fills it, and in a text box as in the editor from the character before it, with no pixel of another color around it, and an outline in the terminal and the editor once they lose the focus`, async () => {
        await useStyle(style);
        await zoomTo(ratio);
        const parts = await partsInPage();
        const text = 'x  ';

        const prompt = await promptAtTop();
        await typeInTerminal(text);
        const inTerminal = await settledCell(
          (cell) =>
            cell.top === prompt.top &&
            cell.left === prompt.left + prompt.width * text.length,
          'the cursor of the terminal after what was typed',
        );
        const terminalShot = await shotShowing(
          around(inTerminal),
          expectedBox(inTerminal, style, ratio),
          `the ${style} of the terminal at ${ratio}`,
        );
        const terminalColor = assertDrawn(
          terminalShot,
          around(inTerminal),
          expectedBox(inTerminal, style, ratio),
          'the terminal',
        );

        await mountEditorAndField(parts, text, text.length);
        await focusEditor(parts, text.length);
        const inEditor = await editorCell(text, text.length);
        const editorShot = await shotShowing(
          around(inEditor),
          expectedBox(inEditor, style, ratio),
          `the ${style} of the editor at ${ratio}`,
        );
        const editorColor = assertDrawn(
          editorShot,
          around(inEditor),
          expectedBox(inEditor, style, ratio),
          'the editor',
        );
        assert.deepStrictEqual(
          [inEditor.width, inEditor.height],
          [inTerminal.width, inTerminal.height],
          'the cells of the editor and the terminal',
        );
        const editorArea = pixelBox(
          await page
            .locator('.editor-probe .cm-content')
            .evaluate((content) => {
              const { left, top, width, height } =
                content.getBoundingClientRect();
              return { left, top, width, height };
            }),
          ratio,
        );
        const editorPlaced = placedAfterInk(editorShot, editorArea);
        assert.strictEqual(editorPlaced?.strays, 0, 'the editor, cleanly');

        await focusField(text.length);
        let area = await fieldArea();
        const fieldShot = await settledShot(
          (taken) => placedAfterInk(taken, area) !== undefined,
          `the ${style} of the text box`,
        );
        assert.deepStrictEqual(
          placedAfterInk(fieldShot, area),
          editorPlaced,
          'the text box, from the character before it, as the editor',
        );

        if (style === 'block') {
          const fieldBlock = inkRuns(fieldShot, area).at(-1);
          assert.ok(fieldBlock !== undefined);
          const fieldColor = pixelAt(
            fieldShot,
            fieldBlock.left,
            fieldBlock.top,
          );
          assert.deepStrictEqual(
            [editorColor, fieldColor],
            [terminalColor, terminalColor],
            'the color of the cursor in the terminal, the editor and the text box',
          );
          assert.deepStrictEqual(
            sortedColor(terminalColor),
            await focusColor(),
            'the color of the cursor, by default the focus color',
          );

          await moveField(7.3);
          area = await fieldArea();
          const movedShot = await settledShot(
            (taken) =>
              JSON.stringify(placedAfterInk(taken, area)) ===
              JSON.stringify(editorPlaced),
            'the cursor of the text box, moved with its box',
          ).catch(async () => shot());
          assert.deepStrictEqual(
            placedAfterInk(movedShot, area),
            editorPlaced,
            'the text box moved in its box without an event of its own, its cursor with it',
          );
        }

        const outlinedShot = await shotShowing(
          around(inEditor),
          expectedBox(inEditor, 'outline', ratio),
          `the outline of the editor at ${ratio}`,
        );
        assertDrawn(
          outlinedShot,
          around(inTerminal),
          expectedBox(inTerminal, 'outline', ratio),
          'the outline of the terminal',
        );
        assertDrawn(
          outlinedShot,
          around(inEditor),
          expectedBox(inEditor, 'outline', ratio),
          'the outline of the editor',
        );
      });
    }
  }

  for (const ratio of ratios) {
    test(`draws the character under a block lighter than the block at ${ratio * 100}%, where the text draws it, its ink centered within a quarter of a pixel of the text's and its edges within the pixel its antialiasing takes, in the editor and a text box, the two alike`, async () => {
      await useStyle('block');
      await zoomTo(ratio);
      const parts = await partsInPage();
      const text = 'xx';
      await mountEditorAndField(parts, text, 1);
      await focusEditor(parts, 1);
      const cell = await editorCell(text, 1);
      const editorShot = await settledShot(
        (taken) => blockShown(taken, cell),
        'the block of the editor on a character',
      );
      const before = { ...cell, left: cell.left - cell.width };
      const editorGlyph = glyphPlace(editorShot, cell, false);
      assertSamePlace(
        editorGlyph,
        glyphPlace(editorShot, before, true),
        'the character under the block of the editor',
      );
      assert.ok(editorGlyph.box !== undefined);

      await focusField(1);
      const area = await fieldArea();
      const fieldShot = await settledShot(
        (taken) => inkRuns(taken, area).length === 2,
        'the block of the text box on a character',
      );
      const block = inkRuns(fieldShot, area).at(-1);
      assert.ok(block !== undefined);
      assert.deepStrictEqual(
        [block.width, block.height],
        [cell.width, cell.height],
        'the block of the text box, as wide and tall as the one of the editor',
      );
      assertSamePlace(
        glyphPlace(fieldShot, block, false),
        glyphPlace(
          fieldShot,
          { ...block, left: block.left - block.width },
          true,
        ),
        'the character under the block of the text box',
      );
      assertSamePlace(
        glyphPlace(fieldShot, block, false),
        editorGlyph,
        'the character under the block of the text box, as the editor draws it',
      );
    });
  }

  test('blinks the cursor of the editor and of a text box alike once the setting asks for it, shown and hidden for the 600 ms each the WebGL renderer of xterm.js shows and hides its own, and keeps the outline of the editor steady once it loses the focus', async () => {
    await useStyle('block', true);
    await zoomTo(ratios[0]);
    const parts = await partsInPage();
    await mountEditorAndField(parts, 'x', 1);
    const animationOf = (selector: string) =>
      page.locator(selector).evaluate((element) => {
        const style = getComputedStyle(element);
        return JSON.stringify([
          style.animationName.replace(/-again$/, ''),
          style.animationDuration,
          style.animationTimingFunction,
          style.animationIterationCount,
        ]);
      });
    const blinking = JSON.stringify([
      'cursor-blink',
      `${(2 * cursorBlinkInterval) / 1000}s`,
      'steps(1)',
      'infinite',
    ]);
    await focusEditor(parts, 1);
    await waitFor(
      async () =>
        (await animationOf('.editor-probe .cm-cursorLayer')) === blinking,
      'the blinking cursor of the editor',
    );
    await focusField(1);
    await page.locator('.field-probe .text-cursor').waitFor();
    assert.strictEqual(
      await animationOf('.field-probe .text-cursor'),
      blinking,
    );
    const steady = JSON.stringify(['none', '0s', 'ease', '1']);
    await waitFor(
      async () =>
        (await animationOf('.editor-probe .cm-cursorLayer')) === steady,
      'the steady outline of the editor once it loses the focus',
    );
  });
});
