import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, suite, test, vi } from 'vitest';
import { strings } from '../../shared/strings';
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
  TabBar,
} from '../../webview/tabBar';
import { rested } from '../componentFixtures';
import { noModifiers, noop, renderedBy } from '../fixtures';

function tabsOf(nav: React.ReactNode): React.ReactElement[] {
  assert.ok(isValidElement<{ children: React.ReactElement[] }>(nav));
  const list = nav.props.children[1];
  assert.ok(isValidElement<{ children: React.ReactElement[] }>(list));
  const strip = list.props.children[0];
  assert.ok(isValidElement<{ children: React.ReactElement[] }>(strip));
  return strip.props.children;
}

suite('Tab bar', () => {
  afterEach(() => vi.useRealTimers());

  const tabs = ['a', 'b', 'c'].map((name) => ({ root: `/${name}`, name }));

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

  test('stops the middle button from autoscrolling, so a middle click closes the tab', () => {
    const closed: string[] = [];
    const nav = renderedBy(TabBar, {
      tabs: [{ root: '/repo', name: 'repo' }],
      active: '/repo',
      onSelect: noop,
      onPreload: noop,
      onClose: (root) => closed.push(root),
      onAdd: noop,
      onLog: noop,
    });
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
    assert.strictEqual(prevented, 0);
    tab.props.onMouseDown({ button: 1, ...noModifiers, preventDefault });
    assert.strictEqual(prevented, 1);
    tab.props.onAuxClick({ button: 1, ...noModifiers });
    assert.deepStrictEqual(closed, ['/repo']);
  });

  test('closes a tab by its button without the button taking focus, as it goes and would leave the keys with nothing', () => {
    const nav = renderedBy(TabBar, {
      tabs: [{ root: '/repo', name: 'repo' }],
      active: '/repo',
      onSelect: noop,
      onPreload: noop,
      onClose: noop,
      onAdd: noop,
      onLog: noop,
    });
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
    const nav = renderedBy(TabBar, {
      tabs: [
        { root: '/a', name: 'a' },
        { root: '/b', name: 'b' },
      ],
      active: '/a',
      onSelect: noop,
      onPreload: (root) => preloaded.push(root),
      onClose: (root) => closed.push(root),
      onAdd: noop,
      onLog: noop,
    });
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

suite('Tabs too many for one row', () => {
  test('scrolls the tabs sideways by how far the wheel turns either way, as the row has nothing to scroll up or down', () => {
    assert.strictEqual(sidewaysDelta(0, 120), 120);
    assert.strictEqual(sidewaysDelta(0, -120), -120);
    assert.strictEqual(sidewaysDelta(40, 0), 40);
    assert.strictEqual(sidewaysDelta(30, -10), 30);
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

function roots(tabs: readonly { root: string }[]): string[] {
  return tabs.map((tab) => tab.root);
}

function draggable(
  shown: readonly { root: string; name: string }[],
  onMove?: (root: string, index: number) => void,
): boolean[] {
  return tabsOf(
    renderedBy(TabBar, {
      tabs: shown,
      active: shown[0].root,
      onSelect: noop,
      onPreload: noop,
      onClose: noop,
      onMove,
      onAdd: noop,
      onLog: noop,
    }),
  ).map(
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
      root: `/${name}`,
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

  test('lets a tab be dragged only while the tabs are not sorted automatically, and only with another tab to pass, as a lone tab drags the window', () => {
    const three = ['a', 'b', 'c'].map((name) => ({ root: `/${name}`, name }));
    assert.deepStrictEqual(draggable(three, noop), [true, true, true]);
    assert.deepStrictEqual(draggable(three), [false, false, false]);
    assert.deepStrictEqual(draggable(three.slice(0, 1), noop), [false]);
  });
});

suite('Tab bar for assistive technology', () => {
  test('tells that the tabs form a tab list, and which tab is open', () => {
    const document = new JSDOM(
      renderToStaticMarkup(
        <TabBar
          tabs={['a', 'b'].map((name) => ({ root: `/${name}`, name }))}
          active="/b"
          onSelect={noop}
          onPreload={noop}
          onClose={noop}
          onAdd={noop}
          onLog={noop}
        />,
      ),
    ).window.document;
    assert.strictEqual(
      document.querySelector('[role="tablist"]')?.getAttribute('aria-label'),
      'Repositories',
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
        <TabBar
          tabs={[{ root: '/a', name: 'a' }]}
          active="/a"
          onSelect={noop}
          onPreload={noop}
          onClose={noop}
          onAdd={noop}
          onLog={noop}
        />,
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
        <TabBar
          tabs={[{ root: '/a', name: 'a' }]}
          active="/a"
          onSelect={noop}
          onPreload={noop}
          onClose={noop}
          onAdd={noop}
          onLog={noop}
        />,
      ),
    ).window.document;
    const add = document.querySelector('.tab-add');
    const close = document.querySelector('.tab-close');
    assert.strictEqual(add?.textContent, '');
    assert.strictEqual(
      add.getAttribute('title'),
      strings.actions.openRepository,
    );
    assert.deepStrictEqual(
      [...add.querySelectorAll('svg path')].map((path) =>
        path.getAttribute('d'),
      ),
      ['M8 3.5v9', 'M3.5 8h9'],
    );
    assert.strictEqual(
      add.querySelector('svg')?.getAttribute('stroke-width'),
      close?.querySelector('svg')?.getAttribute('stroke-width'),
    );
  });

  test('shows the folder that tells a tab apart dimmed after its name, as worktrees show theirs', () => {
    const document = new JSDOM(
      renderToStaticMarkup(
        <TabBar
          tabs={[
            { root: '/code/site', name: 'site', folder: 'code' },
            { root: '/code/x/site', name: 'site', folder: 'x' },
            { root: '/app', name: 'app' },
          ]}
          active="/app"
          onSelect={noop}
          onPreload={noop}
          onClose={noop}
          onAdd={noop}
          onLog={noop}
        />,
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
