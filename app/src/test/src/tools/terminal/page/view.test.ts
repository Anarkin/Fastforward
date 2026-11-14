import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import {
  cursorOptions,
  screenMargin,
  TerminalView,
  wheelLines,
  type Xterm,
} from '../../../../../tools/terminal/page/view';
import { noop } from '../../../../helpers/fixtures';
import { defaultCursorLook } from '../../../../../lib/shared/cursorSettings';

function posingAsXterm(fake: object): Xterm {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return fake as unknown as Xterm;
}

const quiet = () => ({ dispose: noop });

class QuietTerminal {
  readonly parser = {
    registerCsiHandler: quiet,
    registerEscHandler: quiet,
  };
  readonly buffer = {
    active: { cursorX: 0, cursorY: 0, baseY: 0, viewportY: 0, getLine: noop },
  };
  onRender = quiet;
  onCursorMove = quiet;
  onScroll = quiet;
  refresh = quiet;
}

function withPage(run: (screen: HTMLElement) => void): void {
  const dom = new JSDOM('<!doctype html><main><div></div></main>');
  dom.window.matchMedia = () =>
    Object.assign(new dom.window.EventTarget(), {
      matches: false,
      media: '',
      onchange: null,
      addListener: noop,
      removeListener: noop,
    });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    matchMedia: dom.window.matchMedia,
    addEventListener: dom.window.addEventListener.bind(dom.window),
    removeEventListener: dom.window.removeEventListener.bind(dom.window),
    devicePixelRatio: 1,
    OffscreenCanvas: class {
      getContext() {
        return null;
      }
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
  );
  Object.assign(globalThis, globals);
  try {
    const screen = dom.window.document.querySelector('div');
    assert.ok(screen);
    run(screen);
  } finally {
    Object.assign(globalThis, saved);
  }
}

