import type { EditorState } from '@codemirror/state';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import type { EditorToWebview } from '../shared/protocol';
import type { EditorAsk, KeptEditing } from './editing';
import type { EditorPlace } from './place';
import type { EditedTab, ToEditor } from './setup';

export interface KeptEditor {
  readonly state: EditorState;
  readonly version: number;
  readonly place?: EditorPlace | undefined;
}

export interface EditorSource {
  readonly tab: string | undefined;
  readonly file: string | undefined;
  readonly edited: EditedTab | undefined;
  readonly asks: ReadonlyMap<string, EditorAsk>;
  readonly closeBrackets: boolean;
  readonly languages: ReadonlyMap<string, string>;
  readonly editings: ReadonlyMap<string, KeptEditing>;
}

export interface EditorActions {
  readonly receive: (message: EditorToWebview) => void;
  readonly listenEditor: (handler: (message: ToEditor) => void) => () => void;
  readonly readEdited: (tab: string) => void;
  readonly editText: (tab: string, update: unknown) => void;
  readonly keepEditState: (
    tab: string,
    version: number,
    state: unknown,
  ) => void;
  readonly saveText: (
    tab: string,
    overwrite?: { readonly readOnly?: boolean; readonly changed?: boolean },
  ) => void;
  readonly reloadEdited: (tab: string) => void;
  readonly compareVersions: (tab: string) => void;
  readonly viewEdited: (tab: string, at: number) => void;
  readonly editSource: (tab: string, file: string) => void;
  readonly saveIn: (
    tab: string,
    encoding: TextEncoding | 'auto',
    bom: boolean,
  ) => void;
  readonly reopenIn: (
    tab: string,
    encoding: TextEncoding | 'auto',
    discard?: true,
  ) => void;
  readonly keptEditor: (tab: string) => KeptEditor | undefined;
  readonly keptEditing: (tab: string) => KeptEditing;
  readonly keepEditing: (tab: string, change: Partial<KeptEditing>) => void;
  readonly answerEditorAsk: (tab: string) => void;
  readonly editorKeeper: (tab: string) => (kept: KeptEditor) => void;
  readonly chooseLanguage: (language: string | undefined) => void;
  readonly keepTabs: () => void;
  readonly releaseTab: (tab: string) => string | undefined;
}

export type EditorStoreState = EditorSource & EditorActions;

export const editorDefaults: EditorSource = {
  tab: undefined,
  file: undefined,
  edited: undefined,
  asks: new Map(),
  closeBrackets: false,
  languages: new Map(),
  editings: new Map(),
};

export const editedShown = (state: EditorSource): EditedTab | undefined =>
  state.edited?.tab === state.tab ? state.edited : undefined;

export const languageShown = (state: EditorSource): string | undefined =>
  state.tab === undefined ? undefined : state.languages.get(state.tab);
