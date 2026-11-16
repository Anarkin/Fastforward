import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act, createElement, type ReactNode } from 'react';
import { createShellStore, ShellStore } from '../../../../../shell/page/store';
import type {
  ByteRange,
  CommanderToHost,
  CommanderToWebview,
  TextRow,
} from '../../../../../tools/commander/shared/protocol';
import { noop } from '../../../../helpers/fixtures';
import { terminalCells } from '../../../../../lib/page/cellTable';
import type { ToHost } from '../../../../../shell/shared/protocol';
import type { ToolViews } from '../../../../../shell/page/toolViews';

const toolScreen = 10;

export const commanderSettings: CommanderToWebview = {
  type: 'settings',
  showHidden: true,
  sort: {
    left: { column: 'extension', descending: false, groupByColor: false },
    right: { column: 'extension', descending: false, groupByColor: false },
  },
  columns: { extension: 10, size: 15, date: 16 },
  defaultColumns: { extension: 10, size: 15, date: 16 },
  canElevate: false,
  platform: 'win32',
  thumbnailSize: 144,
  fileColors: [],
  bookmarks: [],
};

export function listingOf(
  tab: string,
  side: 'left' | 'right',
  folder: string,
  names: readonly string[],
): CommanderToWebview {
  return {
    type: 'listing',
    tab,
    side,
    folder,
    hidden: [],
    entries: names.map((name) => ({
      name,
      folder: false,
      link: false,
      hidden: false,
      size: 1,
      modified: 0,
    })),
    parent: true,
    back: false,
    forward: false,
    elevated: false,
    selected: names[0],
  };
}

export interface ViewedText {
  readonly rows: readonly TextRow[];
  readonly size: number;
}

export function viewedTextOf(lines: readonly string[]): ViewedText {
  const rows: TextRow[] = [];
  let start = 0;
  for (const text of lines) {
    rows.push({ start, end: start + text.length + 1, text });
    start += text.length + 1;
  }
  return { rows, size: start };
}

function matchesOf(file: ViewedText, query: string): readonly ByteRange[] {
  return file.rows.flatMap((row) => {
    const at = row.text.toLowerCase().indexOf(query.toLowerCase());
    return at === -1
      ? []
      : [{ start: row.start + at, end: row.start + at + query.length }];
  });
}

type ReadRows = Extract<CommanderToHost, { type: 'readRows' }>;

type FindText = Extract<CommanderToHost, { type: 'findText' }>;

