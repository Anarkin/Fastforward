import type { Extension, Range } from '@codemirror/state';
import {
  Decoration,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view';
import {
  pictureOf,
  swappedCharacters,
} from '../../../lib/page/controlPictures';

class Picture extends WidgetType {
  constructor(private readonly shown: string) {
    super();
  }

  get editable(): boolean {
    return true;
  }

  override eq(other: Picture): boolean {
    return other.shown === this.shown;
  }

  toDOM(): HTMLElement {
    const picture = document.createElement('span');
    picture.className = 'control-picture';
    picture.textContent = this.shown;
    return picture;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

const pictures = new Map<number, Decoration>();

function pictureFor(code: number): Decoration {
  let picture = pictures.get(code);
  if (picture === undefined) {
    picture = Decoration.replace({ widget: new Picture(pictureOf(code)) });
    pictures.set(code, picture);
  }
  return picture;
}

const swapped = swappedCharacters();

export function picturesIn(
  ranges: readonly { readonly from: number; readonly to: number }[],
  textOf: (from: number, to: number) => string,
): Range<Decoration>[] {
  const found: Range<Decoration>[] = [];
  for (const { from, to } of ranges) {
    for (const each of textOf(from, to).matchAll(swapped)) {
      const at = from + each.index;
      found.push(pictureFor(each[0].charCodeAt(0)).range(at, at + 1));
    }
  }
  return found;
}

const drawn = (view: EditorView): DecorationSet =>
  Decoration.set(
    picturesIn(view.visibleRanges, (from, to) =>
      view.state.doc.sliceString(from, to),
    ),
  );

class Pictures {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = drawn(view);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = drawn(update.view);
    }
  }
}

const shownPictures = ViewPlugin.fromClass(Pictures, {
  decorations: (plugin) => plugin.decorations,
});

export const controlPictures: Extension = shownPictures;

export function picturedIn(view: EditorView, pos: number): boolean {
  let pictured = false;
  view.plugin(shownPictures)?.decorations.between(pos, pos + 1, (from) => {
    pictured ||= from === pos;
  });
  return pictured;
}
