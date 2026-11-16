import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { afterEach, suite, test, vi } from 'vitest';
import { ColumnStatus } from '../../../../lib/page/columnStatusLine';
import { strings } from '../../../../lib/shared/strings';

interface Shown {
  readonly loading: boolean;
  readonly text: string | undefined;
  readonly font: 'monospace' | 'proportional';
}

async function rendering(
  check: (show: (shown: Shown) => Promise<unknown>) => Promise<void>,
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
    await check(async ({ loading, text, font }) => {
      await act(async () => {
        root.render(
          <ColumnStatus loading={loading} font={font}>
            {text}
          </ColumnStatus>,
        );
      });
      const line = main.querySelector('.column-status');
      return line === null
        ? undefined
        : {
            text: line.textContent,
            className: line.className,
            role: line.querySelector('[role]')?.getAttribute('role'),
          };
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

suite('Git column status', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('says what it is given in the font of its column, quietly, and nothing when given nothing', async () => {
    await rendering(async (show) => {
      assert.deepStrictEqual(
        await show({
          loading: false,
          text: '3 files changed',
          font: 'proportional',
        }),
        {
          text: '3 files changed',
          className: 'column-status',
          role: undefined,
        },
      );
      assert.deepStrictEqual(
        await show({ loading: false, text: '+2 −1', font: 'monospace' }),
        {
          text: '+2 −1',
          className: 'column-status monospace',
          role: undefined,
        },
      );
      assert.strictEqual(
        await show({ loading: false, text: undefined, font: 'monospace' }),
        undefined,
      );
    });
  });

  test('says nothing the first half second its column loads when it said nothing before, then that it reads, in the font of its column, until it is loaded', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await rendering(async (show) => {
      const loading = {
        loading: true,
        text: undefined,
        font: 'monospace',
      } as const;
      assert.strictEqual(await show(loading), undefined);
      await waited(499);
      assert.strictEqual(await show(loading), undefined);
      await waited(1);
      assert.deepStrictEqual(await show(loading), {
        text: strings.common.reading,
        className: 'column-status monospace',
        role: 'status',
      });
      assert.deepStrictEqual(
        await show({ loading: false, text: '+1 −0', font: 'monospace' }),
        {
          text: '+1 −0',
          className: 'column-status monospace',
          role: undefined,
        },
      );
    });
  });

  test('keeps saying what it said before the first half second its column loads, so it does not blink away on each selection, whatever it is given meanwhile', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await rendering(async (show) => {
      const before = {
        text: '12 files changed',
        className: 'column-status',
        role: undefined,
      };
      assert.deepStrictEqual(
        await show({
          loading: false,
          text: '12 files changed',
          font: 'proportional',
        }),
        before,
      );
      const loading = {
        loading: true,
        text: undefined,
        font: 'proportional',
      } as const;
      assert.deepStrictEqual(await show(loading), before);
      await waited(499);
      assert.deepStrictEqual(
        await show({ ...loading, text: '1 file changed' }),
        before,
      );
      await waited(1);
      assert.deepStrictEqual(await show(loading), {
        text: strings.common.reading,
        className: 'column-status',
        role: 'status',
      });
      assert.deepStrictEqual(
        await show({
          loading: false,
          text: '3 files changed',
          font: 'proportional',
        }),
        {
          text: '3 files changed',
          className: 'column-status',
          role: undefined,
        },
      );
    });
  });
});
