import { invertedEffects } from '@codemirror/commands';
import {
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Text,
  type TransactionSpec,
} from '@codemirror/state';
import {
  Decoration,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view';
import { strings } from '../../../shared/strings';
import { blanksShown } from '../../../ui/editorText';
import {
  marksListed,
  movedMarks,
  strayMarks,
  type EndingMark,
  type LineEnding,
  type StrayEnding,
} from '../shared/textMarks';

export interface Endings {
  readonly ending: LineEnding;
  readonly strays: RangeSet<EndingMark>;
}

const setEndings = StateEffect.define<Endings>();

export const endingsField = StateField.define<Endings>({
  create: () => ({ ending: 'lf', strays: RangeSet.empty }),
  update(value, transaction) {
    let next = transaction.docChanged
      ? { ...value, strays: movedMarks(value.strays, transaction.changes) }
      : value;
    for (const effect of transaction.effects) {
      if (effect.is(setEndings)) {
        next = effect.value;
      }
    }
    return next;
  },
});

export function endingsFrom(
  doc: Text,
  shown: {
    readonly ending: LineEnding;
    readonly strayEndings: readonly StrayEnding[];
  },
): Extension {
  return endingsField.init(() => ({
    ending: shown.ending,
    strays: strayMarks(doc, shown.strayEndings),
  }));
}

export const endingsUndone = invertedEffects.of((transaction) =>
  transaction.effects.some((effect) => effect.is(setEndings))
    ? [setEndings.of(transaction.startState.field(endingsField))]
    : [],
);

export function convertedTo(ending: LineEnding): TransactionSpec {
  return {
    effects: setEndings.of({ ending, strays: RangeSet.empty }),
    userEvent: 'convert',
  };
}

export function endingsChanged(
  transactions: readonly {
    readonly effects: readonly StateEffect<unknown>[];
  }[],
): boolean {
  return transactions.some((transaction) =>
    transaction.effects.some((effect) => effect.is(setEndings)),
  );
}

export function endingsSent({ ending, strays }: Endings): {
  readonly ending: LineEnding;
  readonly strayEndings: readonly StrayEnding[];
} {
  return {
    ending,
    strayEndings: marksListed(strays, (at, mark) => ({
      at,
      ending: mark.ending,
    })),
  };
}

export function endingCounts(
  state: EditorState,
): Readonly<Record<LineEnding, number>> {
  const { ending, strays } = state.field(endingsField);
  const counts = { lf: 0, crlf: 0, cr: 0 };
  let stray = 0;
  for (const cursor = strays.iter(); cursor.value !== null; cursor.next()) {
    counts[cursor.value.ending] += 1;
    stray += 1;
  }
  counts[ending] += state.doc.lines - 1 - stray;
  return counts;
}

class EndingSign extends WidgetType {
  override eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const sign = document.createElement('span');
    sign.className = 'blank ending-sign';
    sign.dataset.glyph = strings.symbols.carriageReturn;
    return sign;
  }
}

const endingSign = Decoration.widget({ widget: new EndingSign(), side: 1 });

function signsIn(view: EditorView): DecorationSet {
  const { state } = view;
  if (!state.facet(blanksShown)) {
    return Decoration.none;
  }
  const { ending, strays } = state.field(endingsField);
  const builder = new RangeSetBuilder<Decoration>();
  let last = 0;
  for (const { from, to } of view.visibleRanges) {
    for (let at = from; at <= to;) {
      const line = state.doc.lineAt(at);
      at = line.to + 1;
      if (line.number <= last || line.number === state.doc.lines) {
        continue;
      }
      last = line.number;
      let ended = ending;
      strays.between(line.to, line.to + 1, (_from, _to, mark) => {
        ended = mark.ending;
      });
      if (ended !== 'lf') {
        builder.add(line.to, line.to, endingSign);
      }
    }
  }
  return builder.finish();
}

export const endingSigns = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = signsIn(view);
    }

    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.startState.facet(blanksShown) !==
          update.state.facet(blanksShown) ||
        update.startState.field(endingsField) !==
          update.state.field(endingsField)
      ) {
        this.decorations = signsIn(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const convertible: readonly LineEnding[] = ['lf', 'crlf'];

export interface Conversion {
  readonly ending: LineEnding;
  readonly label: string;
  readonly changes: boolean;
}

export const conversionsOf = (
  counts: Readonly<Record<LineEnding, number>>,
): readonly Conversion[] =>
  convertible.map((ending) => ({
    ending,
    label: strings.editor.convertTo(strings.editor.endingNames[ending]),
    changes: Object.entries(counts).some(
      ([other, count]) => other !== ending && count > 0,
    ),
  }));
