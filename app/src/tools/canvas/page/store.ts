import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { TabLife } from '../../../lib/page/tabLife';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';
import type { Board } from '../shared/board';
import type { CanvasToHost } from '../shared/protocol';
import { canvasViewSchema } from './tabView';
import { snapped } from './pan';
import {
  canvasDefaults,
  type CanvasActions,
  type CanvasSource,
  type CanvasState,
  type Typing,
} from './state';

interface Kept {
  readonly id: string;
  readonly anchor: number;
  readonly head: number;
}

function textOf(board: Board | undefined, id: string): string | undefined {
  const node = board?.nodes.find((each) => each.id === id);
  if (node?.type === 'group') {
    return node.label ?? '';
  }
  return node?.type === 'text' ? node.text : undefined;
}

function typingIn(
  text: string,
  { id, anchor, head }: Kept,
  session: number,
): Typing {
  const within = (at: number) => Math.max(0, Math.min(text.length, at));
  return { id, text, anchor: within(anchor), head: within(head), session };
}

const hidden = { tab: undefined, file: undefined };

function without<T>(
  map: ReadonlyMap<string, T>,
  tab: string,
): ReadonlyMap<string, T> {
  if (!map.has(tab)) {
    return map;
  }
  const next = new Map(map);
  next.delete(tab);
  return next;
}

