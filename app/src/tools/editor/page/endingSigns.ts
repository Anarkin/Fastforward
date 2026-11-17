import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view';
import { strings } from '../../../lib/shared/strings';
import { blanksShown } from './text';
import { endingsField } from './endings';

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
