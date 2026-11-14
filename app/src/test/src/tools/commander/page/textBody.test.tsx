import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import { TextBody } from '../../../../../tools/commander/page/textBody';
import {
  CommanderStore,
  createCommanderStore,
} from '../../../../../tools/commander/page/store';
import type { Viewing } from '../../../../../tools/commander/page/viewer';
import {
  maxRowsAsked,
  type CommanderToHost,
  type TextRow,
} from '../../../../../tools/commander/shared/protocol';
import { renderIn } from '../../../../support/componentFixtures';
import { noop } from '../../../../support/fixtures';

type ReadRows = Extract<CommanderToHost, { type: 'readRows' }>;

interface File {
  readonly rows: readonly TextRow[];
  readonly size: number;
}

const screen = 10;

const page = screen - 1;

function fileOf(lengths: readonly number[]): File {
  const rows: TextRow[] = [];
  let start = 0;
  for (const length of lengths) {
    rows.push({ start, end: start + length, text: 'x'.repeat(length - 1) });
    start += length;
  }
  return { rows, size: start };
}

const evenLines = fileOf(Array.from({ length: 1000 }, () => 10));

function answerOf(file: File, ask: ReadRows) {
  const start = ask.exact
    ? Math.min(ask.anchor, file.size)
    : (file.rows.find((row) => ask.anchor < row.end)?.start ?? file.size);
  const found = file.rows.findIndex((row) => row.start >= start);
  const index = found === -1 ? file.rows.length : found;
  const earlier = file.rows.slice(Math.max(0, index - ask.before), index);
  const later = file.rows.slice(index, index + ask.after);
  return {
    type: 'rows' as const,
    tab: ask.tab,
    request: ask.request,
    size: file.size,
    rows: [...earlier, ...later],
    anchorIndex: earlier.length,
  };
}

async function viewing(
  check: (viewer: {
    readonly show: (version: string) => Promise<void>;
    readonly asked: () => readonly ReadRows[];
    readonly answer: (file: File, ask: ReadRows) => Promise<void>;
    readonly answerAll: (file: File) => Promise<void>;
    readonly press: (key: string) => Promise<void>;
    readonly place: () => number | undefined;
  }) => Promise<void>,
  from = 0,
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>', {
    pretendToBeVisual: true,
  });
  dom.window.matchMedia = () =>
    Object.assign(new dom.window.EventTarget(), {
      matches: false,
      media: '',
      onchange: null,
      addListener: noop,
      removeListener: noop,
    });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('viewer-body') ? screen : 0;
    },
  });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    matchMedia: dom.window.matchMedia,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    devicePixelRatio: 1,
    ResizeObserver: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
  );
  Object.assign(globalThis, globals);
  try {
    const { createRoot } = await import('react-dom/client');
    const main = dom.window.document.querySelector('main');
    assert.ok(main);
    const root = createRoot(main);
    const posted: CommanderToHost[] = [];
    const store = createCommanderStore((message) => posted.push(message));
    const answered = new Set<number>();
    const places: number[] = [];
    const place = { current: from };
    const asked = () =>
      posted.filter(
        (message): message is ReadRows =>
          message.type === 'readRows' && !answered.has(message.request),
      );
    const answer = async (file: File, ask: ReadRows) => {
      answered.add(ask.request);
      await act(async () => store.getState().receive(answerOf(file, ask)));
    };
    await check({
      show: (version) =>
        act(async () => {
          const shown: Viewing = { tab: '3', size: evenLines.size, version };
          renderIn(
            root,
            <CommanderStore value={store}>
              <TextBody
                encoding="utf-8"
                language={undefined}
                viewing={shown}
                place={place}
                onPlace={(byte) => places.push(byte)}
              />
            </CommanderStore>,
          );
        }),
      asked,
      answer,
      answerAll: async (file) => {
        for (let ask = asked()[0]; ask !== undefined; ask = asked()[0]) {
          await answer(file, ask);
        }
      },
      press: (key) =>
        act(async () => {
          main
            .querySelector('.viewer-body')
            ?.dispatchEvent(
              new dom.window.KeyboardEvent('keydown', { key, bubbles: true }),
            );
        }),
      place: () => places.at(-1),
    });
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, saved);
  }
}

