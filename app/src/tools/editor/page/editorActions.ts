import type { StoreApi } from 'zustand';
import type { EditorToHost } from '../shared/protocol';
import type { ToEditor } from './editorState';
import { noKeptEditing, type KeptEditing } from './editorKept';
import type {
  EditorActions,
  EditorStoreState,
  KeptEditor,
} from './editorShown';

type EditorKept = Partial<KeptEditing>;

type StreamActions = Pick<
  EditorActions,
  | 'listenEditor'
  | 'keptEditor'
  | 'keptEditing'
  | 'keepEditing'
  | 'answerEditorAsk'
  | 'editorKeeper'
  | 'readEdited'
  | 'editText'
  | 'keepEditState'
  | 'saveText'
  | 'reloadEdited'
  | 'editSource'
  | 'saveIn'
  | 'reopenIn'
>;

const askOf = {
  askOverwrite: 'overwrite',
  askChangedOnDisk: 'changed',
} as const;

export function editorActions(
  set: StoreApi<EditorStoreState>['setState'],
  post: (message: EditorToHost) => void,
): {
  readonly actions: StreamActions;
  readonly heard: (message: ToEditor) => void;
  readonly forget: (tab: string) => void;
  readonly kept: (tab: string) => EditorKept;
  readonly restore: (tab: string, kept: EditorKept) => void;
} {
  const editorListeners = new Set<(message: ToEditor) => void>();
  const keptEditors = new Map<string, KeptEditor>();
  const keptEditings = new Map<string, KeptEditing>();
  const openTabs = new Map<string, object>();
  const openTabOf = (tab: string) => {
    const known = openTabs.get(tab);
    if (known !== undefined) {
      return known;
    }
    const open = {};
    openTabs.set(tab, open);
    return open;
  };
  const answered = (tab: string) =>
    set((state) => {
      if (!state.asks.has(tab)) {
        return state;
      }
      const asks = new Map(state.asks);
      asks.delete(tab);
      return { asks };
    });
  const listenEditor = (handler: (message: ToEditor) => void) => {
    editorListeners.add(handler);
    return () => {
      editorListeners.delete(handler);
    };
  };
  return {
    heard: (message) => {
      if (
        message.type === 'askOverwrite' ||
        message.type === 'askChangedOnDisk'
      ) {
        set((state) => ({
          asks: new Map(state.asks).set(message.tab, askOf[message.type]),
        }));
      }
      for (const handler of editorListeners) {
        handler(message);
      }
    },
    forget: (tab) => {
      keptEditors.delete(tab);
      keptEditings.delete(tab);
      openTabs.delete(tab);
      answered(tab);
    },
    kept: (tab) => keptEditings.get(tab) ?? noKeptEditing,
    restore: (tab, kept) => {
      keptEditors.delete(tab);
      keptEditings.set(tab, {
        finding: kept.finding ?? noKeptEditing.finding,
        replacing: kept.replacing ?? noKeptEditing.replacing,
        query: kept.query ?? noKeptEditing.query,
        replacement: kept.replacement ?? noKeptEditing.replacement,
        focus: kept.focus,
        goingToLine: kept.goingToLine,
        reopening: kept.reopening,
      });
    },
    actions: {
      listenEditor,
      keptEditor: (tab) => keptEditors.get(tab),
      keptEditing: (tab) => keptEditings.get(tab) ?? noKeptEditing,
      answerEditorAsk: answered,
      keepEditing: (tab, change) => {
        keptEditings.set(tab, {
          ...(keptEditings.get(tab) ?? noKeptEditing),
          ...change,
        });
      },
      editorKeeper: (tab) => {
        const open = openTabOf(tab);
        return (kept) => {
          if (openTabs.get(tab) === open) {
            keptEditors.set(tab, kept);
          }
        };
      },
      readEdited: (tab) => post({ type: 'readEdited', tab }),
      editText: (tab, update) => post({ type: 'editText', tab, update }),
      keepEditState: (tab, version, state) =>
        post({ type: 'editState', tab, version, state: JSON.stringify(state) }),
      saveText: (tab, overwrite) =>
        post({
          type: 'saveText',
          tab,
          ...(overwrite?.readOnly === true && { overwriteReadOnly: true }),
          ...(overwrite?.changed === true && { overwriteChanged: true }),
        }),
      reloadEdited: (tab) => post({ type: 'reloadEdited', tab }),
      editSource: (tab, file) => post({ type: 'editSource', tab, file }),
      saveIn: (tab, encoding, bom) =>
        post({ type: 'saveIn', tab, encoding, bom }),
      reopenIn: (tab, encoding) => post({ type: 'reopenIn', tab, encoding }),
    },
  };
}
