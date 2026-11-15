import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import {
  installTextHeights,
  type MeasuringWindow,
} from '../../../../shell/page/textHeights';

class FakeQuery extends EventTarget {}

function measuringPage(ratio: number) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const { document } = dom.window;
  const heights = new Map([
    ['var(--font-family)', 16],
    ['var(--monospace-font-family)', 14],
  ]);
  Object.assign(dom.window.HTMLElement.prototype, {
    getBoundingClientRect(this: HTMLElement) {
      const height =
        this.tagName === 'SPAN'
          ? (heights.get(this.parentElement?.style.fontFamily ?? '') ?? 0)
          : 0;
      return { top: 0, bottom: height, left: 0, right: 7, width: 7, height };
    },
  });
  const observers: {
    readonly callback: ResizeObserverCallback;
    readonly watched: Element[];
    readonly observer: ResizeObserver;
  }[] = [];
  const queries: FakeQuery[] = [];
  class FakeObserver implements ResizeObserver {
    readonly watched: Element[] = [];
    constructor(callback: ResizeObserverCallback) {
      observers.push({ callback, watched: this.watched, observer: this });
    }
    observe(target: Element) {
      this.watched.push(target);
    }
    unobserve() {}
    disconnect() {
      this.watched.length = 0;
    }
  }
  const view: MeasuringWindow = {
    document,
    devicePixelRatio: ratio,
    matchMedia: () => {
      const query = new FakeQuery();
      queries.push(query);
      return query;
    },
    ResizeObserver: FakeObserver,
  };
  const variable = (name: string) =>
    document.documentElement.style.getPropertyValue(name);
  return {
    document,
    shownAs: dom.window.HTMLElement,
    heights,
    observers,
    queries,
    view,
    variable,
  };
}

suite('Text heights', () => {
  test('measures how tall a mark of the font of the app and of the monospace font is, their ascent and descent as the browser rounds them, on a hidden probe in the fonts of the settings, so a mark pads itself out to the edges of its line', () => {
    const { document, shownAs, view, variable } = measuringPage(1.25);
    installTextHeights(view);
    assert.strictEqual(variable('--text-height'), '16px');
    assert.strictEqual(variable('--monospace-text-height'), '14px');
    const probe = document.body.lastElementChild;
    assert.ok(probe instanceof shownAs);
    assert.strictEqual(probe.getAttribute('aria-hidden'), 'true');
    assert.strictEqual(probe.style.visibility, 'hidden');
    assert.strictEqual(probe.style.position, 'fixed');
    assert.deepStrictEqual(
      [...probe.children].map((line) => [
        line instanceof shownAs ? line.style.fontFamily : undefined,
        line instanceof shownAs ? line.style.fontSize : undefined,
        line.firstElementChild?.tagName,
      ]),
      [
        ['var(--font-family)', 'var(--font-size)', 'SPAN'],
        ['var(--monospace-font-family)', 'var(--monospace-font-size)', 'SPAN'],
      ],
    );
  });

  test('measures them again once a probe changes size, as once the theme loads or a font changes, and once the display scale changes, which rounds them anew', () => {
    const { heights, observers, queries, view, variable } = measuringPage(1.25);
    installTextHeights(view);
    assert.strictEqual(observers.length, 1);
    assert.strictEqual(observers[0]?.watched.length, 2);
    heights.set('var(--font-family)', 17.6);
    const [resized] = observers;
    resized?.callback([], resized.observer);
    assert.strictEqual(variable('--text-height'), '17.6px');
    heights.set('var(--monospace-font-family)', 15.2);
    queries.at(-1)?.dispatchEvent(new Event('change'));
    assert.strictEqual(variable('--monospace-text-height'), '15.2px');
    assert.strictEqual(variable('--device-pixel'), '0.8px');
  });

  test('takes its probe away and stops measuring once stopped', () => {
    const { document, heights, observers, queries, view, variable } =
      measuringPage(1);
    const stop = installTextHeights(view);
    const children = document.body.children.length;
    stop();
    assert.strictEqual(document.body.children.length, children - 1);
    assert.strictEqual(observers[0]?.watched.length, 0);
    heights.set('var(--font-family)', 20);
    queries.at(-1)?.dispatchEvent(new Event('change'));
    assert.strictEqual(variable('--text-height'), '16px');
  });
});
