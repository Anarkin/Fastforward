import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { history, historyField } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import {
  Compartment,
  EditorState,
  Text,
  type Extension,
} from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  type ViewUpdate,
} from '@codemirror/view';
import type { Sentence } from '../../../lib/shared/sentences';
import { syntaxColors } from './editorColors';
import { appSelection } from './editorSelection';
import { appTextLook, blanksShown } from './editorText';
import { rowScrolling } from './editorScroll';
import type { ScrollSettings } from '../../../lib/page/scrollSettings';
import { colorer } from '../../../lib/page/syntax';
import { type CellTable } from '../../../lib/page/cellTable';
import { editorFind } from './editorFind';
import { commentsOf } from './editorComments';
import { editorKeys, type EditorKeyActions } from './editorCommands';
import { indentField, indentionOf } from './editorIndent';
import {
  savingRulesField,
  savingRulesOf,
  sinceSavedField,
} from './editorSaving';
import { editorKeymap } from './editorKeymap';
import {
  type EditorToWebviewOf,
  type TextShown,
  type EncodingSource,
  type EndingSource,
} from '../shared/protocol';
import { maxColoredBytes } from '../../../lib/shared/colorLimit';
import { type TextEncoding } from '../../../components/encodings/shared/textEncodings';
import { endingsField, endingsFrom, endingsUndone } from './editorEndings';
import { endingSigns } from './editorEndingSigns';
import { type Encoded } from './editorEncodings';
import { type EditorPlace } from './editorPlace';
import type { CursorLook } from '../../../lib/shared/cursorSettings';

export interface EditedTab {
  readonly tab: string;
  readonly file: string;
  readonly version: number | undefined;
  readonly encoding: TextEncoding | undefined;
  readonly bom: boolean;
  readonly onDisk: Encoded | undefined;
  readonly changed: boolean;
  readonly readOnly: boolean;
  readonly made: boolean;
  readonly error: Sentence | undefined;
  readonly endingSources: readonly EndingSource[] | undefined;
  readonly encodingSources: readonly EncodingSource[] | undefined;
}

export type ToEditor = EditorToWebviewOf<
  'editedText' | 'askOverwrite' | 'askChangedOnDisk'
>;

export const stateKeepDelay = 300;

export const bracketsClosed: Extension = [
  closeBrackets(),
  keymap.of(closeBracketsKeymap),
];

export interface EditorParts {
  readonly table: CellTable;
  readonly readOnly: boolean;
  readonly wrapping: Compartment;
  readonly wordWrap: boolean;
  readonly blanking: Compartment;
  readonly showWhitespace: boolean;
  readonly closing: Compartment;
  readonly closesBrackets: boolean;
  readonly coloring: Compartment;
  readonly colors: Extension;
  readonly keys: EditorKeyActions;
  readonly scrolling: () => ScrollSettings;
  readonly cursor: CursorLook;
  readonly onUpdate: (update: ViewUpdate) => void;
}

export function extensionsOf({
  table,
  readOnly,
  wrapping,
  wordWrap,
  blanking,
  showWhitespace,
  closing,
  closesBrackets,
  coloring,
  colors,
  keys,
  scrolling,
  cursor,
  onUpdate,
}: EditorParts): Extension {
  return [
    coloring.of(colors),
    appTextLook(table),
    appSelection(editorKeymap.rowEnd, cursor),
    lineNumbers(),
    bracketMatching(),
    history(),
    endingsUndone,
    editorFind,
    wrapping.of(wordWrap ? EditorView.lineWrapping : []),
    blanking.of(blanksShown.of(showWhitespace)),
    closing.of(closesBrackets ? bracketsClosed : []),
    endingSigns,
    EditorState.readOnly.of(readOnly),
    EditorView.contentAttributes.of({
      spellcheck: 'false',
      autocorrect: 'off',
      autocapitalize: 'off',
    }),
    editorKeys(keys),
    rowScrolling(scrolling),
    EditorView.updateListener.of(onUpdate),
  ];
}

export function stateOf(
  shown: TextShown,
  kept: unknown,
  extensions: Extension,
): EditorState {
  const doc = Text.of(shown.text.split(lineBreak));
  const all = [
    extensions,
    endingsFrom(doc, shown),
    indentionOf(doc, shown),
    sinceSavedField,
    savingRulesOf(shown),
  ];
  if (typeof kept === 'object' && kept !== null) {
    try {
      return EditorState.fromJSON(
        { ...kept, doc: shown.text },
        { extensions: all },
        { history: historyField },
      );
    } catch {
      return EditorState.create({ doc, extensions: all });
    }
  }
  return EditorState.create({ doc, extensions: all });
}

export function settingsKept(
  state: EditorState,
  replaced: EditorState,
  compartments: readonly Compartment[],
): EditorState {
  return state.update({
    effects: compartments.map((compartment) =>
      compartment.reconfigure(compartment.get(replaced) ?? []),
    ),
  }).state;
}

export const lineBreak = String.fromCharCode(10);

export function keptJson(
  state: EditorState,
  place: EditorPlace | undefined,
): unknown {
  const json: unknown = state.toJSON({ history: historyField });
  return typeof json === 'object' && json !== null
    ? {
        selection: Reflect.get(json, 'selection'),
        history: Reflect.get(json, 'history'),
        ...(place !== undefined && { place }),
      }
    : undefined;
}

export const colorsOf = (
  language: string | undefined,
  on: boolean,
): Extension => [
  on ? syntaxColors(language, colorer, maxColoredBytes) : [],
  commentsOf(language),
];

export const fieldsKept = [
  endingsField,
  indentField,
  sinceSavedField,
  savingRulesField,
];