function rowsAnswer(file: ViewedText, ask: ReadRows): CommanderToWebview {
  const start = ask.exact
    ? Math.min(ask.anchor, file.size)
    : (file.rows.find((row) => ask.anchor < row.end)?.start ?? file.size);
  const found = file.rows.findIndex((row) => row.start >= start);
  const index = found === -1 ? file.rows.length : found;
  const earlier = file.rows.slice(Math.max(0, index - ask.before), index);
  const later = file.rows.slice(index, index + ask.after);
  return {
    type: 'rows',
    tab: ask.tab,
    request: ask.request,
    size: file.size,
    rows: [...earlier, ...later],
    anchorIndex: earlier.length,
  };
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

export interface ShownTool {
  readonly window: JSDOM['window'];
  readonly document: Document;
  readonly posted: CommanderToHost[];
  readonly kept: ToHost[];
  readonly hand: (tab: string, view: string) => void;
  readonly send: (message: CommanderToWebview) => Promise<void>;
  readonly shown: (active: boolean) => Promise<void>;
  readonly press: (
    key: string,
    modifiers?: { readonly ctrlKey?: boolean; readonly shiftKey?: boolean },
  ) => Promise<void>;
  readonly keyUp: (key: string) => Promise<void>;
  readonly type: (text: string) => Promise<void>;
  readonly click: (element: Element | null | undefined) => Promise<void>;
  readonly focus: (element: Element | null | undefined) => Promise<void>;
  readonly answerRows: (file: ViewedText) => Promise<number>;
  readonly answerFinds: (file: ViewedText) => Promise<number>;
  readonly answerBytes: (bytes: readonly number[]) => Promise<number>;
  readonly asked: <T extends CommanderToHost['type']>(
    type: T,
  ) => Extract<CommanderToHost, { type: T }>[];
  readonly settle: () => Promise<void>;
}

type Tool = (props: {
  readonly active: boolean;
  readonly post: (message: CommanderToHost) => void;
  readonly listen: (
    handler: (message: CommanderToWebview) => void,
  ) => () => void;
  readonly views?: ToolViews;
}) => ReactNode;

export async function inCommanderTool(
  shownTool: Tool,
  run: (tool: ShownTool) => Promise<void>,
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
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('viewer-body') ? toolScreen : 0;
    },
  });
  const globals = {
    matchMedia: dom.window.matchMedia,
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    Node: dom.window.Node,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    MutationObserver: dom.window.MutationObserver,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    getSelection: dom.window.getSelection.bind(dom.window),
    devicePixelRatio: 1,
    ResizeObserver: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  try {
    const { createRoot } = await import('react-dom/client');
    await terminalCells();
    const { document } = dom.window;
    const main = document.querySelector('main');
    assert.ok(main);
    const root = createRoot(main);
    const posted: CommanderToHost[] = [];
    const answered = new Set<CommanderToHost>();
    let told: (message: CommanderToWebview) => void = noop;
    const kept: ToHost[] = [];
    const shell = createShellStore((message) => kept.push(message));
    const draw = (active: boolean) =>
      root.render(
        createElement(
          ShellStore,
          { value: shell },
          createElement(shownTool, {
            active,
            post: (message: CommanderToHost) => posted.push(message),
            listen: (handler: (message: CommanderToWebview) => void) => {
              told = handler;
              return noop;
            },
            views: shell.getState().channels.commander.views,
          }),
        ),
      );
    await act(async () => draw(true));
    const send = (message: CommanderToWebview) =>
      act(async () => told(message));
    const unanswered = <T extends CommanderToHost['type']>(type: T) =>
      posted.filter(
        (message): message is Extract<CommanderToHost, { type: T }> =>
          message.type === type && !answered.has(message),
      );
    await settle();
    const running = run({
      window: dom.window,
      document,
      posted,
      kept,
      hand: (tab, view) =>
        shell.getState().receive({ type: 'view', tab, view }),
      send,
      shown: (active) => act(async () => draw(active)),
      press: (key, modifiers = {}) =>
        act(async () => {
          (document.activeElement ?? document.body).dispatchEvent(
            new dom.window.KeyboardEvent('keydown', {
              key,
              bubbles: true,
              cancelable: true,
              ...modifiers,
            }),
          );
        }),
      keyUp: (key) =>
        act(async () => {
          (document.activeElement ?? document.body).dispatchEvent(
            new dom.window.KeyboardEvent('keyup', { key, bubbles: true }),
          );
        }),
      type: (text) =>
        act(async () => {
          const field = document.activeElement;
          assert.ok(field instanceof dom.window.HTMLInputElement);
          Reflect.set(
            dom.window.HTMLInputElement.prototype,
            'value',
            text,
            field,
          );
          field.setSelectionRange(text.length, text.length);
          field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        }),
      click: (element) =>
        act(async () => {
          element?.dispatchEvent(
            new dom.window.MouseEvent('click', { bubbles: true }),
          );
        }),
      focus: (element) =>
        act(async () => {
          assert.ok(element instanceof dom.window.HTMLElement);
          element.focus();
        }),
      answerRows: async (file) => {
        let count = 0;
        for (
          let ask = unanswered('readRows')[0];
          ask !== undefined;
          ask = unanswered('readRows')[0]
        ) {
          answered.add(ask);
          count += 1;
          await send(rowsAnswer(file, ask));
        }
        return count;
      },
      answerFinds: async (file) => {
        const finds: FindText[] = unanswered('findText');
        for (const ask of finds) {
          answered.add(ask);
          await send({
            type: 'found',
            tab: ask.tab,
            request: ask.request,
            matches: matchesOf(file, ask.query),
            capped: false,
            done: true,
          });
        }
        return finds.length;
      },
      answerBytes: async (bytes) => {
        let count = 0;
        for (
          let ask = unanswered('readBytes')[0];
          ask !== undefined;
          ask = unanswered('readBytes')[0]
        ) {
          answered.add(ask);
          count += 1;
          await send({
            type: 'bytes',
            tab: ask.tab,
            request: ask.request,
            start: ask.start,
            data: bytes.slice(ask.start, ask.start + ask.length),
          });
        }
        return count;
      },
      asked: unanswered,
      settle,
    });
    try {
      await running;
    } finally {
      await act(async () => root.unmount());
    }
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor === undefined) {
        Reflect.deleteProperty(globalThis, name);
      } else {
        Object.defineProperty(globalThis, name, descriptor);
      }
    }
  }
}