suite('Terminal view', () => {
  test('fits the terminal to its panel again once WebGL is lost, as the cells of the renderer it falls back to have another width, and the shell would go on writing lines of the old one', () => {
    withPage((screen) => {
      const done: string[] = [];
      let lose = noop;
      const xterm = posingAsXterm({
        Terminal: class extends QuietTerminal {
          readonly cols = 80;
          readonly rows = 24;
          get options() {
            return {};
          }
          set options(_options: object) {
            done.push('options');
          }
          loadAddon() {}
          attachCustomKeyEventHandler() {}
          onData() {}
          onResize() {}
          open() {}
          focus() {}
          dispose() {}
        },
        FitAddon: class {
          fit() {
            done.push('fit');
          }
        },
        WebglAddon: class {
          onContextLoss(listener: () => void) {
            lose = listener;
          }
          dispose() {}
        },
        UnicodeGraphemesAddon: class {
          dispose() {}
        },
      });
      const view = new TerminalView(xterm, screen, {
        tab: '1',
        renderer: 'webgl',
        scrollback: 1000,
        minimumContrastRatio: 4.5,
        windowsPty: undefined,
        post: noop,
        onCopy: noop,
        scrolling: () => ({ wheelRows: 3, smooth: false }),
        cursor: defaultCursorLook,
      });
      done.length = 0;
      lose();
      assert.deepStrictEqual(done, ['options', 'fit']);
      view.dispose();
    });
  });

  test('fits the terminal to at most 1000 columns and rows, as the shell runs at no more of them, and its lines would wrap apart from those shown', () => {
    withPage((screen) => {
      const fitted = { cols: 80, rows: 24 };
      const xterm = posingAsXterm({
        Terminal: class extends QuietTerminal {
          get cols() {
            return fitted.cols;
          }
          get rows() {
            return fitted.rows;
          }
          readonly options = {};
          loadAddon() {}
          attachCustomKeyEventHandler() {}
          onData() {}
          onResize() {}
          open() {}
          focus() {}
          resize(columns: number, rows: number) {
            fitted.cols = columns;
            fitted.rows = rows;
          }
          dispose() {}
        },
        FitAddon: class {
          fit() {
            fitted.cols = 1150;
            fitted.rows = 1200;
          }
        },
        UnicodeGraphemesAddon: class {
          dispose() {}
        },
      });
      const posted: unknown[] = [];
      const view = new TerminalView(xterm, screen, {
        tab: '1',
        renderer: 'dom',
        scrollback: 1000,
        minimumContrastRatio: 4.5,
        windowsPty: undefined,
        post: (message) => posted.push(message),
        onCopy: noop,
        scrolling: () => ({ wheelRows: 3, smooth: false }),
        cursor: defaultCursorLook,
      });
      assert.deepStrictEqual(posted, [
        { type: 'open', tab: '1', columns: 1000, rows: 1000 },
      ]);
      view.dispose();
    });
  });

  test('opens no box of xterm.js for a link a program printed, as its English question blocked the window and its OK opened nothing', () => {
    withPage((screen) => {
      let given: { linkHandler?: { activate(...args: unknown[]): void } } = {};
      const xterm = posingAsXterm({
        Terminal: class extends QuietTerminal {
          readonly cols = 80;
          readonly rows = 24;
          readonly options = {};
          constructor(options: typeof given) {
            super();
            given = options;
          }
          loadAddon() {}
          attachCustomKeyEventHandler() {}
          onData() {}
          onResize() {}
          open() {}
          focus() {}
          dispose() {}
        },
        FitAddon: class {
          fit() {}
        },
        UnicodeGraphemesAddon: class {
          dispose() {}
        },
      });
      const asked: string[] = [];
      Object.assign(globalThis, {
        confirm: () => {
          asked.push('confirm');
          return true;
        },
        open: () => {
          asked.push('open');
          return null;
        },
      });
      const view = new TerminalView(xterm, screen, {
        tab: '1',
        renderer: 'dom',
        scrollback: 1000,
        minimumContrastRatio: 4.5,
        windowsPty: undefined,
        post: noop,
        onCopy: noop,
        scrolling: () => ({ wheelRows: 3, smooth: false }),
        cursor: defaultCursorLook,
      });

      assert.ok(given.linkHandler !== undefined);
      given.linkHandler.activate({}, 'https://example.com', undefined);
      assert.deepStrictEqual(asked, []);
      view.dispose();
    });
  });

  test('hands xterm.js the style, the width of the bar in whole CSS pixels and the blinking of the setting, keeping a block or a bar as it is without the focus, and leaves the underline and the outline to the page', () => {
    assert.deepStrictEqual(cursorOptions(defaultCursorLook), {
      cursorStyle: 'block',
      cursorWidth: 2,
      cursorBlink: false,
      cursorInactiveStyle: 'block',
    });
    assert.deepStrictEqual(
      cursorOptions({ style: 'bar', width: 3, blink: true }),
      {
        cursorStyle: 'bar',
        cursorWidth: 3,
        cursorBlink: true,
        cursorInactiveStyle: 'bar',
      },
    );
    for (const style of ['underline', 'outline'] as const) {
      const { cursorStyle, cursorInactiveStyle } = cursorOptions({
        style,
        width: 2,
        blink: false,
      });
      assert.deepStrictEqual(
        [cursorStyle, cursorInactiveStyle],
        ['underline', 'none'],
        style,
      );
    }
  });

  test('moves the terminal onto whole device pixels by its margin rather than a transform, which would make the compositor resample its canvas, blurring it', () => {
    const [top, , , left] = screenMargin(14, 43.2, 1.25)
      .split(' ')
      .map((value) => parseFloat(value));
    for (const device of [(14 + left) * 1.25, (43.2 + top) * 1.25]) {
      assert.ok(Math.abs(device - Math.round(device)) < 0.01, String(device));
    }
    assert.strictEqual(screenMargin(14, 43, 1), '0px 0 0 0px');
  });

  test('scrolls the history by the rows of the setting for each notch of a mouse wheel, leaving a touchpad, a held modifier, and the screens of apps such as vim and less to the terminal', () => {
    const notch = {
      deltaY: 100,
      deltaMode: 0,
      wheelDeltaY: -120,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    };
    const shell = { buffer: 'normal', mouse: 'none' } as const;
    assert.strictEqual(wheelLines(notch, shell, 1), 1);
    assert.strictEqual(
      wheelLines({ ...notch, deltaY: -200, wheelDeltaY: 240 }, shell, 3),
      -6,
    );
    assert.strictEqual(
      wheelLines({ ...notch, deltaY: 30, wheelDeltaY: -30 }, shell, 1),
      undefined,
    );
    assert.strictEqual(
      wheelLines({ ...notch, altKey: true }, shell, 1),
      undefined,
    );
    assert.strictEqual(
      wheelLines(notch, { buffer: 'alternate', mouse: 'none' }, 1),
      undefined,
    );
    assert.strictEqual(
      wheelLines(notch, { buffer: 'normal', mouse: 'vt200' }, 1),
      undefined,
    );
  });
});
