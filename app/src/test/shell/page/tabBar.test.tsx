import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, suite, test, vi } from 'vitest';
import type { TabInfo } from '../../../shell/shared/protocol';
import { strings } from '../../../lib/shared/strings';
import {
  adjacentTab,
  Cycle,
  movedTab,
  nearestSlot,
  resting,
  revealingScroll,
  sidewaysDelta,
  slotLefts,
  stripOverflows,
  tabMenuItems,
  tabsWidth,
  tornOut,
  TabBar,
  visitedSlot,
} from '../../../shell/page/tabBar';
import { AddIcon } from '../../../lib/page/icons';
import { rested } from '../../support/componentFixtures';
import { noModifiers, renderedBy } from '../../support/fixtures';
import { tabsStore } from '../../support/componentFixtures';
import { ShellStore } from '../../../shell/page/store';
import { createShellStore } from '../../../shell/page/store';

function tabsShell(
  tabs: readonly TabInfo[],
  active: string,
  seen: { readonly closed?: string[]; readonly preloaded?: string[] } = {},
) {
  return createShellStore(
    (message) => {
      if (message.type === 'closeTab') {
        seen.closed?.push(message.tab);
      } else if (message.type === 'preloadTab') {
        seen.preloaded?.push(message.tab);
      }
    },
    { tabs, active },
  );
}

function tabsOf(nav: React.ReactNode): React.ReactElement[] {
  assert.ok(isValidElement<{ children: React.ReactElement[] }>(nav));
  const list = nav.props.children[1];
  assert.ok(isValidElement<{ children: React.ReactElement[] }>(list));
  const strip = list.props.children[0];
  assert.ok(isValidElement<{ children: React.ReactElement[] }>(strip));
  return strip.props.children;
}

function addButton(adding: boolean): Element | null {
  return new JSDOM(
    renderToStaticMarkup(
      <ShellStore
        value={tabsStore(
          [{ id: '/repo', tool: 'git', root: '/repo', name: 'repo' }],
          '/repo',
          adding,
        )}
      >
        <TabBar />
      </ShellStore>,
    ),
  ).window.document.querySelector('.tab-add');
}

