import type { CommanderActions, KeptEditor } from './commanderState';
import type { StoreParts } from './dialogActions';
import type { ToEditor } from './editorState';

type EditorActions = Pick<
  CommanderActions,
  | 'editFile'
  | 'listenEditor'
  | 'keptEditor'
  | 'keepEditor'
  | 'readEdited'
  | 'editText'
  | 'keepEditState'
  | 'saveText'
  | 'reloadEdited'
  | 'editSource'
  | 'editViewed'
  | 'saveIn'
  | 'reopenIn'
>;

export function editorActions({ post, onPane }: StoreParts): {
  readonly actions: EditorActions;
  readonly heard: (message: ToEditor) => void;
  readonly forget: (tab: string) => void;
} {
  const editorListeners = new Set<(message: ToEditor) => void>();
  const keptEditors = new Map<string, KeptEditor>();
  const listenEditor = (handler: (message: ToEditor) => void) => {
    editorListeners.add(handler);
    return () => {
      editorListeners.delete(handler);
    };
  };
  return {
    heard: (message) => {
      for (const handler of editorListeners) {
        handler(message);
      }
    },
    forget: (tab) => {
      keptEditors.delete(tab);
    },
    actions: {
      editFile: (side, name) =>
        onPane(side, (tab, folder) =>
          post({ type: 'editFile', tab, side, folder, name }),
        ),
      listenEditor,
      keptEditor: (tab) => keptEditors.get(tab),
      keepEditor: (tab, kept) => {
        keptEditors.set(tab, kept);
      },
      readEdited: (tab) => post({ type: 'readEdited', tab }),
      editText: (tab, update) => post({ type: 'editText', tab, update }),
      keepEditState: (tab, version, state) =>
        post({ type: 'editState', tab, version, state }),
      saveText: (tab, overwrite) =>
        post({
          type: 'saveText',
          tab,
          ...(overwrite?.readOnly === true && { overwriteReadOnly: true }),
          ...(overwrite?.changed === true && { overwriteChanged: true }),
        }),
      reloadEdited: (tab) => post({ type: 'reloadEdited', tab }),
      editSource: (tab, file) => post({ type: 'editSource', tab, file }),
      editViewed: (tab, at, encoding) =>
        post({
          type: 'editViewed',
          tab,
          at,
          ...(encoding !== undefined && { encoding }),
        }),
      saveIn: (tab, encoding, bom) =>
        post({ type: 'saveIn', tab, encoding, bom }),
      reopenIn: (tab, encoding) => post({ type: 'reopenIn', tab, encoding }),
    },
  };
}
