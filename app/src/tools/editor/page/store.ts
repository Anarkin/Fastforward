import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { TabLife } from '../../../lib/page/tabLife';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';
import type { EditorToHost, EditorToWebview } from '../shared/protocol';
import { editorActions } from './actions';
import { noKeptEditing } from './editing';
import { editorViewSchema } from './tabView';
import {
  editorDefaults,
  type EditorActions,
  type EditorSource,
  type EditorStoreState,
} from './state';

const streams: ReadonlySet<EditorToWebview['type']> = new Set([
  'editedText',
  'askOverwrite',
  'askChangedOnDisk',
]);

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

export function createEditorStore(
  post: (message: EditorToHost) => void,
  initial: Partial<EditorSource> = {},
  views: ToolViews = noViews,
): StoreApi<EditorStoreState> {
  return createStore<EditorStoreState>()((set, get) => {
    const editor = editorActions(set, post);
    const tabs = new TabLife(
      views,
      editorViewSchema,
      {
        viewOf: (tab) => ({
          ...(get().editings.get(tab) ?? noKeptEditing),
          language: get().languages.get(tab),
        }),
        restore: (tab, { language, ...kept }) => {
          editor.restore(tab);
          set((state) => ({
            languages:
              language === undefined
                ? without(state.languages, tab)
                : new Map(state.languages).set(tab, language),
            editings: new Map(state.editings).set(tab, {
              finding: kept.finding ?? noKeptEditing.finding,
              replacing: kept.replacing ?? noKeptEditing.replacing,
              query: kept.query ?? noKeptEditing.query,
              replacement: kept.replacement ?? noKeptEditing.replacement,
              focus: kept.focus,
              goingToLine: kept.goingToLine,
              reopening: kept.reopening,
            }),
          }));
        },
        forget: (tab) => {
          editor.forget(tab);
          set((state) => ({
            languages: without(state.languages, tab),
            editings: without(state.editings, tab),
          }));
        },
      },
      () => get().tab,
    );
    const changed = (tab: string) => tabs.changed(tab);
    const actions: EditorActions = {
      ...editor.actions,
      receive: (message) => {
        if (streams.has(message.type)) {
          if (
            message.type === 'editedText' ||
            message.type === 'askOverwrite' ||
            message.type === 'askChangedOnDisk'
          ) {
            editor.heard(message);
          }
          return;
        }
        const leaving = get().tab;
        switch (message.type) {
          case 'show': {
            tabs.showing(message.tab, leaving);
            set((state) => ({
              tab: message.tab,
              file: message.file,
              edited:
                state.edited?.tab === message.tab ? state.edited : undefined,
            }));
            break;
          }
          case 'hide':
            set({ tab: undefined, file: undefined, edited: undefined });
            break;
          case 'closed':
            if (get().tab === message.tab) {
              set({ tab: undefined, file: undefined, edited: undefined });
            }
            tabs.closed(message.tab);
            break;
          case 'settings':
            set({ closeBrackets: message.closeBrackets });
            break;
          case 'editing':
            set({
              edited: {
                tab: message.tab,
                file: message.file,
                version: message.version,
                encoding: message.encoding,
                bom: message.bom === true,
                onDisk: message.onDisk,
                changed: message.changed === true,
                readOnly: message.readOnly === true,
                made: message.made === true,
                error: message.error,
                endingSources: message.endingSources,
                encodingSources: message.encodingSources,
              },
            });
            if (
              message.changed !== true &&
              get().editings.get(message.tab)?.reopening !== undefined
            ) {
              get().keepEditing(message.tab, { reopening: undefined });
            }
            break;
          case 'askReopen':
            get().keepEditing(message.tab, { reopening: message.encoding });
            break;
          case 'textChanged':
            set((state) =>
              state.edited?.tab === message.tab
                ? { edited: { ...state.edited, changed: message.changed } }
                : state,
            );
            break;
        }
        if (message.type === 'show' || message.type === 'hide') {
          tabs.settled(leaving, get().tab);
        }
      },
      keptEditing: (tab) => get().editings.get(tab) ?? noKeptEditing,
      keepEditing: (tab, change) => {
        set((state) => ({
          editings: new Map(state.editings).set(tab, {
            ...(state.editings.get(tab) ?? noKeptEditing),
            ...change,
          }),
        }));
        changed(tab);
      },
      chooseLanguage: (language) => {
        const { tab } = get();
        if (tab === undefined) {
          return;
        }
        set((state) => ({
          languages:
            language === undefined
              ? without(state.languages, tab)
              : new Map(state.languages).set(tab, language),
        }));
        changed(tab);
      },
      keepTabs: () => tabs.flush(),
      releaseTab: (tab) => tabs.release(tab, get().tab),
    };
    return { ...editorDefaults, ...initial, ...actions };
  });
}

export const EditorStore = createContext<
  StoreApi<EditorStoreState> | undefined
>(undefined);

function useEditorStore(): StoreApi<EditorStoreState> {
  const store = useContext(EditorStore);
  if (store === undefined) {
    throw new Error(strings.errors.storeOutsideProvider('editor'));
  }
  return store;
}

export function useEditor<T>(select: (state: EditorStoreState) => T): T {
  return useStore(useEditorStore(), select);
}

export function useEditorActions(): EditorActions {
  return useEditorStore().getState();
}
