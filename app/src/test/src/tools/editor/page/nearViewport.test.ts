import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import { scrollbarHeldAttribute } from '../../../../../lib/page/scrollbars';
import {
  drawNearWhileHeld,
  moveTo,
  seenForMargin,
} from '../../../../../tools/editor/page/nearViewport';

const aroundOfCodeMirror = 1000;

class FakeViewState {
  pixelViewport = { left: 0, right: 900, top: 0, bottom: 700 };
  appropriate = true;

  getViewport(bias: number, target?: object): { from: number; to: number } {
    assert.ok(target === undefined || typeof target === 'object');
    const above =
      0.5 - Math.max(-0.5, Math.min(0.5, bias / aroundOfCodeMirror / 2));
    return {
      from: this.pixelViewport.top - above * aroundOfCodeMirror,
      to: this.pixelViewport.bottom + (1 - above) * aroundOfCodeMirror,
    };
  }

  viewportIsAppropriate(): boolean {
    return this.appropriate;
  }
}

function fakeView() {
  const { window } = new JSDOM('<!doctype html><div></div>');
  const scrollDOM = window.document.querySelector('div');
  assert.ok(scrollDOM);
  const viewState = new FakeViewState();
  const view = {
    viewState,
    scrollDOM,
    measures: 0,
    requestMeasure() {
      view.measures += 1;
    },
  };
  const stop = drawNearWhileHeld(view);
  const scrollTo = (top: number) => {
    viewState.pixelViewport = {
      ...viewState.pixelViewport,
      top,
      bottom: top + 700,
    };
    return viewState.viewportIsAppropriate();
  };
  const hold = (part: string | undefined) => {
    if (part === undefined) {
      scrollDOM.removeAttribute(scrollbarHeldAttribute);
    } else {
      scrollDOM.setAttribute(scrollbarHeldAttribute, part);
    }
  };
  const observed = () =>
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  return { view, viewState, stop, scrollTo, hold, observed, window };
}

suite('The lines the editor draws around those in sight', () => {
  test('are as many pixels of them as asked for once CodeMirror, which draws a thousand around those in sight, takes those in sight for fewer, the pixels above and below shared as it shares its thousand by the way the view moves', () => {
    const seen = { left: 0, right: 900, top: 2000, bottom: 2700 };
    assert.deepStrictEqual(seenForMargin(seen, 0, 100), {
      left: 0,
      right: 900,
      top: 2450,
      bottom: 2250,
    });
    assert.deepStrictEqual(seenForMargin(seen, 0, 1000), seen);
    const down = seenForMargin(seen, 500, 100);
    assert.deepStrictEqual(
      [down.top - 0.25 * 1000, down.bottom + 0.75 * 1000],
      [2000 - 25, 2700 + 75],
    );
    const up = seenForMargin(seen, -5000, 100);
    assert.deepStrictEqual([up.top - 1000, up.bottom], [2000 - 100, 2700]);
  });

  test('tell how far the view moved at its last step, a measure of the view where it stands already telling the step that brought it there', () => {
    const start = moveTo(undefined, 300);
    assert.deepStrictEqual(start, { top: 300, step: 0 });
    const moved = moveTo(start, 1100);
    assert.deepStrictEqual(moved, { top: 1100, step: 800 });
    assert.strictEqual(moveTo(moved, 1100), moved);
    assert.deepStrictEqual(moveTo(moved, 1000), { top: 1000, step: 100 });
  });

  test('are the thousand pixels of CodeMirror while the scrollbar is not held, and while it is dragged by steps the lines drawn ahead cover, as a narrower stretch made the editor draw lines at every step of a scrollbar dragged slowly rather than at one in fourteen', () => {
    const { viewState, stop, scrollTo, hold } = fakeView();
    scrollTo(0);
    scrollTo(800);
    assert.deepStrictEqual(viewState.getViewport(0), { from: 300, to: 2000 });
    hold('vertical-thumb');
    scrollTo(1050);
    assert.deepStrictEqual(viewState.getViewport(0), { from: 550, to: 2250 });
    hold('horizontal-thumb');
    scrollTo(3000);
    assert.deepStrictEqual(viewState.getViewport(0), {
      from: 2500,
      to: 4200,
    });
    stop();
  });

  test('are a hundred pixels while the scrollbar is dragged by steps longer than the lines drawn ahead cover, as each such step left the lines drawn around the last one behind unseen, 99 lines drawn at every other step of a file dragged quickly rather than 47 at each, 14 ms at its worst frames rather than 9.6; a place the editor is asked to scroll to keeps the lines CodeMirror draws around it', () => {
    const { viewState, stop, scrollTo, hold } = fakeView();
    scrollTo(0);
    hold('vertical-thumb');
    scrollTo(800);
    const seen = viewState.pixelViewport;
    assert.deepStrictEqual(viewState.getViewport(0), { from: 750, to: 1550 });
    assert.strictEqual(viewState.pixelViewport, seen);
    scrollTo(1600);
    assert.deepStrictEqual(viewState.getViewport(0, { range: {} }), {
      from: 1100,
      to: 2800,
    });
    scrollTo(900);
    assert.deepStrictEqual(viewState.getViewport(0), { from: 850, to: 1650 });
    scrollTo(1000);
    assert.deepStrictEqual(viewState.getViewport(0), { from: 500, to: 2200 });
    stop();
  });

  test('are drawn as far as CodeMirror draws them again once the scrollbar is let go, the editor asked to measure itself and told the few lines it drew no longer do, until it draws the others', async () => {
    const { view, viewState, stop, scrollTo, hold, observed } = fakeView();
    scrollTo(0);
    hold('vertical-thumb');
    assert.strictEqual(scrollTo(800), true);
    viewState.getViewport(0);
    assert.strictEqual(viewState.viewportIsAppropriate(), true);
    hold(undefined);
    await observed();
    assert.strictEqual(view.measures, 1);
    assert.strictEqual(viewState.viewportIsAppropriate(), false);
    assert.deepStrictEqual(viewState.getViewport(0), { from: 300, to: 2000 });
    assert.strictEqual(viewState.viewportIsAppropriate(), true);
    hold('vertical-thumb');
    hold(undefined);
    await observed();
    assert.strictEqual(view.measures, 1);
    stop();
  });

  test('leave an editor whose CodeMirror no longer has the two ways of its view state this relies on as it is', () => {
    const { window } = new JSDOM('<!doctype html><div></div>');
    const scrollDOM = window.document.querySelector('div');
    assert.ok(scrollDOM);
    class OtherViewState {
      readonly made = 1;

      other(): number {
        return this.made;
      }
    }
    const view = {
      viewState: new OtherViewState(),
      scrollDOM,
      requestMeasure: () => {},
    };
    drawNearWhileHeld(view)();
    assert.deepStrictEqual(
      Object.getOwnPropertyNames(OtherViewState.prototype),
      ['constructor', 'other'],
    );
  });
});
