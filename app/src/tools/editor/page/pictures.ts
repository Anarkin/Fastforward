import type { Range, Text } from '@codemirror/state';
import {
  Decoration,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view';
import {
  controlCharacters,
  pictureOf,
} from '../../../lib/page/controlPictures';

const picturedALine = 8;

const picturedAnyway = 500;

class Picture extends WidgetType {
  constructor(private readonly code: number) {
    super();
  }

  get editable(): boolean {
    return true;
  }

  override eq(other: Picture): boolean {
    return other.code === this.code;
  }

  toDOM(): HTMLElement {
    const shown = document.createElement('span');
    shown.textContent = pictureOf(this.code);
    return shown;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

const pictures = new Map<number, Decoration>();

function pictureFor(code: number): Decoration {
  let picture = pictures.get(code);
  if (picture === undefined) {
    picture = Decoration.replace({ widget: new Picture(code) });
    pictures.set(code, picture);
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

function picturesIn(view: EditorView): DecorationSet {
  const found: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    for (const each of view.state.doc
      .sliceString(from, to)
      .matchAll(controls)) {
      const at = from + each.index;
      found.push(pictureFor(each[0].charCodeAt(0)).range(at, at + 1));
    }
  }
  return Decoration.set(found);
}

class Pictures {
  decorations: DecorationSet;
  private count: number;

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
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.shown(update.view);
    }
  }

  private shown(view: EditorView): DecorationSet {
    return picturedAt(this.count, view.state.doc.lines)
      ? picturesIn(view)
      : Decoration.none;
  }
}

export const controlPictures = ViewPlugin.fromClass(Pictures, {
  decorations: (plugin) => plugin.decorations,
});

export function picturedIn(view: EditorView, pos: number): boolean {
  let pictured = false;
  view.plugin(controlPictures)?.decorations.between(pos, pos + 1, (from) => {
    pictured ||= from === pos;
  });
  return pictured;
}