async function inStrip(
  steps: (
    show: (tabs: readonly TabInfo[]) => Promise<void>,
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
    const show = (tabs: readonly TabInfo[]) =>
      act(async () => {
        root.render(
          <ShellStore value={tabsStore(tabs, tabs[0]?.id, false)}>
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
      : tab.classList.contains('closing')
        ? 'closing'
        : 'still',
  ]);

function nameOf(tab: Element): Element {
  const found = tab.querySelector('.tab-name');
  assert.ok(found);
  return found;
}

function laidOutTab(left: number, width: number, marginRight = 0) {
  return { offsetLeft: left, offsetWidth: width, marginRight };
}

suite('Tab bar', () => {
  afterEach(() => vi.useRealTimers());

  const tabs = ['a', 'b', 'c'].map((name) => ({
    id: `/${name}`,
    tool: 'git' as const,
    root: `/${name}`,
    name,
  }));

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
      await show([]);
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

  test('draws the icon a tab gives instead of its tool’s, as a viewer tab gives its file’s', () => {
    const document = new JSDOM(
      renderToStaticMarkup(
        <ShellStore
          value={tabsStore(
            [
              { id: '1', tool: 'commander', name: 'Commander' },
              {
                id: '2',
                tool: 'commander',
                name: 'notes.txt',
                icon: '/commander-icon?view=2',
              },
            ],
            '2',
            false,
          )}
        >
          <TabBar />
        </ShellStore>,
      ),
    ).window.document;
    const [plain, viewer] = document.querySelectorAll('.tabs .tab');
    assert.ok(plain?.querySelector('.tool-icon'));
    assert.strictEqual(plain.querySelector('img'), null);
    assert.strictEqual(
      viewer?.querySelector('img.tab-icon')?.getAttribute('src'),
      '/commander-icon?view=2',
    );
  });

  test('wraps around at either end, and stays put with one tab', () => {
    assert.strictEqual(adjacentTab(tabs, '/a', 1), '/b');
    assert.strictEqual(adjacentTab(tabs, '/c', 1), '/a');
    assert.strictEqual(adjacentTab(tabs, '/a', -1), '/c');
    assert.strictEqual(adjacentTab(tabs, undefined, 1), '/a');
    assert.strictEqual(adjacentTab(tabs.slice(0, 1), '/a', 1), undefined);
  });

  test('steps on from the tab it last asked for until that one shows, as a key held down repeats faster than tabs open, and from the one shown once another is picked', () => {
    let cycle = new Cycle();
    const next = (active: string) =>
      cycle.next(active, (from: string | undefined) =>
        adjacentTab(tabs, from, 1),
      );
    assert.strictEqual(next('/a'), '/b');
    assert.strictEqual(next('/a'), '/c');
    assert.strictEqual(next('/b'), '/a');
    assert.strictEqual(next('/c'), '/b');
    assert.strictEqual(next('/a'), '/c');
    cycle = new Cycle();
    assert.strictEqual(next('/a'), '/b');
    assert.strictEqual(next('/c'), '/a');
  });

  test('steps on from the tab shown once the one asked for shows and another is picked, though it is the one shown at the last press', () => {
    for (const shown of [tabs, tabs.slice(0, 2)]) {
      const cycle = new Cycle();
      const next = (active: string) =>
        cycle.next(active, (from: string | undefined) =>
          adjacentTab(shown, from, 1),
        );
      cycle.seen('/a');
      assert.strictEqual(next('/a'), '/b');
      cycle.seen('/b');
      cycle.seen('/a');
      assert.strictEqual(next('/a'), '/b');
    }
  });

  test('acts on what the pointer rests on, not on what it only passes over', async () => {
    const done: string[] = [];
    const rest = resting(10);
    rest.start(() => done.push('a'));
    rest.start(() => done.push('b'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepStrictEqual(done, ['b']);
    rest.start(() => done.push('c'));
    rest.cancel();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepStrictEqual(done, ['b']);
  });

  test('marks the + button open while its menu is, as the menu button is, telling assistive technology it opens a menu', () => {
    const open = addButton(true);
    assert.ok(open);
    assert.ok(open.classList.contains('open'));
    assert.strictEqual(open.getAttribute('aria-haspopup'), 'menu');
    assert.strictEqual(open.getAttribute('aria-expanded'), 'true');
    const closed = addButton(false);
    assert.ok(closed);
    assert.ok(!closed.classList.contains('open'));
    assert.strictEqual(closed.getAttribute('aria-expanded'), 'false');
  });

  test('keeps the focus where it is when a tab is pressed, and stops the middle button from autoscrolling, as pressing the open terminal tab left the keys with nothing, and so a middle click closes the tab', () => {
    const closed: string[] = [];
    const nav = renderedBy(
      TabBar,
      {},
      {
        shell: tabsShell(
          [{ id: '/repo', tool: 'git', root: '/repo', name: 'repo' }],
          '/repo',
          { closed },
        ),
      },
    );
    const [tab] = tabsOf(nav);
    assert.ok(
      isValidElement<{
        onMouseDown: (event: {
          button: number;
          preventDefault: () => void;
        }) => void;
        onAuxClick: (event: { button: number }) => void;
      }>(tab),
    );
    let prevented = 0;
    const preventDefault = () => prevented++;
    tab.props.onMouseDown({ button: 0, ...noModifiers, preventDefault });
    assert.strictEqual(prevented, 1);
    tab.props.onMouseDown({ button: 1, ...noModifiers, preventDefault });
    assert.strictEqual(prevented, 2);
    tab.props.onAuxClick({ button: 1, ...noModifiers });
    assert.deepStrictEqual(closed, ['/repo']);
  });

  test('closes a tab by its button without the button taking focus, as it goes and would leave the keys with nothing', () => {
    const nav = renderedBy(
      TabBar,
      {},
      {
        shell: tabsShell(
          [{ id: '/repo', tool: 'git', root: '/repo', name: 'repo' }],
          '/repo',
        ),
      },
    );
    const [tab] = tabsOf(nav);
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(tab));
    const close = tab.props.children.at(-1);
    assert.ok(
      isValidElement<{
        onMouseDown: (event: { preventDefault: () => void }) => void;
      }>(close),
    );
    let prevented = 0;
    close.props.onMouseDown({ preventDefault: () => prevented++ });
    assert.strictEqual(prevented, 1);
  });

  test('preloads only a tab not shown that the pointer rests on, and closes one only by its button or the middle button', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const preloaded: string[] = [];
    const closed: string[] = [];
    const nav = renderedBy(
      TabBar,
      {},
      {
        shell: tabsShell(
          [
            { id: '/a', tool: 'git', root: '/a', name: 'a' },
            { id: '/b', tool: 'git', root: '/b', name: 'b' },
          ],
          '/a',
          { preloaded, closed },
        ),
      },
    );
    const [a, b] = tabsOf(nav);
    type Tab = {
      onPointerEnter: () => void;
      onPointerLeave: () => void;
      onClick: () => void;
      onAuxClick: (event: { button: number }) => void;
      children: React.ReactElement[];
    };
    assert.ok(isValidElement<Tab>(a) && isValidElement<Tab>(b));
    a.props.onPointerEnter();
    rested();
    assert.deepStrictEqual(preloaded, []);
    b.props.onPointerEnter();
    b.props.onPointerLeave();
    rested();
    b.props.onPointerEnter();
    b.props.onClick();
    rested();
    assert.deepStrictEqual(preloaded, []);
    b.props.onPointerEnter();
    rested();
    assert.deepStrictEqual(preloaded, ['/b']);
    b.props.onAuxClick({ button: 2, ...noModifiers });
    assert.deepStrictEqual(closed, []);
    const close = a.props.children.at(-1);
    assert.ok(
      isValidElement<{
        onClick: (event: { stopPropagation: () => void }) => void;
      }>(close),
    );
    let stopped = 0;
    close.props.onClick({ stopPropagation: () => stopped++ });
    assert.strictEqual(stopped, 1);
    assert.deepStrictEqual(closed, ['/a']);
  });
});

suite('Menu of a tab', () => {
  test('moves the tab to a new window, unless it is the only tab of its window, or into another window named after the tab it shows', () => {
    const moved: (readonly [string, string | undefined])[] = [];
    const move = (tab: string, window?: string) => moved.push([tab, window]);
    const items = tabMenuItems(
      '4',
      false,
      [
        { id: '2', name: 'repo' },
        { id: '3', name: strings.tabs.noTabWindow },
      ],
      move,
    );
    assert.deepStrictEqual(
      items.map((item) =>
        'separator' in item
          ? '-'
          : [
              item.label,
              item.disabled === true,
              item.submenu?.map((each) =>
                'separator' in each ? '-' : each.label,
              ),
            ],
      ),
      [
        ['Move to New Window', false, undefined],
        ['Move to Window', false, ['repo', 'Window with no tab']],
      ],
    );
    for (const item of items) {
      if (!('separator' in item)) {
        item.onClick?.();
        for (const each of item.submenu ?? []) {
          if (!('separator' in each)) {
            each.onClick?.();
          }
        }
      }
    }
    assert.deepStrictEqual(moved, [
      ['4', undefined],
      ['4', '2'],
      ['4', '3'],
    ]);
  });

  test('offers no other window while there is none, and no new window for the only tab of a window', () => {
    const [only, ...rest] = tabMenuItems('1', true, [], () => 0);
    assert.ok(only && !('separator' in only));
    assert.strictEqual(only.disabled, true);
    assert.deepStrictEqual(rest, []);
  });
});

suite('Tabs too many for one row', () => {
  test('scrolls the tabs sideways by how far the wheel turns either way, as the row has nothing to scroll up or down', () => {
    assert.strictEqual(sidewaysDelta(0, 120), 120);
    assert.strictEqual(sidewaysDelta(0, -120), -120);
    assert.strictEqual(sidewaysDelta(40, 0), 40);
    assert.strictEqual(sidewaysDelta(30, -10), 30);
  });

  test('measures the tabs to the end of the last one’s margin, which takes back the gap before it as it grows or shrinks, so a full row does not flicker between too many and few', () => {
    assert.strictEqual(tabsWidth([]), 0);
    assert.strictEqual(tabsWidth([laidOutTab(48, 80)]), 80);
    assert.strictEqual(
      tabsWidth([
        laidOutTab(48, 80),
        laidOutTab(134, 0, -6),
        laidOutTab(134, 80),
      ]),
      166,
    );
    assert.strictEqual(
      tabsWidth([laidOutTab(48, 80), laidOutTab(134, 12, -6)]),
      92,
    );
  });

  test('takes the tabs for too many once even their narrowest overflow the row, and for few again only once they fit without the room left inside its edges, so it does not flip back and forth', () => {
    const padding = 12;
    assert.strictEqual(stripOverflows(false, 1000, 1000, 0), false);
    assert.strictEqual(stripOverflows(false, 1002, 1000, 0), true);
    assert.strictEqual(stripOverflows(true, 1024, 1000, padding), false);
    assert.strictEqual(stripOverflows(true, 1030, 1000, padding), true);
  });

  test('scrolls the open tab into view by as little as it takes, its curves included, and leaves the row be when it shows already', () => {
    const view = { scrolled: 100, width: 300 };
    const reach = 12;
    assert.strictEqual(
      revealingScroll(view, { start: 150, end: 250 }, reach),
      100,
    );
    assert.strictEqual(
      revealingScroll(view, { start: 50, end: 150 }, reach),
      38,
    );
    assert.strictEqual(
      revealingScroll(view, { start: 380, end: 480 }, reach),
      192,
    );
    assert.strictEqual(revealingScroll(view, { start: 5, end: 105 }, reach), 0);
  });
});

function roots(tabs: readonly { id: string }[]): string[] {
  return tabs.map((tab) => tab.id);
}

function draggable(shown: readonly TabInfo[], tearing = false): boolean[] {
  const shell = tearing
    ? createShellStore(() => undefined, {
        tabs: shown,
        active: shown[0].id,
        tearsOff: true,
        windows: [{ id: '2', name: 'other' }],
      })
    : tabsShell(shown, shown[0].id);
  return tabsOf(renderedBy(TabBar, {}, { shell })).map(
    (tab) =>
      isValidElement<{ onPointerDown?: unknown }>(tab) &&
      tab.props.onPointerDown !== undefined,
  );
}

suite('Tabs dragged', () => {
  test('puts a tab dragged in the place its left edge comes nearest, so it takes the place of a tab once it passes its middle, as in Chrome', () => {
    const lefts = slotLefts([100, 100, 100], 10, 0);
    assert.deepStrictEqual(lefts, [0, 110, 220]);
    assert.strictEqual(nearestSlot(lefts, 0), 0);
    assert.strictEqual(nearestSlot(lefts, 54), 0);
    assert.strictEqual(nearestSlot(lefts, 56), 1);
    assert.strictEqual(nearestSlot(lefts, 164), 1);
    assert.strictEqual(nearestSlot(lefts, 166), 2);
    assert.strictEqual(nearestSlot(lefts, 400), 2);
    assert.strictEqual(nearestSlot(lefts, -40), 0);
  });

  test('places a tab dragged among the others as wide as they are, though it is wider, as the open tab is once the tabs shrink', () => {
    assert.deepStrictEqual(slotLefts([40, 80, 40], 6, 1), [0, 46, 92]);
    assert.deepStrictEqual(slotLefts([80, 40, 30], 6, 0), [0, 46, 82]);
  });

  test('moves a tab to the place it is dropped in, keeping the others in their order', () => {
    const four = ['a', 'b', 'c', 'd'].map((name) => ({
      id: `/${name}`,
      name,
    }));
    assert.deepStrictEqual(roots(movedTab(four, '/a', 2)), [
      '/b',
      '/c',
      '/a',
      '/d',
    ]);
    assert.deepStrictEqual(roots(movedTab(four, '/d', 0)), [
      '/d',
      '/a',
      '/b',
      '/c',
    ]);
    assert.deepStrictEqual(roots(movedTab(four, '/x', 0)), roots(four));
  });

  test('lets a tab be dragged only with another tab to pass, as a lone tab drags the window', () => {
    const three = ['a', 'b', 'c'].map((name) => ({
      id: `/${name}`,
      tool: 'git' as const,
      root: `/${name}`,
      name,
    }));
    assert.deepStrictEqual(draggable(three), [true, true, true]);
    assert.deepStrictEqual(draggable(three.slice(0, 1)), [false]);
  });

  test('lets a lone tab be dragged once tabs tear off and another window is there to take it, as it then moves its window into that one', () => {
    const lone = [
      { id: '/a', tool: 'git' as const, root: '/a', name: 'a' },
    ] as const;
    assert.deepStrictEqual(draggable(lone, true), [true]);
  });

  test('tears a tab off once the pointer leaves the row of tabs by more than a little, above or below it', () => {
    const row = { top: 0, bottom: 32 };
    assert.strictEqual(tornOut(row, 40), false);
    assert.strictEqual(tornOut(row, 48), true);
    assert.strictEqual(tornOut(row, -14), false);
    assert.strictEqual(tornOut(row, -16), true);
  });

  test('shows a tab dragged in from another window in the place its left edge comes nearest, under the pointer', () => {
    assert.deepStrictEqual(visitedSlot([100, 100], 10, 0), {
      index: 0,
      shift: 0,
    });
    assert.deepStrictEqual(visitedSlot([100, 100], 10, 60), {
      index: 1,
      shift: -50,
    });
    assert.deepStrictEqual(visitedSlot([100, 100], 10, 500), {
      index: 2,
      shift: 0,
    });
    assert.deepStrictEqual(visitedSlot([], 10, 40), { index: 0, shift: 0 });
  });
});

suite('Tab bar for assistive technology', () => {
  test('tells that the tabs form a tab list, and which tab is open', () => {
    const document = new JSDOM(
      renderToStaticMarkup(
        <ShellStore
          value={tabsStore(
            ['a', 'b'].map((name) => ({
              id: `/${name}`,
              tool: 'git' as const,
              root: `/${name}`,
              name,
            })),
            '/b',
            false,
          )}
        >
          <TabBar />
        </ShellStore>,
      ),
    ).window.document;
    assert.strictEqual(
      document.querySelector('[role="tablist"]')?.getAttribute('aria-label'),
      'Tabs',
    );
    assert.deepStrictEqual(
      Array.from(document.querySelectorAll('[role="tab"]'), (tab) => [
        tab.querySelector('.tab-name')?.textContent,
        tab.getAttribute('aria-selected'),
      ]),
      [
        ['a', 'false'],
        ['b', 'true'],
      ],
    );
  });

  test('keeps the button that opens a repository outside the tab list, which scrolls, so it stays in view however many tabs are open', () => {
    const document = new JSDOM(
      renderToStaticMarkup(
        <ShellStore
          value={tabsStore(
            [{ id: '/a', tool: 'git', root: '/a', name: 'a' }],
            '/a',
            false,
          )}
        >
          <TabBar />
        </ShellStore>,
      ),
    ).window.document;
    const list = document.querySelector('[role="tablist"]');
    assert.ok(list);
    assert.ok(list.classList.contains('tab-strip'));
    assert.strictEqual(list.querySelector('.tab-add'), null);
    assert.strictEqual(
      document.querySelector('.tab-add')?.parentElement,
      list.parentElement,
    );
  });

  test("draws the button that opens a repository as a plus, straight lines as the close button's cross, named by what it does", () => {
    const document = new JSDOM(
      renderToStaticMarkup(
        <ShellStore
          value={tabsStore(
            [{ id: '/a', tool: 'git', root: '/a', name: 'a' }],
            '/a',
            false,
          )}
        >
          <TabBar />
        </ShellStore>,
      ),
    ).window.document;
    const add = document.querySelector('.tab-add');
    const close = document.querySelector('.tab-close');
    assert.strictEqual(add?.textContent, '');
    assert.strictEqual(add.getAttribute('title'), strings.tabs.newTab);
    assert.strictEqual(add.innerHTML, renderToStaticMarkup(<AddIcon />));
    assert.strictEqual(
      add.querySelector('svg')?.getAttribute('stroke-width'),
      close?.querySelector('svg')?.getAttribute('stroke-width'),
    );
  });

  test('shows the folder that tells a tab apart dimmed after its name, as worktrees show theirs', () => {
    const document = new JSDOM(
      renderToStaticMarkup(
        <ShellStore
          value={tabsStore(
            [
              {
                id: '/code/site',
                tool: 'git',
                root: '/code/site',
                name: 'site',
                folder: 'code',
              },
              {
                id: '/code/x/site',
                tool: 'git',
                root: '/code/x/site',
                name: 'site',
                folder: 'x',
              },
              { id: '/app', tool: 'git', root: '/app', name: 'app' },
            ],
            '/app',
            false,
          )}
        >
          <TabBar />
        </ShellStore>,
      ),
    ).window.document;
    assert.deepStrictEqual(
      Array.from(document.querySelectorAll('[role="tab"]'), (tab) => [
        tab.querySelector('.tab-name')?.textContent,
        tab.querySelector('.tab-folder')?.textContent,
      ]),
      [
        ['site', 'code'],
        ['site', 'x'],
        ['app', undefined],
      ],
    );
  });
});