export function createCanvasStore(
  post: (message: CanvasToHost) => void,
  initial: Partial<CanvasSource> = {},
  views: ToolViews = noViews,
): StoreApi<CanvasState> {
  return createStore<CanvasState>()((set, get) => {
    let sessions = Date.now();
    const kept = new Map<string, Kept>();
    const typingAfter = (
      tab: string,
      board: Board | undefined,
      made: string | undefined,
    ): Typing | undefined => {
      if (made !== undefined) {
        const text =
          board?.nodes.find((each) => each.id === made)?.type === 'text'
            ? textOf(board, made)
            : undefined;
        return text === undefined
          ? undefined
          : typingIn(
              text,
              { id: made, anchor: text.length, head: text.length },
              ++sessions,
            );
      }
      const waiting = kept.get(tab);
      if (waiting !== undefined) {
        kept.delete(tab);
        const text = textOf(board, waiting.id);
        return text === undefined
          ? undefined
          : typingIn(text, waiting, ++sessions);
      }
      const typing = get().typings.get(tab);
      return typing === undefined || textOf(board, typing.id) === undefined
        ? undefined
        : typing;
    };
    const tabs = new TabLife(
      views,
      canvasViewSchema,
      {
        viewOf: (tab) => {
          const typing = get().typings.get(tab) ?? kept.get(tab);
          return {
            origin: get().origins.get(tab),
            selected: get().selections.get(tab),
            coloring: get().colorings.get(tab),
            typing:
              typing === undefined
                ? undefined
                : { id: typing.id, anchor: typing.anchor, head: typing.head },
          };
        },
        restore: (tab, { origin, selected, typing, coloring }) => {
          const text =
            typing === undefined
              ? undefined
              : textOf(get().boards.get(tab)?.board, typing.id);
          if (typing !== undefined && text === undefined) {
            kept.set(tab, typing);
          }
          set((state) => ({
            origins:
              origin === undefined
                ? without(state.origins, tab)
                : new Map(state.origins).set(tab, snapped(origin)),
            selections:
              selected === undefined
                ? without(state.selections, tab)
                : new Map(state.selections).set(tab, selected),
            colorings:
              coloring === undefined
                ? without(state.colorings, tab)
                : new Map(state.colorings).set(tab, coloring),
            typings:
              typing === undefined || text === undefined
                ? without(state.typings, tab)
                : new Map(state.typings).set(
                    tab,
                    typingIn(text, typing, ++sessions),
                  ),
          }));
        },
        forget: (tab) => {
          kept.delete(tab);
          set((state) => ({
            typings: without(state.typings, tab),
            origins: without(state.origins, tab),
            selections: without(state.selections, tab),
            colorings: without(state.colorings, tab),
          }));
        },
      },
      () => get().tab,
    );
    const actions: CanvasActions = {
      receive: (message) => {
        const leaving = get().tab;
        switch (message.type) {
          case 'show':
            tabs.showing(message.tab, leaving);
            set({ tab: message.tab, file: message.file });
            break;
          case 'hide':
            set({ ...hidden, placing: undefined });
            break;
          case 'files':
            set((state) => ({
              files: new Map(state.files).set(message.tab, message.files),
            }));
            break;
          case 'titles':
            set((state) => ({
              titles: new Map([
                ...state.titles,
                ...Object.entries(message.titles),
              ]),
            }));
            break;
          case 'closed': {
            const boards = new Map(get().boards);
            boards.delete(message.tab);
            const files = without(get().files, message.tab);
            set(
              get().tab === message.tab
                ? { ...hidden, boards, files }
                : { boards, files },
            );
            tabs.closed(message.tab);
            break;
          }
          case 'board': {
            const { type: _type, tab, made, ...shown } = message;
            const ids = new Set([
              ...(shown.board?.nodes.map((node) => node.id) ?? []),
              ...(shown.board?.edges.map((edge) => edge.id) ?? []),
            ]);
            const still = (get().selections.get(tab) ?? []).filter((id) =>
              ids.has(id),
            );
            const typing = typingAfter(tab, shown.board, made);
            set((state) => ({
              boards: new Map(state.boards).set(tab, shown),
              selections: new Map(state.selections).set(
                tab,
                made === undefined ? still : [made],
              ),
              typings:
                typing === undefined
                  ? without(state.typings, tab)
                  : new Map(state.typings).set(tab, typing),
            }));
            tabs.changed(tab);
            break;
          }
          default:
            message satisfies never;
        }
        if (message.type === 'show' || message.type === 'hide') {
          tabs.settled(leaving, get().tab);
        }
      },
      pan: (tab, origin) => {
        set((state) => ({ origins: new Map(state.origins).set(tab, origin) }));
        tabs.changed(tab);
      },
      originOf: (tab) => get().origins.get(tab),
      typingOf: (tab) => get().typings.get(tab),
      select: (tab, ids) => {
        set((state) => ({
          selections: new Map(state.selections).set(tab, ids),
        }));
        tabs.changed(tab);
      },
      selectedOf: (tab) => get().selections.get(tab) ?? [],
      place: (placing) => set({ placing }),
      startTyping: (tab, id, span) => {
        const text = textOf(get().boards.get(tab)?.board, id);
        if (text === undefined) {
          return;
        }
        const typing = typingIn(
          text,
          {
            id,
            anchor: span?.anchor ?? text.length,
            head: span?.head ?? text.length,
          },
          ++sessions,
        );
        set((state) => ({
          typings: new Map(state.typings).set(tab, typing),
          selections: new Map(state.selections).set(tab, [id]),
        }));
        tabs.changed(tab);
      },
      typed: (tab, caret) => {
        const typing = get().typings.get(tab);
        if (typing === undefined) {
          return;
        }
        set((state) => ({
          typings: new Map(state.typings).set(tab, {
            id: typing.id,
            session: typing.session,
            ...caret,
          }),
        }));
        if (caret.text !== typing.text) {
          post({
            type: 'edit',
            tab,
            edit: {
              kind: 'text',
              id: typing.id,
              text: caret.text,
              session: typing.session,
            },
          });
        }
        tabs.changed(tab);
      },
      stopTyping: (tab) => {
        kept.delete(tab);
        set((state) => ({ typings: without(state.typings, tab) }));
        tabs.changed(tab);
      },
      edit: (tab, edit) => post({ type: 'edit', tab, edit }),
      undo: (tab) => post({ type: 'undo', tab }),
      redo: (tab) => post({ type: 'redo', tab }),
      save: (tab) => post({ type: 'save', tab }),
      askColor: (tab, { nodes, edges }) => {
        set((state) => ({
          colorings: new Map(state.colorings).set(tab, { nodes, edges }),
        }));
        tabs.changed(tab);
      },
      keepColorTyped: (tab, typed) => {
        const coloring = get().colorings.get(tab);
        if (coloring === undefined) {
          return;
        }
        set((state) => ({
          colorings: new Map(state.colorings).set(tab, { ...coloring, typed }),
        }));
        tabs.changed(tab);
      },
      answerColor: (tab, color) => {
        const coloring = get().colorings.get(tab);
        set((state) => ({ colorings: without(state.colorings, tab) }));
        tabs.changed(tab);
        if (coloring !== undefined && color !== undefined) {
          post({
            type: 'edit',
            tab,
            edit: {
              kind: 'color',
              nodes: coloring.nodes,
              edges: coloring.edges,
              color,
            },
          });
        }
      },
      keepTabs: () => tabs.flush(),
      releaseTab: (tab) => tabs.release(tab, get().tab),
    };
    return { ...canvasDefaults, ...initial, ...actions };
  });
}

export const CanvasStore = createContext<StoreApi<CanvasState> | undefined>(
  undefined,
);

function useCanvasStore(): StoreApi<CanvasState> {
  const store = useContext(CanvasStore);
  if (store === undefined) {
    throw new Error(strings.errors.storeOutsideProvider('canvas'));
  }
  return store;
}

export function useCanvas<T>(select: (state: CanvasState) => T): T {
  return useStore(useCanvasStore(), select);
}

export function useCanvasActions(): CanvasActions {
  return useCanvasStore().getState();
}
