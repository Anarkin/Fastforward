import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { strings } from '../../../lib/shared/strings';
import { ViewKeeper } from '../../../lib/page/viewKeeper';
import { noViews, type ToolViews } from '../../../shell/page/toolViews';
import type { EditorToHost, EditorToWebview } from '../shared/protocol';
import { editorActions } from './editorActions';
import { editorViewSchema } from './tabView';
import {
  editorDefaults,
  type EditorActions,
  type EditorSource,
  type EditorStoreState,
} from './editorShown';

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

function parsedOf(view: string): unknown {
  try {
    return JSON.parse(view);
  } catch {
    return undefined;
  }
}

export function createEditorStore(
  post: (message: EditorToHost) => void,
  initial: Partial<EditorSource> = {},
  views: ToolViews = noViews,
): StoreApi<EditorStoreState> {
  return createStore<EditorStoreState>()((set, get) => {
    const editor = editorActions(set, post);
    const known = new Set<string>();
    const shownWhenReleased = new Set<string>();
    const viewOf = (tab: string) => {
      if (!known.has(tab)) {
        return undefined;
      }
      const encoded = editorViewSchema.encode({
        ...editor.kept(tab),
        language: get().languages.get(tab),
      });
      return encoded === undefined ? undefined : JSON.stringify(encoded);
    };
    const keeper = new ViewKeeper(views, viewOf, () => get().tab);
    const restore = (tab: string, view: string) => {
      const kept = editorViewSchema.decode(parsedOf(view));
      if (kept === undefined) {
        return;
      }
      const { language, ...rest } = kept;
      set((state) => ({
        languages:
          language === undefined
            ? without(state.languages, tab)
            : new Map(state.languages).set(tab, language),
      }));
      editor.restore(tab, rest);
    };
    const letGo = (tab: string) => {
      known.delete(tab);
      keeper.forget(tab);
      editor.forget(tab);
      set((state) => ({ languages: without(state.languages, tab) }));
    };
    const changed = (tab: string) => keeper.changed(tab);
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
            known.add(message.tab);
            if (leaving !== message.tab) {
              const handed = keeper.handed(message.tab);
              if (handed !== undefined) {
                restore(message.tab, handed);
              }
            }
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
            shownWhenReleased.delete(message.tab);
            letGo(message.tab);
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
            break;
          case 'textChanged':
            set((state) =>
              state.edited?.tab === message.tab
                ? { edited: { ...state.edited, changed: message.changed } }
                : state,
            );
            break;
        }
        if (
          (message.type === 'show' || message.type === 'hide') &&
          leaving !== undefined &&
          leaving !== get().tab
        ) {
          if (shownWhenReleased.delete(leaving)) {
            letGo(leaving);
          } else {
            keeper.left(leaving);
          }
        }
      },
      keepEditing: (tab, change) => {
        editor.actions.keepEditing(tab, change);
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
      keepTabs: () => keeper.flush(),
      releaseTab: (tab) => {
        if (!known.has(tab)) {
          return undefined;
        }
        const view = keeper.release(tab);
        if (get().tab === tab) {
          shownWhenReleased.add(tab);
        } else {
          letGo(tab);
        }
        return view;
      },
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
