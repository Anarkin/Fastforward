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
import { strings, type Sentence } from '../../../lib/shared/strings';
import { syntaxColors } from './editorColors';
import { appSelection } from './editorSelection';
import { appTextLook, blanksShown } from './editorText';
import { rowScrolling } from './editorScroll';
import type { ScrollSettings } from '../../../lib/page/rowScroll';
import { colorer } from '../../../lib/page/syntax';
import {
  cellWidthsOf,
  columnsOf,
  type CellTable,
} from '../../../lib/page/textWidths';
import { editorFind } from './editorFind';
import {
  commentsOf,
  editorKeys,
  indentField,
  indentionOf,
  type EditorKeyActions,
} from './editorCommands';
import {
  savingRulesField,
  savingRulesOf,
  sinceSavedField,
} from './editorSaving';
import { editorKeymap } from './keymap';
import {
  maxColoredBytes,
  type CommanderToWebviewOf,
  type TextEncoding,
  type TextShown,
  type EncodingSource,
  type EndingSource,
} from '../shared/protocol';
import {
  endingCounts,
  endingsField,
  endingsFrom,
  endingSigns,
  endingsUndone,
} from './editorEndings';
import type { LineEnding } from '../shared/textMarks';
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

export type ToEditor = CommanderToWebviewOf<
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

export const lineBreak = String.fromCharCode(10);

export interface EndingsShown {
  readonly ending: LineEnding;
  readonly counts: Readonly<Record<LineEnding, number>>;
}

const endingOrder: readonly LineEnding[] = ['lf', 'crlf', 'cr'];

export function endingsShownOf(state: EditorState): EndingsShown {
  return {
    ending: state.field(endingsField).ending,
    counts: endingCounts(state),
  };
}

export function endingsLabel({ ending, counts }: EndingsShown): string {
  const used = endingOrder.filter((each) => counts[each] > 0);
  return used.length > 1
    ? strings.editor.mixed
    : strings.editor.endingNames[used[0] ?? ending];
}

export const linesEnding = ({ ending, counts }: EndingsShown) =>
  endingOrder.some((each) => counts[each] > 0) ? ending : undefined;

export function endingsTitle({ ending, counts }: EndingsShown): string {
  return strings.editor.endingCounts(
    endingOrder
      .filter((each) => counts[each] > 0)
      .map((each) =>
        strings.editor.linesEndingIn(
          counts[each],
          strings.editor.endingNames[each],
        ),
      ),
    strings.editor.endingNames[ending],
  );
}

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

const graphemes = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

const countedCharacters = 1_000_000;

function charactersIn(text: string): number {
  return text.length > countedCharacters
    ? text.length
    : [...graphemes.segment(text)].length;
}

export interface FindAsk {
  readonly replace: boolean;
  readonly selected: string;
  readonly at: number;
}

export const findAskOf =
  (withReplace: boolean, state: EditorState | undefined) =>
  (was: FindAsk | undefined): FindAsk => ({
    replace: withReplace,
    selected:
      state === undefined
        ? ''
        : state.sliceDoc(state.selection.main.from, state.selection.main.to),
    at: (was?.at ?? 0) + 1,
  });

export function statusOf(state: EditorState, table: CellTable): string {
  const { main, ranges } = state.selection;
  const line = state.doc.lineAt(main.head);
  const column =
    columnsOf(line.text, cellWidthsOf(table))(main.head - line.from) + 1;
  const parts = [strings.editor.position(line.number, column)];
  if (ranges.length > 1) {
    parts.push(strings.editor.cursors(ranges.length));
  } else if (!main.empty) {
    parts.push(
      strings.editor.selected(
        state.doc.lineAt(main.to).number -
          state.doc.lineAt(main.from).number +
          1,
        charactersIn(state.sliceDoc(main.from, main.to)),
      ),
    );
  }
  return parts.join(strings.editor.between);
}
