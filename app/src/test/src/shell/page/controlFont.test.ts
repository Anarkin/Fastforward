import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import {
  installControlFont,
  type FontWindow,
} from '../../../../shell/page/controlFont';
import { readTrueTypeFont } from '../../../../shell/page/trueTypeFont';

class FakeQuery extends EventTarget {}

interface MadeFace {
  readonly family: string;
  readonly bytes: Uint8Array;
  readonly unicodeRange: string | undefined;
}

function fontPage(zero: { width: number }) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const { document } = dom.window;
  const made: MadeFace[] = [];
  const shown = new Set<MadeFace>();
  const measured: string[] = [];
  Object.assign(dom.window.HTMLCanvasElement.prototype, {
    getContext: () => ({
      font: '',
      measureText(this: { font: string }, text: string) {
        measured.push(`${this.font}: ${text}`);
        return { width: zero.width };
      },
    }),
  });
  Object.defineProperty(document, 'fonts', {
    value: {
      add: (face: MadeFace) => shown.add(face),
      delete: (face: MadeFace) => shown.delete(face),
    },
  });
  class FakeFace implements MadeFace {
    readonly unicodeRange: string | undefined;
    constructor(
      readonly family: string,
      readonly bytes: Uint8Array,
      descriptors?: { readonly unicodeRange?: string },
    ) {
      this.unicodeRange = descriptors?.unicodeRange;
      made.push(this);
    }
  }
  const observers: (() => void)[] = [];
  const queries: FakeQuery[] = [];
  class FakeObserver {
    constructor(callback: () => void) {
      observers.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const view = {
    document,
    devicePixelRatio: 1,
    matchMedia: () => {
      const query = new FakeQuery();
      queries.push(query);
      return query;
    },
    ResizeObserver: FakeObserver,
    FontFace: FakeFace,
    getComputedStyle: () => ({
      fontFamily: "'Controls', Mono",
      fontSize: '12px',
    }),
  };
  return { document, made, shown, measured, observers, queries, view };
}

const asWindow = (view: unknown): FontWindow => Object(view);

suite('Font of the control characters in the page', () => {
  test('makes a font whose column is as wide as a character of the monospace font of the settings, measured as the browser draws it, and gives it to the page for the control characters and their pictures alone, from the first frame', () => {
    const page = fontPage({ width: 6.59765625 });
    const stop = installControlFont(asWindow(page.view));
    assert.deepStrictEqual(page.measured, ["12px 'Controls', Mono: 0"]);
    assert.strictEqual(page.made.length, 1);
    const [face] = page.made;
    assert.strictEqual(face?.family, 'Fastforward Controls');
    assert.strictEqual(
      face.unicodeRange,
      'U+0-8, U+B, U+E-1F, U+7F, U+2400-2421',
    );
    const read = readTrueTypeFont(face.bytes);
    assert.deepStrictEqual(
      [read.sumsHold, read.unitsPerEm, read.advances[1]],
      [true, 1024, 563],
    );
    assert.deepStrictEqual([...page.shown], [face]);
    const sample = page.document.body.lastElementChild;
    assert.ok(sample instanceof page.document.defaultView!.HTMLElement);
    assert.deepStrictEqual(
      [sample.style.fontFamily, sample.style.fontSize, sample.style.visibility],
      ['var(--monospace-font-family)', 'var(--monospace-font-size)', 'hidden'],
    );
    stop();
    assert.deepStrictEqual([...page.shown], []);
    assert.strictEqual(page.document.body.childElementCount, 0);
  });

  test('makes the font anew once a character of the monospace font is as wide as another, as on a screen of another scale, taking the one before out of the page, and leaves it while the width stays', () => {
    const zero = { width: 7.1999969482421875 };
    const page = fontPage(zero);
    installControlFont(asWindow(page.view));
    page.observers[0]?.();
    assert.strictEqual(page.made.length, 1);
    zero.width = 7;
    page.queries.at(-1)?.dispatchEvent(new Event('change'));
    assert.strictEqual(page.made.length, 2);
    assert.deepStrictEqual([...page.shown], [page.made[1]]);
    const read = readTrueTypeFont(page.made[1]?.bytes ?? new Uint8Array());
    assert.ok(
      Math.abs(((read.advances[1] ?? 0) / read.unitsPerEm) * 12 - 7) <
        2 / 65536,
    );
  });

  test('gives the page no font while the monospace font has no width, as before it is laid out', () => {
    const page = fontPage({ width: 0 });
    installControlFont(asWindow(page.view));
    assert.deepStrictEqual(page.made, []);
    assert.deepStrictEqual([...page.shown], []);
  });
});
