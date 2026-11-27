import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test, vi } from 'vitest';
import type { TabInfo, ToHost } from '../../../../shell/shared/protocol';
import type { ToolId } from '../../../../shell/shared/tools';
import { createShellStore, ShellStore } from '../../../../shell/page/store';
import { TaskbarBadge } from '../../../../shell/page/taskbarBadge';

const drawn = vi.hoisted(
  () => [] as { readonly icon: string; readonly ground: string }[],
);

vi.mock('../../../../shell/page/badgeImage', () => ({
  badgeImageOf: (icon: SVGSVGElement, ground: string) => {
    drawn.push({ icon: icon.outerHTML, ground });
    return icon.classList.contains('tool-canvas')
      ? Promise.reject(new Error('not drawn'))
      : Promise.resolve(`data:image/png;base64,${drawn.length}`);
  },
}));

const tab = (id: string, tool: ToolId): TabInfo => ({ id, tool, name: id });

const ground = 'rgb(1, 2, 3)';

async function inWindow(
  run: (window: {
    readonly tabs: (tabs: readonly TabInfo[]) => Promise<void>;
    readonly turnDark: () => Promise<void>;
    readonly posted: readonly ToHost[];
  }) => Promise<void>,
): Promise<void> {
  drawn.length = 0;
  const dom = new JSDOM('<!doctype html><main></main>', {
    pretendToBeVisual: true,
  });
  const queryOf = (media: string) =>
    Object.assign(new dom.window.EventTarget(), {
      matches: false,
      media,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
    });
  const queries = new Map<string, ReturnType<typeof queryOf>>();
  dom.window.matchMedia = (media: string) => {
    const query = queries.get(media) ?? queryOf(media);
    queries.set(media, query);
    return query;
  };
  Object.defineProperty(dom.window, 'devicePixelRatio', { value: 1.25 });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
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
    const posted: ToHost[] = [];
    const store = createShellStore((message) => posted.push(message));
    await act(async () => {
      root.render(
        <ShellStore value={store}>
          <nav style={{ backgroundColor: ground }}>
            <TaskbarBadge />
          </nav>
        </ShellStore>,
      );
    });
    await run({
      tabs: (tabs) =>
        act(async () => {
          store.getState().receive({ type: 'tabs', tabs, active: tabs[0]?.id });
        }),
      turnDark: () =>
        act(async () => {
          queries
            .get('(prefers-color-scheme: dark)')
            ?.dispatchEvent(new dom.window.Event('change'));
        }),
      posted,
    });
    await act(async () => {
      root.unmount();
    });
  } finally {
    Object.assign(globalThis, saved);
  }
}

suite('Taskbar badge', () => {
  test('badges the window with the icon of the tool its tabs are all of, on the ground of the tab row, drawn as at 100% at any scale, as the taskbar takes a badge as 16 pixels and scales it itself, and clears it once a tab of another tool comes', () =>
    inWindow(async ({ tabs, posted }) => {
      await tabs([tab('1', 'commander'), tab('2', 'commander')]);
      assert.deepStrictEqual(posted, [
        {
          type: 'taskbarBadge',
          tool: 'commander',
          png: 'data:image/png;base64,1',
        },
      ]);
      assert.strictEqual(drawn.length, 1);
      assert.match(drawn[0]?.icon ?? '', /tool-commander/);
      assert.match(drawn[0]?.icon ?? '', /viewBox="0 0 16 16"/);
      assert.strictEqual(drawn[0]?.ground, 'rgb(1 2 3)');
      await tabs([tab('1', 'commander'), tab('3', 'terminal')]);
      assert.deepStrictEqual(posted.at(-1), { type: 'taskbarBadge' });
      assert.strictEqual(drawn.length, 1);
    }));

  test('draws the badge again once the system turns dark or light, as the icon and its ground take the colors of the theme', () =>
    inWindow(async ({ tabs, turnDark, posted }) => {
      await tabs([tab('1', 'git')]);
      await turnDark();
      assert.deepStrictEqual(
        posted.map((message) =>
          message.type === 'taskbarBadge' ? message.png : undefined,
        ),
        ['data:image/png;base64,1', 'data:image/png;base64,2'],
      );
    }));

  test('clears the badge when its image could not be drawn, rather than leaving the one of the tool before', () =>
    inWindow(async ({ tabs, posted }) => {
      await tabs([tab('1', 'git')]);
      await tabs([tab('2', 'canvas')]);
      assert.deepStrictEqual(posted.at(-1), { type: 'taskbarBadge' });
    }));

  test('tells nothing while the tabs of the window are not known, as a window still loading has none yet', () =>
    inWindow(async ({ posted }) => {
      assert.deepStrictEqual(posted, []);
    }));
});
