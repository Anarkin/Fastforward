import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { afterEach, suite, test, vi } from 'vitest';
import { useShownAfter } from '../../../../../tools/commander/page/shownAfter';

function Shown({ going }: { going: boolean }) {
  return <span>{useShownAfter(going) ? 'shown' : ''}</span>;
}

async function rendering(
  check: (show: (going: boolean) => Promise<string>) => Promise<void>,
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>');
  const globals = {
    window: dom.window,
    document: dom.window.document,
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
    await check(async (going) => {
      await act(async () => {
        root.render(<Shown going={going} />);
      });
      return main.textContent ?? '';
    });
    await act(async () => {
      root.unmount();
    });
  } finally {
    Object.assign(globalThis, saved);
  }
}

const waited = (time: number) =>
  act(async () => {
    vi.advanceTimersByTime(time);
  });

suite('Shown after a while', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('shows that something goes on once it has gone on for half a second, and no longer once it stops, so a quick read shows nothing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await rendering(async (show) => {
      assert.strictEqual(await show(false), '');
      assert.strictEqual(await show(true), '');
      await waited(499);
      assert.strictEqual(await show(true), '');
      await waited(1);
      assert.strictEqual(await show(true), 'shown');
      assert.strictEqual(await show(false), '');
      assert.strictEqual(await show(true), '');
      await waited(300);
      assert.strictEqual(await show(false), '');
      await waited(300);
      assert.strictEqual(await show(false), '');
    });
  });
});
