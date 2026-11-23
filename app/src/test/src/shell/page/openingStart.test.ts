import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import { appIconColors } from '../../../../shell/page/appIconDrawing';
import type { OpeningPixels } from '../../../../shell/page/openingMessages';
import { openingTimes } from '../../../../shell/page/openingMotion';
import {
  replayOpening,
  startOpening,
  type OpeningPage,
  type OpeningWorker,
} from '../../../../shell/page/openingStart';

type Posted = Parameters<OpeningWorker['post']>[0];

const firstFrameAt = 388;
const opens = 'fastforward://app/index.html#opening';
const reloads = 'fastforward://app/index.html';

function page(url: string, { reducesMotion = false, titleBar = false } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', {
    url,
  });
  const { document } = dom.window;
  const addIcon = () => {
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'title-bar-icon');
    icon.getBoundingClientRect = () =>
      dom.window.DOMRect.fromRect({ x: 14, y: 9, width: 20, height: 20 });
    tabs.append(icon);
    document.body.append(tabs);
  };
  if (titleBar) {
    addIcon();
  }
  const posted: Posted[] = [];
  const timers: { run: () => void; milliseconds: number }[] = [];
  const canvases: HTMLCanvasElement[] = [];
  const begun: { startedAt: number; pixels: OpeningPixels }[] = [];
  const faded: { sky: HTMLElement; startedAt: number }[] = [];
  const frames: ((time: number) => void)[] = [];
  let shows = 0;
  let sized: ((pixels: OpeningPixels) => void) | undefined;
  let changed: (() => void) | undefined;
  let heard: ((message: { type: 'done' }) => void) | undefined;
  let failed: (() => void) | undefined;
  const stopped = { worker: false, size: false, tree: false };
  const opening: OpeningPage = {
    document,
    reducesMotion,
    firstFrame: (run) => frames.push(run),
    fadeSky: (sky, startedAt) => faded.push({ sky, startedAt }),
    draw: (canvas) => {
      canvases.push(canvas);
      return {
        begin: (startedAt, pixels) => begun.push({ startedAt, pixels }),
        post: (message) => posted.push(message),
        listen: (onMessage, onError) => {
          heard = onMessage;
          failed = onError;
        },
        stop: () => {
          stopped.worker = true;
        },
      };
    },
    watchSize: (_canvas, onSized) => {
      sized = onSized;
      return () => {
        stopped.size = true;
      };
    },
    watchTree: (_root, onChanged) => {
      changed = onChanged;
      return () => {
        stopped.tree = true;
      };
    },
    later: (run, milliseconds) => timers.push({ run, milliseconds }),
    showWindow: () => {
      shows += 1;
    },
  };
  return {
    dom,
    document,
    posted,
    timers,
    canvases,
    begun,
    faded,
    stopped,
    addIcon,
    start: () =>
      startOpening(opening, {
        location: dom.window.location,
        history: dom.window.history,
      }),
    replay: () => replayOpening(opening),
    frame: (time = firstFrameAt) => frames.shift()?.(time),
    shows: () => shows,
    opening: () => document.getElementById('opening'),
    playing: () => document.documentElement.hasAttribute('data-opening'),
    sized: (pixels: OpeningPixels) => sized?.(pixels),
    changed: () => changed?.(),
    done: () => heard?.({ type: 'done' }),
    fail: () => failed?.(),
  };
}

function opened(url: string, options: Parameters<typeof page>[1] = {}) {
  const shown = page(url, options);
  shown.start();
  shown.frame();
  return shown;
}

const landing = { type: 'land', landing: { x: 24, y: 19, size: 20 } };

