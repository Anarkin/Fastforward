import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, useRef } from 'react';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import {
  restoreWhen,
  restoreWithin,
  useRestore,
} from '../../../../lib/page/restore';
import { noop } from '../../../helpers/fixtures';

function events() {
  const target = new EventTarget();
  const fire = (type: string) => target.dispatchEvent(new Event(type));
  return { target, fire };
}

function Restored({
  wanted,
  ready,
  applied,
}: {
  wanted: string | undefined;
  ready: boolean;
  applied: string[];
}) {
  const watched = useRef<HTMLDivElement>(null);
  const pending = useRestore(
    wanted,
    () => ready,
    (value) => {
      applied.push(value);
    },
    { watch: watched },
  );
  return (
    <div ref={watched} data-pending={pending.current ?? ''}>
      {ready ? 'ready' : ''}
    </div>
  );
}

async function rendering(
  check: (
    draw: (wanted: string | undefined, ready: boolean) => Promise<void>,
    applied: string[],
    dom: JSDOM,
  ) => Promise<void>,
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>');
  const globals = {
    window: dom.window,
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
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
    const applied: string[] = [];
    await check(
      async (wanted, ready) => {
        await act(async () => {
          root.render(
            <Restored wanted={wanted} ready={ready} applied={applied} />,
          );
        });
      },
      applied,
      dom,
    );
    await act(async () => {
      root.unmount();
    });
  } finally {
    Object.assign(globalThis, saved);
  }
}

suite('Restoring what a view describes', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('applies what is wanted at once when it can, and once only', () => {
    const applied: string[] = [];
    const { target } = events();
    const restoring = restoreWhen(
      'place',
      () => true,
      (wanted) => {
        applied.push(wanted);
      },
      { on: target },
    );
    restoring.check();
    assert.deepStrictEqual(applied, ['place']);
    assert.strictEqual(restoring.pending(), false);
  });

  test('applies what is wanted once what it applies to is ready, checked as that changes, trying again while it does not take', () => {
    const applied: string[] = [];
    const { target } = events();
    let ready = false;
    let takes = false;
    let changed: () => void = noop;
    const restoring = restoreWhen(
      'focus',
      () => ready,
      (wanted) => {
        applied.push(wanted);
        return takes;
      },
      {
        on: target,
        watch: (check) => {
          changed = check;
          return () => {
            changed = noop;
          };
        },
      },
    );
    changed();
    assert.deepStrictEqual(applied, []);
    ready = true;
    changed();
    assert.deepStrictEqual(applied, ['focus']);
    assert.strictEqual(restoring.pending(), true);
    takes = true;
    changed();
    changed();
    assert.deepStrictEqual(applied, ['focus', 'focus']);
    assert.strictEqual(restoring.pending(), false);
  });

  test('gives up as a key or the pointer is pressed, the wheel turned or text typed, as the person acts first', () => {
    for (const hand of ['keydown', 'pointerdown', 'wheel', 'input']) {
      const applied: string[] = [];
      const { target, fire } = events();
      let ready = false;
      const restoring = restoreWhen(
        'place',
        () => ready,
        (wanted) => {
          applied.push(wanted);
        },
        { on: target },
      );
      fire(hand);
      ready = true;
      restoring.check();
      assert.deepStrictEqual(applied, [], hand);
    }
  });

  test('gives up once the time it is given is over, saying so', () => {
    const { target } = events();
    let late = 0;
    const restoring = restoreWhen(
      'place',
      () => false,
      () => undefined,
      {
        on: target,
        late: () => {
          late += 1;
        },
      },
    );
    vi.advanceTimersByTime(restoreWithin - 1);
    assert.strictEqual(restoring.pending(), true);
    vi.advanceTimersByTime(1);
    assert.deepStrictEqual([restoring.pending(), late], [false, 1]);
    const quick = restoreWhen(
      'place',
      () => false,
      () => undefined,
      { on: target, within: 10 },
    );
    vi.advanceTimersByTime(10);
    assert.strictEqual(quick.pending(), false);
  });

  test('restores in a component once what it wants is drawn, as it renders or what it watches changes, anew for each thing wanted', async () => {
    await rendering(async (draw, applied, dom) => {
      await draw('first', false);
      assert.deepStrictEqual(applied, []);
      await draw('first', true);
      assert.deepStrictEqual(applied, ['first']);
      await draw('first', true);
      assert.deepStrictEqual(applied, ['first']);
      await draw('second', true);
      assert.deepStrictEqual(applied, ['first', 'second']);
      await draw('third', false);
      await act(async () => {
        dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown'));
      });
      await draw('third', true);
      assert.deepStrictEqual(applied, ['first', 'second']);
      await draw(undefined, true);
      assert.deepStrictEqual(applied, ['first', 'second']);
    });
  });
});
