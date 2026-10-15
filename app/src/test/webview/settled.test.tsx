import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { afterEach, suite, test, vi } from 'vitest';
import { useSettled } from '../../webview/settled';

function Shown({ value, settles }: { value: string; settles: boolean }) {
  return <span>{useSettled(value, settles)}</span>;
}

async function rendering(
  check: (
    show: (value: string, settles: boolean) => Promise<string>,
  ) => Promise<void>,
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
    await check(async (value, settles) => {
      await act(async () => {
        root.render(<Shown value={value} settles={settles} />);
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

suite('Settled values', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('gives a value as it changes when it need not settle, and once it has stopped changing for a while when it must, as rebuilding a large tree on every key typed froze the page', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await rendering(async (show) => {
      assert.strictEqual(await show('c', false), 'c');
      assert.strictEqual(await show('co', false), 'co');
      assert.strictEqual(await show('com', true), 'co');
      await act(async () => {
        vi.advanceTimersByTime(150);
      });
      assert.strictEqual(await show('comp', true), 'co');
      await act(async () => {
        vi.advanceTimersByTime(199);
      });
      assert.strictEqual(await show('comp', true), 'co');
      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      assert.strictEqual(await show('comp', true), 'comp');
    });
  });
});
