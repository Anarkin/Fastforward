import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import type { TabInfo, TabVisit } from '../../../../shell/shared/protocol';
import { ShellStore, createShellStore } from '../../../../shell/page/store';
import { TabBar } from '../../../../shell/page/tabBar';

async function inStrip(
  steps: (
    show: (
      tabs: readonly TabInfo[] | undefined,
      visit?: TabVisit,
    ) => Promise<void>,
    strip: () => Element,
    ended: (tab: Element) => Promise<void>,
  ) => Promise<void>,
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>', {
    pretendToBeVisual: true,
  });
  Object.assign(dom.window, {
    AnimationEvent: class extends dom.window.Event {},
  });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    MutationObserver: dom.window.MutationObserver,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    ResizeObserver: class {
      observe() {}
      disconnect() {}
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
    const show = (tabs: readonly TabInfo[] | undefined, visit?: TabVisit) =>
      act(async () => {
        root.render(
          <ShellStore
            value={createShellStore(() => undefined, {
              tabs,
              active: tabs?.[0]?.id,
              visit,
            })}
          >
            <TabBar />
          </ShellStore>,
        );
      });
    const strip = () => {
      const found = main.querySelector('.tab-strip');
      assert.ok(found);
      return found;
    };
    const ended = (tab: Element) =>
      act(async () => {
        const event = new dom.window.Event('animationend', { bubbles: true });
        tab.dispatchEvent(event);
      });
    await steps(show, strip, ended);
    await act(async () => {
      root.unmount();
    });
  } finally {
    dom.window.close();
    Object.assign(globalThis, saved);
  }
}

const named = (...names: string[]): TabInfo[] =>
  names.map((name) => ({
    id: `/${name}`,
    tool: 'git' as const,
    root: `/${name}`,
    name,
  }));

const drawn = (strip: Element) =>
  Array.from(strip.children, (tab) => [
    tab.querySelector('.tab-name')?.textContent,
    tab.getAttribute('role'),
    tab.classList.contains('opening')
      ? 'opening'
      : tab.classList.contains('departing')
        ? 'departing'
        : tab.classList.contains('closing')
          ? 'closing'
          : 'still',
  ]);

const [visitor] = named('v');
const visiting: TabVisit = { tab: visitor, x: 0, grabX: 0 };

function nameOf(tab: Element): Element {
  const found = tab.querySelector('.tab-name');
  assert.ok(found);
  return found;
}

suite('Tab motions', () => {
  test('shrinks a closed tab away in its place, as Chrome does, hidden from assistive technology and the pointer while it goes', async () => {
    await inStrip(async (show, strip, ended) => {
      await show(named('a', 'b', 'c'));
      await show(named('a', 'c'));
      assert.deepStrictEqual(drawn(strip()), [
        ['a', 'tab', 'still'],
        ['b', null, 'closing'],
        ['c', 'tab', 'still'],
      ]);
      const closing = strip().children[1];
      assert.strictEqual(closing.getAttribute('aria-hidden'), 'true');
      assert.ok(closing.hasAttribute('inert'));
      await ended(closing);
      assert.deepStrictEqual(drawn(strip()), [
        ['a', 'tab', 'still'],
        ['c', 'tab', 'still'],
      ]);
    });
  });

  test('grows an opened tab from nothing, as Chrome does, but not the tabs shown first, which were open already', async () => {
    await inStrip(async (show, strip, ended) => {
      await show(undefined);
      await show(named('a', 'b'));
      assert.deepStrictEqual(drawn(strip()), [
        ['a', 'tab', 'still'],
        ['b', 'tab', 'still'],
      ]);
      await show(named('a', 'c', 'b'));
      assert.deepStrictEqual(drawn(strip()), [
        ['a', 'tab', 'still'],
        ['c', 'tab', 'opening'],
        ['b', 'tab', 'still'],
      ]);
      await ended(strip().children[1]);
      assert.deepStrictEqual(drawn(strip())[1], ['c', 'tab', 'still']);
    });
  });

  test('grows the first tab opened in a window shown with no tab, as it grows every tab opened after, rather than showing it at once as the tabs a window opens with', async () => {
    await inStrip(async (show, strip) => {
      await show(undefined);
      await show([]);
      await show(named('a'));
      assert.deepStrictEqual(drawn(strip()), [['a', 'tab', 'opening']]);
    });
  });

  test('shows a tab dragged in from another window at its full width at once, under the pointer, rather than growing it as a tab opened there, though the tab comes in before the visit', async () => {
    await inStrip(async (show, strip) => {
      await show(named('a', 'b'));
      await show(named('a', 'b'), visiting);
      assert.deepStrictEqual(drawn(strip()), [
        ['v', 'tab', 'still'],
        ['a', 'tab', 'still'],
        ['b', 'tab', 'still'],
      ]);
      await show([...named('a', 'b'), visitor]);
      await show([...named('a', 'b'), visitor], visiting);
      assert.deepStrictEqual(
        drawn(strip()).find(([name]) => name === 'v'),
        ['v', 'tab', 'still'],
      );
    });
  });

  test('closes up the place of a tab dragged back out of the row unseen, as Chrome does, so the tabs beside it slide together without a tab shrinking between them, and keeps one dropped there', async () => {
    await inStrip(async (show, strip, ended) => {
      await show(named('a', 'b'));
      await show([...named('a', 'b'), visitor], visiting);
      await show(named('a', 'b'), visiting);
      await show(named('a', 'b'));
      const departing = drawn(strip()).find(([name]) => name === 'v');
      assert.deepStrictEqual(departing, ['v', null, 'departing']);
      const element = Array.from(strip().children).find(
        (tab) => tab.querySelector('.tab-name')?.textContent === 'v',
      );
      assert.ok(element);
      await ended(element);
      assert.deepStrictEqual(drawn(strip()), [
        ['a', 'tab', 'still'],
        ['b', 'tab', 'still'],
      ]);
      await show([...named('a', 'b'), visitor], visiting);
      await show([...named('a', 'b'), visitor]);
      assert.deepStrictEqual(
        drawn(strip()).find(([name]) => name === 'v'),
        ['v', 'tab', 'still'],
      );
    });
  });

  test('grows a tab opened again while it shrinks away back from where it got to, rather than drawing it twice', async () => {
    await inStrip(async (show, strip) => {
      await show(named('a', 'b'));
      await show(named('a'));
      await show(named('a', 'b'));
      assert.deepStrictEqual(drawn(strip()), [
        ['a', 'tab', 'still'],
        ['b', 'tab', 'opening'],
      ]);
    });
  });

  test('keeps a tab growing or shrinking when something inside it ends an animation of its own', async () => {
    await inStrip(async (show, strip, ended) => {
      await show(named('a', 'b'));
      await show(named('a', 'c'));
      const [, closing, opening] = strip().children;
      await ended(nameOf(closing));
      await ended(nameOf(opening));
      assert.deepStrictEqual(drawn(strip()), [
        ['a', 'tab', 'still'],
        ['b', null, 'closing'],
        ['c', 'tab', 'opening'],
      ]);
    });
  });
});
