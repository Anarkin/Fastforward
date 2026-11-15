import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, suite, test, vi } from 'vitest';
import type { TabInfo } from '../../../../shell/shared/protocol';
import { strings } from '../../../../lib/shared/strings';
import { AddIcon } from '../../../../lib/page/icons';
import { rested, tabsStore } from '../../../helpers/componentFixtures';
import { noModifiers, renderedBy } from '../../../helpers/fixtures';
import { ShellStore, createShellStore } from '../../../../shell/page/store';
import { TabBar } from '../../../../shell/page/tabBar';

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

suite('Tab bar', () => {
  afterEach(() => vi.useRealTimers());

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