suite('Opening start', () => {
  test('plays the opening the main process asked for in the address, marking the page while it plays, laying its sky and the canvas of its logo over the page, fading the one and drawing on the other', () => {
    const shown = opened(opens);
    assert.ok(shown.playing());
    const opening = shown.opening();
    assert.ok(opening);
    assert.strictEqual(opening.getAttribute('aria-hidden'), 'true');
    assert.deepStrictEqual(
      [...opening.children].map((part) => part.className),
      ['opening-sky', 'opening-icon'],
    );
    assert.strictEqual(shown.faded[0]?.sky, opening.children[0]);
    assert.strictEqual(shown.canvases[0], opening.children[1]);
    assert.strictEqual(shown.begun.length, 1);
  });

  test('starts its worker at once, but its sky, its logo and the window it shows only from the first frame of the page, all from its time, as the page paints its first frame only once the main thread is free of the scripts of the app, a quarter of a second later', () => {
    const shown = page(opens);
    shown.start();
    assert.strictEqual(shown.canvases.length, 1);
    assert.deepStrictEqual(shown.faded, []);
    assert.deepStrictEqual(shown.begun, []);
    assert.deepStrictEqual(shown.timers, []);
    assert.strictEqual(shown.shows(), 0);
    shown.frame(firstFrameAt);
    assert.deepStrictEqual(
      shown.faded.map(({ startedAt }) => startedAt),
      [firstFrameAt],
    );
    assert.deepStrictEqual(
      shown.begun.map(({ startedAt }) => startedAt),
      [firstFrameAt],
    );
  });

  test('asks the main process to show its window at its first frame, as Electron shows a window only once its page paints text, which the sky has none of, and would hide most of the rise of the folder', () => {
    const shown = page(opens);
    shown.start();
    assert.strictEqual(shown.shows(), 0);
    shown.frame();
    assert.strictEqual(shown.shows(), 1);
  });

  test('drops the opening from the address as it starts, so the page saving the settings reloads plays none', () => {
    const shown = opened(opens);
    assert.strictEqual(shown.dom.window.location.href, reloads);
  });

  test('plays none in a page loaded without it, a page reloaded or a spare window kept for a tab dragged out, and asks for no window to be shown', () => {
    const shown = opened(reloads);
    assert.ok(!shown.playing());
    assert.strictEqual(shown.opening(), null);
    assert.deepStrictEqual(shown.canvases, []);
    assert.strictEqual(shown.shows(), 0);
  });

  test('plays none where the system asks for less motion, leaving the window to show as it does without one', () => {
    const shown = opened(opens, { reducesMotion: true });
    assert.ok(!shown.playing());
    assert.strictEqual(shown.opening(), null);
    assert.deepStrictEqual(shown.canvases, []);
    assert.strictEqual(shown.shows(), 0);
    assert.strictEqual(shown.dom.window.location.href, reloads);
  });

  test('tells the logo where the icon of the title bar is as soon as the page draws it, and again as the window is resized and just before the logo leaves for it', () => {
    const shown = opened(opens);
    shown.changed();
    assert.deepStrictEqual(shown.posted, []);
    shown.addIcon();
    shown.changed();
    assert.deepStrictEqual(shown.posted, [landing]);
    assert.ok(shown.stopped.tree);
    const pixels = {
      width: 900,
      height: 600,
      pixelWidth: 1125,
      pixelHeight: 750,
    };
    shown.sized(pixels);
    assert.deepStrictEqual(shown.posted, [
      landing,
      { type: 'resize', pixels },
      landing,
    ]);
    const before = shown.timers.find(
      ({ milliseconds }) => milliseconds < openingTimes.leaving,
    );
    assert.ok(before);
    before.run();
    assert.strictEqual(shown.posted.length, 4);
  });

  test('tells the logo where the icon of the title bar is at once when the page has drawn it already, watching the page for nothing', () => {
    const shown = opened(opens, { titleBar: true });
    assert.deepStrictEqual(shown.posted, [landing]);
    shown.changed();
    assert.deepStrictEqual(shown.posted, [landing]);
  });

  test('ends once the logo is drawn on the icon of the title bar, taking its parts out of the page and stopping what drew and watched', () => {
    const shown = opened(opens);
    shown.done();
    assert.ok(!shown.playing());
    assert.strictEqual(shown.opening(), null);
    assert.deepStrictEqual(shown.stopped, {
      worker: true,
      size: true,
      tree: true,
    });
  });

  test('ends at once when its worker fails, and a second after it should have ended when its worker never says so, so the page is never left covered', () => {
    const failing = opened(opens);
    failing.fail();
    assert.ok(!failing.playing());
    assert.strictEqual(failing.opening(), null);
    const silent = opened(opens);
    const last = silent.timers.find(
      ({ milliseconds }) => milliseconds > openingTimes.ended,
    );
    assert.ok(last);
    last.run();
    assert.ok(!silent.playing());
    assert.strictEqual(silent.opening(), null);
  });

  test('plays again when asked to, in a page that played it before or never did, with parts of its own, as a canvas hands its drawing to a worker only once, showing no window', () => {
    const shown = opened(opens, { titleBar: true });
    shown.done();
    shown.replay();
    shown.frame();
    assert.ok(shown.playing());
    assert.strictEqual(shown.canvases.length, 2);
    assert.notStrictEqual(shown.canvases[1], shown.canvases[0]);
    assert.strictEqual(shown.opening()?.children[1], shown.canvases[1]);
    assert.strictEqual(shown.begun.length, 2);
    assert.strictEqual(shown.shows(), 1);
    const reloaded = opened(reloads, { titleBar: true });
    reloaded.replay();
    reloaded.frame();
    assert.ok(reloaded.playing());
    assert.strictEqual(reloaded.shows(), 0);
  });

  test('plays again when asked to even where the system asks for less motion, as it was asked for', () => {
    const shown = opened(reloads, { reducesMotion: true });
    shown.replay();
    assert.ok(shown.playing());
  });

  test('plays no second opening over one that plays still', () => {
    const shown = opened(opens);
    shown.replay();
    assert.strictEqual(shown.canvases.length, 1);
    assert.strictEqual(shown.document.querySelectorAll('#opening').length, 1);
  });

  test('paints the sky of the opening in the blue of the sky of the icon, which the drawing of the icon alone names', () => {
    const shown = opened(opens);
    const sky = shown.faded[0]?.sky;
    assert.ok(sky);
    const blue = new shown.dom.window.Option();
    blue.style.color = appIconColors.sky;
    assert.strictEqual(sky.style.background, blue.style.color);
  });
});
