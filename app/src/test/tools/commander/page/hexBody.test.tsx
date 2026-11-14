import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import { ByteBody } from '../../../../tools/commander/page/hexBody';
import {
  CommanderStore,
  createCommanderStore,
} from '../../../../tools/commander/page/store';
import type { CommanderToHost } from '../../../../tools/commander/shared/protocol';
import { renderIn } from '../../../support/componentFixtures';
import { noop } from '../../../support/fixtures';

async function showingBytes(
  size: number,
  check: (shown: {
    readonly show: (version: string) => Promise<void>;
    readonly posted: readonly CommanderToHost[];
    readonly store: ReturnType<typeof createCommanderStore>;
  }) => Promise<void>,
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
    const place = { current: 0 };
    const show = (version: string) =>
      act(async () => {
        renderIn(
          root,
          <CommanderStore value={store}>
            <ByteBody
              layout="hex"
              viewing={{ tab: '3', size, version }}
              place={place}
              onPlace={noop}
            />
          </CommanderStore>,
        );
      });
    await check({ show, posted, store });
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, saved);
  }
}

const readsOf = (posted: readonly CommanderToHost[]) =>
  posted.flatMap((message) => (message.type === 'readBytes' ? [message] : []));

suite('Bytes of a viewed file', () => {
  test('asks for the bytes again each time the file changes, also while an earlier ask goes unanswered, so the rows never stay empty', async () => {
    await showingBytes(100, async ({ show, posted }) => {
      await show('1');
      const first = readsOf(posted).length;
      assert.ok(first > 0);
      await show('2');
      await show('3');
      assert.strictEqual(readsOf(posted).length, first + 2);
    });
  });

  test('takes fewer bytes than asked for the end of the file rather than asking for them again, as a file of the system gives fewer than its size says', async () => {
    await showingBytes(4096, async ({ show, posted, store }) => {
      await show('1');
      const [asked] = readsOf(posted);
      assert.ok(asked !== undefined);

      await act(async () => {
        store.getState().receive({
          type: 'bytes',
          tab: '3',
          request: asked.request,
          start: asked.start,
          data: Array.from({ length: 18 }, (_, index) => index),
        });
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      assert.strictEqual(readsOf(posted).length, 1);
    });
  });
});