suite('Text of a viewed file', () => {
  test('ends at the last screen of a file rewritten at the same size, as the place of the last screen was kept from before', async () => {
    const longEnd = fileOf([
      ...Array.from({ length: 500 }, () => 10),
      ...Array.from({ length: 250 }, () => 20),
    ]);
    assert.strictEqual(longEnd.size, evenLines.size);
    await viewing(async ({ show, answerAll, press, place }) => {
      await show('1');
      await answerAll(longEnd);
      await show('2');
      await answerAll(evenLines);

      await press('End');
      await answerAll(evenLines);

      assert.strictEqual(place(), evenLines.size - screen * 10);
    });
  });

  test('moves from where a jump lands for the keys pressed before it was answered, as they moved from the place before it, and the rows they asked for took the place back there', async () => {
    for (const [keys, landed] of [
      [['PageUp', 'PageUp'], evenLines.size - (screen + page * 2) * 10],
      [['PageDown', 'PageDown'], evenLines.size - screen * 10],
    ] as const) {
      await viewing(
        async ({ show, asked, answer, answerAll, press, place }) => {
          await show('1');
          await answerAll(evenLines);
          assert.strictEqual(place(), 0);

          await press('End');
          const [jump] = asked();
          assert.ok(jump);
          for (const key of keys) {
            await press(key);
          }
          await answer(evenLines, jump);
          await answerAll(evenLines);

          assert.strictEqual(place(), landed, keys.join());
        },
      );
    }
  });

  test('stays where it was moved while more rows around an earlier place were asked for, as their answer took the place back there', async () => {
    await viewing(async ({ show, asked, answer, answerAll, press, place }) => {
      await show('1');
      await answerAll(evenLines);
      assert.strictEqual(place(), 1000);

      await press('PageDown');
      await press('PageDown');
      const [refill] = asked();
      assert.ok(refill);
      for (const _ of [1, 2, 3]) {
        await press('PageUp');
      }
      await answer(evenLines, refill);
      await answerAll(evenLines);

      assert.strictEqual(place(), 1000 + page * 2 * 10 - page * 3 * 10);
    }, 1000);
  });

  test('asks for no more rows than the main process gives at once however many pages were asked meanwhile, going on with the rest once answered, as a bigger ask got no answer and the viewer moved no more', async () => {
    await viewing(async ({ show, asked, answer, answerAll, press, place }) => {
      await show('1');
      await answerAll(evenLines);

      for (let pressed = 0; pressed < 120; pressed++) {
        await press('PageDown');
      }
      for (let ask = asked()[0]; ask !== undefined; ask = asked()[0]) {
        assert.ok(
          ask.before <= maxRowsAsked && ask.after <= maxRowsAsked,
          JSON.stringify([ask.before, ask.after]),
        );
        await answer(evenLines, ask);
      }

      assert.strictEqual(place(), (1000 - screen) * 10);
    });
  });

  test('asks for rows only once it knows how many rows its screen holds, as rows asked for a screen of one row and answered after it was measured sized the thumb by those few rows for as long as the file was viewed', async () => {
    await viewing(async ({ show, asked }) => {
      await show('1');

      assert.deepStrictEqual(
        asked().map((ask) => [ask.before, ask.after]),
        [
          [screen, 0],
          [screen * 2, screen * 3],
        ],
      );
    });
  });

  test('moves a page for every page asked while rows past those read were asked for, as a page asked meanwhile was lost', async () => {
    await viewing(async ({ show, answerAll, press, place }) => {
      await show('1');
      await answerAll(evenLines);

      for (let pressed = 0; pressed < 4; pressed++) {
        await press('PageDown');
      }
      await answerAll(evenLines);

      assert.strictEqual(place(), page * 4 * 10);
    });
  });
});
