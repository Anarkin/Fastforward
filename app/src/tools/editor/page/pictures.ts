import {
  Facet,
  type Extension,
  type Range,
  type Text,
} from '@codemirror/state';
import {
  Decoration,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view';
import { cellClass } from '../../../lib/page/cellParts';
import type { CellTable } from '../../../lib/page/cellTable';
import {
  controlCharacters,
  pictureOf,
} from '../../../lib/page/controlPictures';
import { elementWidths, type TextWidths } from '../../../lib/page/textWidths';

const picturedALine = 8;

const picturedAnyway = 500;

const pictureClass = 'control-picture';

class Picture extends WidgetType {
  constructor(
    private readonly shown: string,
    private readonly cells: number | undefined,
    private readonly scale: number | undefined,
  ) {
    super();
  }

  get editable(): boolean {
    return true;
  }

  override eq(other: Picture): boolean {
    return (
      other.shown === this.shown &&
      other.cells === this.cells &&
      other.scale === this.scale
    );
  }

  toDOM(): HTMLElement {
    const picture = document.createElement('span');
    picture.className =
      this.cells === undefined
        ? pictureClass
        : `${pictureClass} ${cellClass(this.cells)}`;
    if (this.scale === undefined) {
      picture.textContent = this.shown;
    } else {
      const glyph = document.createElement('span');
      glyph.style.fontSize = `${this.scale}em`;
      glyph.textContent = this.shown;
      picture.append(glyph);
    }
    return picture;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

const pictures = new Map<string, Decoration>();

function pictureFor(code: number, widths: TextWidths | undefined): Decoration {
  const shown = pictureOf(code);
  const cells = widths?.boxed?.(shown);
  const scale = cells === undefined ? undefined : widths?.scaled?.(shown);
  const key = `${code} ${cells} ${scale}`;
  let picture = pictures.get(key);
  if (picture === undefined) {
    picture = Decoration.replace({ widget: new Picture(shown, cells, scale) });
    pictures.set(key, picture);
  }
  return picture;
}

const controls = controlCharacters();

export function controlsIn(text: string): number {
  let count = 0;
  for (const found of text.matchAll(controls)) {
    count += found[0].length;
  }
  return count;
}

export function controlsOf(doc: Text): number {
  let count = 0;
  for (const part of doc.iter()) {
    count += controlsIn(part);
  }
  return count;
}

export const picturedAt = (controlCount: number, lines: number): boolean =>
  controlCount <= Math.max(picturedAnyway, lines * picturedALine);

function picturesIn(
  view: EditorView,
  widths: TextWidths | undefined,
): DecorationSet {
  const found: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    for (const each of view.state.doc
      .sliceString(from, to)
      .matchAll(controls)) {
      const at = from + each.index;
      found.push(pictureFor(each[0].charCodeAt(0), widths).range(at, at + 1));
    }
  }
  return Decoration.set(found);
}

const cellsCounted = Facet.define<CellTable, CellTable | undefined>({
  combine: (tables) => tables[0],
});

class Pictures {
  decorations: DecorationSet;
  private count: number;
  private widths: TextWidths | undefined;

  constructor(view: EditorView) {
    this.count = controlsOf(view.state.doc);
    this.decorations = this.shown(view);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      update.changes.iterChanges((from, to, _fromNew, _toNew, inserted) => {
        this.count +=
          controlsIn(inserted.toString()) -
          controlsIn(update.startState.doc.sliceString(from, to));
      });
    }
    const measured = update.geometryChanged && this.measure(update.view);
    if (measured || update.docChanged || update.viewportChanged) {
      this.decorations = this.shown(update.view);
    }
  }

  private measure(view: EditorView): boolean {
    const table = view.state.facet(cellsCounted);
    if (table === undefined || !view.contentDOM.isConnected) {
      return false;
    }
    const widths = elementWidths(view.contentDOM, table);
    if (widths?.char === this.widths?.char) {
      return false;
    }
    this.widths = widths;
    return true;
  }

  private shown(view: EditorView): DecorationSet {
    return picturedAt(this.count, view.state.doc.lines)
      ? picturesIn(view, this.widths)
      : Decoration.none;
  }
}

const shownPictures = ViewPlugin.fromClass(Pictures, {
  decorations: (plugin) => plugin.decorations,
});

export const controlPictures = (table: CellTable): Extension => [
  cellsCounted.of(table),
  shownPictures,
];

export function picturedIn(view: EditorView, pos: number): boolean {
  let pictured = false;
  view.plugin(shownPictures)?.decorations.between(pos, pos + 1, (from) => {
    pictured ||= from === pos;
  });
  return pictured;
}
