import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { waitFor } from '../helpers/fixtures';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import { closeOrKill, launchApp } from './appLaunch';
import { pagePixels } from '../../shell/shared/cellGrid';

const koffiPath = path.resolve('node_modules/koffi');

interface Report {
  readonly cell: { readonly width: number; readonly height: number };
  readonly screen: { readonly width: number; readonly height: number };
}

const reportOf = (page: Page): Promise<Report> =>
  page.evaluate(() => {
    const screen = document
      .querySelector('.cell-grid-screen')
      ?.getBoundingClientRect();
    const cell = document
      .querySelector('.cell-grid-cell')
      ?.getBoundingClientRect();
    return {
      cell: {
        width: Math.round((cell?.width ?? 0) * devicePixelRatio),
        height: Math.round((cell?.height ?? 0) * devicePixelRatio),
      },
      screen: {
        width: Math.round((screen?.width ?? 0) * devicePixelRatio),
        height: Math.round((screen?.height ?? 0) * devicePixelRatio),
      },
    };
  });

suite('App window in whole cells', () => {
  let folder: string;
  let app: ElectronApplication;
  let page: Page;

  const clientPixels = () =>
    app.evaluate(({ BrowserWindow, screen }, where) => {
      const window = BrowserWindow.getAllWindows().find((each) =>
        each.isVisible(),
      );
      if (window === undefined) {
        return { width: 0, height: 0 };
      }
      if (process.platform === 'win32') {
        const koffi: typeof import('koffi') =
          process.mainModule?.require(where);
        const rect = { left: 0, top: 0, right: 0, bottom: 0 };
        try {
          koffi.struct('CellTestRect', {
            left: 'int32_t',
            top: 'int32_t',
            right: 'int32_t',
            bottom: 'int32_t',
          });
        } catch {
          koffi.type('CellTestRect');
        }
        koffi
          .load('user32.dll')
          .func('bool GetClientRect(void *window, _Out_ CellTestRect *rect)')(
          koffi.decode(window.getNativeWindowHandle(), 'void *'),
          rect,
        );
        return { width: rect.right, height: rect.bottom };
      }
      const scale = screen.getDisplayMatching(window.getBounds()).scaleFactor;
      const [width = 0, height = 0] = window.getContentSize();
      return {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
      };
    }, koffiPath);

  const leftOver = async () => {
    const { cell, screen } = await reportOf(page);
    return {
      width: screen.width % cell.width,
      height: screen.height % cell.height,
    };
  };

  const gridOf = async () => {
    const [{ cell, screen }, client, scale] = await Promise.all([
      reportOf(page),
      clientPixels(),
      page.evaluate(() => devicePixelRatio),
    ]);
    return {
      cell,
      scale,
      around: {
        width: pagePixels(client.width, scale) - screen.width,
        height: pagePixels(client.height, scale) - screen.height,
      },
    };
  };

  const untilWhole = () =>
    waitFor(async () => {
      const left = await leftOver();
      return left.width === 0 && left.height === 0;
    }, 'the window to be whole cells');

  beforeAll(async () => {
    folder = tempFolder('cell-steps');
    const profile = path.join(folder, 'profile');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, 'state.json'),
      JSON.stringify({
        tabs: [{ id: '1', tool: 'commander', root: folder }],
        activeTab: '1',
        windowPlaces: {
          '1': {
            bounds: { x: 40, y: 40, width: 1003, height: 707 },
            maximized: false,
          },
        },
      }),
    );
    app = await launchApp(profile);
    page = await app.firstWindow();
    await page.locator('.tabs').waitFor();
  });

  afterAll(async () => {
    await closeOrKill(app);
    removeFolder(folder);
  });

  test('sizes the window to whole cells of the terminal in every tool, around the room the page keeps beside the screen of a terminal, so a terminal shown fits its window to the pixel, and again once something else gave it another size', async () => {
    await untilWhole();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((each) => each.isVisible())
        ?.setContentSize(1011, 703);
    });
    await untilWhole();
    assert.deepStrictEqual(await leftOver(), { width: 0, height: 0 });
  });

  test.runIf(process.platform === 'win32')(
    'rounds the window dragged on Windows to whole cells as Windows asks while it is dragged, as the Windows console does, the corner dragged moving and the one across from it kept',
    async () => {
      const grid = await gridOf();
      const dragged = await app.evaluate(({ BrowserWindow }, where) => {
        const koffi: typeof import('koffi') =
          process.mainModule?.require(where);
        const window = BrowserWindow.getAllWindows().find((each) =>
          each.isVisible(),
        );
        if (window === undefined) {
          return undefined;
        }
        const user32 = koffi.load('user32.dll');
        const handle: unknown = koffi.decode(
          window.getNativeWindowHandle(),
          'void *',
        );
        const outer = { left: 0, top: 0, right: 0, bottom: 0 };
        const client = { left: 0, top: 0, right: 0, bottom: 0 };
        try {
          koffi.struct('CellTestRect', {
            left: 'int32_t',
            top: 'int32_t',
            right: 'int32_t',
            bottom: 'int32_t',
          });
        } catch {
          koffi.type('CellTestRect');
        }
        user32.func(
          'bool GetWindowRect(void *window, _Out_ CellTestRect *rect)',
        )(handle, outer);
        user32.func(
          'bool GetClientRect(void *window, _Out_ CellTestRect *rect)',
        )(handle, client);
        const threads: typeof import('node:worker_threads') =
          process.mainModule?.require('node:worker_threads');
        const { Worker } = threads;
        const sender = new Worker(
          [
            "const { parentPort, workerData } = require('node:worker_threads');",
            'const koffi = require(workerData.where);',
            "const user32 = koffi.load('user32.dll');",
            'const rect = Buffer.alloc(16);',
            'workerData.edges.forEach((edge, at) => rect.writeInt32LE(edge, at * 4));',
            "user32.func('intptr_t SendMessageW(void *window, uint32_t message, uintptr_t edge, void *rect)')(koffi.decode(Buffer.from(workerData.window), 'void *'), 0x0214, 8, rect);",
            'parentPort.postMessage([0, 1, 2, 3].map((at) => rect.readInt32LE(at * 4)));',
          ].join(String.fromCharCode(10)),
          {
            eval: true,
            workerData: {
              where,
              window: [...window.getNativeWindowHandle()],
              edges: [
                outer.left,
                outer.top,
                outer.right + 37,
                outer.bottom + 13,
              ],
            },
          },
        );
        return new Promise<number[]>((resolve, reject) => {
          sender.once('message', resolve);
          sender.once('error', reject);
        }).then(([left = 0, top = 0, right = 0, bottom = 0]) => ({
          left: left - outer.left,
          top: top - outer.top,
          width: right - left,
          height: bottom - top,
          frame: {
            width: outer.right - outer.left - client.right,
            height: outer.bottom - outer.top - client.bottom,
          },
        }));
      }, koffiPath);
      assert.ok(dragged);
      assert.deepStrictEqual(
        {
          left: dragged.left,
          top: dragged.top,
          width:
            (pagePixels(dragged.width - dragged.frame.width, grid.scale) -
              grid.around.width) %
            grid.cell.width,
          height:
            (pagePixels(dragged.height - dragged.frame.height, grid.scale) -
              grid.around.height) %
            grid.cell.height,
        },
        { left: 0, top: 0, width: 0, height: 0 },
      );
    },
  );

  test.runIf(
    process.platform === 'darwin' &&
      process.env.FASTFORWARD_MAC_CELL_STEPS === '1',
  )('has macOS resize the window in steps of a cell, in points', async () => {
    const grid = await gridOf();
    const steps = await app.evaluate(({ BrowserWindow, screen }, where) => {
      const koffi: typeof import('koffi') = process.mainModule?.require(where);
      const window = BrowserWindow.getAllWindows().find((each) =>
        each.isVisible(),
      );
      if (window === undefined) {
        return undefined;
      }
      const objc = koffi.load('/usr/lib/libobjc.A.dylib');
      try {
        koffi.struct('CellTestSize', { width: 'double', height: 'double' });
      } catch {
        koffi.type('CellTestSize');
      }
      const selector = objc.func('void *sel_registerName(const char *name)');
      const object = objc.func('objc_msgSend', 'void *', ['void *', 'void *']);
      const size = objc.func('objc_msgSend', 'CellTestSize', [
        'void *',
        'void *',
      ]);
      const nsWindow: unknown = object(
        koffi.decode(window.getNativeWindowHandle(), 'void *'),
        selector('window'),
      );
      const read: { width: number; height: number } = size(
        nsWindow,
        selector('contentResizeIncrements'),
      );
      const scale = screen.getDisplayMatching(window.getBounds()).scaleFactor;
      return { width: read.width * scale, height: read.height * scale };
    }, koffiPath);
    assert.deepStrictEqual(steps, grid.cell);
  });

  test.runIf(
    process.platform === 'linux' && (process.env.WAYLAND_DISPLAY ?? '') === '',
  )(
    'has the window manager of X11 resize the window in steps of a cell above the room around the screen, by the size hints of the window',
    async () => {
      const grid = await gridOf();
      const hints = await app.evaluate(({ BrowserWindow }, where) => {
        const koffi: typeof import('koffi') =
          process.mainModule?.require(where);
        const window = BrowserWindow.getAllWindows().find((each) =>
          each.isVisible(),
        );
        if (window === undefined) {
          return undefined;
        }
        const x11 = koffi.load('libX11.so.6');
        const display: unknown = x11.func(
          'void *XOpenDisplay(const char *name)',
        )(null);
        const read = Buffer.alloc(80);
        x11.func(
          'int XGetWMNormalHints(void *display, unsigned long window, void *hints, _Out_ long *supplied)',
        )(
          display,
          Number(window.getNativeWindowHandle().readBigUInt64LE(0)),
          read,
          [0],
        );
        x11.func('int XCloseDisplay(void *display)')(display);
        return {
          flags: Number(read.readBigInt64LE(0)),
          step: { width: read.readInt32LE(40), height: read.readInt32LE(44) },
          base: { width: read.readInt32LE(64), height: read.readInt32LE(68) },
        };
      }, koffiPath);
      assert.ok(hints);
      assert.deepStrictEqual(
        {
          steps: (hints.flags & (1 << 6)) !== 0,
          base: (hints.flags & (1 << 8)) !== 0,
          step: hints.step,
          around: hints.base,
        },
        { steps: true, base: true, step: grid.cell, around: grid.around },
      );
    },
  );
});
