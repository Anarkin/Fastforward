import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import {
  surfacePlugin,
  type EditorSurface,
  type SurfacePart,
  type SurfaceUpdate,
} from './surface';
import {
  copiesIn,
  maxMatches,
  soughtCopy,
  longestCopy,
} from '../../../lib/shared/textMatches';
import { findsText } from './find';
import { stepsWords } from './nextOccurrence';
import { wordAt } from './words';

interface Place {
  readonly from: number;
  readonly to: number;
}

interface Sought {
  readonly text: string;
  readonly wordsOnly: boolean;
  readonly selected: ReadonlySet<number>;
}

const pausedField = StateField.define<boolean>({
  create: () => false,
  update: (paused, transaction) =>
    transaction.docChanged || (paused && transaction.selection === undefined),
});

const blank = /\s/;

function blanksAlong(state: EditorState, from: number, to: number): number {
  let count = 0;
  const backward = from > to;
  for (const chunks = state.doc.iterRange(from, to); !chunks.next().done;) {
    const chunk = chunks.value;
    for (let at = 0; at < chunk.length; at++) {
      if (!blank.test(chunk.charAt(backward ? chunk.length - 1 - at : at))) {
        return count;
      }
      count++;
    }
  }
  return count;
}

function mayBeSought(state: EditorState, from: number, to: number): boolean {
  const length = to - from;
  if (length <= longestCopy) {
    return true;
  }
  const lead = blanksAlong(state, from, to);
  return (
    lead < length && length - lead - blanksAlong(state, to, from) <= longestCopy
  );
}

function soughtIn(state: EditorState): Sought | undefined {
  if ((state.field(pausedField, false) ?? true) || findsText(state)) {
    return undefined;
  }
  const { main, ranges } = state.selection;
  if (main.empty) {
    if (ranges.length > 1) {
      return undefined;
    }
    const word = wordAt(state, main.head);
    return (
      word && {
        text: state.sliceDoc(word.from, word.to),
        wordsOnly: true,
        selected: new Set(),
      }
    );
  }
  const length = main.to - main.from;
  if (!mayBeSought(state, main.from, main.to)) {
    return undefined;
  }
  const selectedText = state.sliceDoc(main.from, main.to);
  const text = soughtCopy(selectedText);
  if (
    text === undefined ||
    selectedText.includes(state.lineBreak) ||
    ranges.some(
      (range) =>
        range.to - range.from !== length ||
        state.sliceDoc(range.from, range.to) !== selectedText,
    )
  ) {
    return undefined;
  }
  const lead = selectedText.indexOf(text);
  return {
    text,
    wordsOnly: stepsWords(state),
    selected: new Set(ranges.map((range) => range.from + lead)),
  };
}

function sameSought(one: Sought | undefined, other: Sought | undefined) {
  return (
    one === other ||
    (one !== undefined &&
      other !== undefined &&
      one.text === other.text &&
      one.wordsOnly === other.wordsOnly &&
      one.selected.size === other.selected.size &&
      [...one.selected].every((at) => other.selected.has(at)))
  );
}

function foundIn(
  state: EditorState,
  { text, wordsOnly, selected }: Sought,
  shown: readonly Place[],
): Place[] {
  const reach = text.length + 2;
  const found: Place[] = [];
  let past = 0;
  for (const { from, to } of shown) {
    const start = Math.max(0, from - reach);
    const end = Math.min(state.doc.length, to + reach);
    for (const match of copiesIn(
      state.sliceDoc(start, end),
      text,
      wordsOnly,
      maxMatches - found.length,
    )) {
      const at = start + match.start;
      const until = start + match.end;
      if (until > from && at < to && at >= past && !selected.has(at)) {
        found.push({ from: at, to: until });
        past = until;
      }
    }
  }
  return found;
}

export function occurrencesIn(
  state: EditorState,
  shown: readonly Place[],
): Place[] {
  const sought = soughtIn(state);
  return sought === undefined ? [] : foundIn(state, sought, shown);
}

const keyRestMs = 100;

const rested = StateEffect.define();

export const pointerHeld = StateEffect.define<boolean>();

const none: readonly Place[] = [];

const marking = new WeakMap<EditorSurface, OccurrenceMarks>();

class OccurrenceMarks implements SurfacePart {
  found: readonly Place[];
  private sought: Sought | undefined;
  private resting: ReturnType<typeof setTimeout> | undefined;
  private held = false;

  constructor(private readonly view: EditorSurface) {
    this.sought = soughtIn(view.state);
    this.found = this.build(view);
    marking.set(view, this);
  }

  update(update: SurfaceUpdate): void {
    const moved = update.docChanged || update.viewportChanged;
    if (update.transactions.length === 0 && !moved) {
      return;
    }
    let released = false;
    for (const transaction of update.transactions) {
      for (const effect of transaction.effects) {
        if (effect.is(pointerHeld)) {
          this.held = effect.value;
          released = !effect.value;
        }
      }
    }
    const sought = this.held ? undefined : soughtIn(update.state);
    if (sameSought(sought, this.sought)) {
      if (sought !== undefined && moved) {
        this.found = this.build(update.view);
      }
      return;
    }
    clearTimeout(this.resting);
    const settled =
      released ||
      update.transactions.some(
        (transaction) =>
          transaction.isUserEvent('select.pointer') ||
          transaction.effects.some((effect) => effect.is(rested)),
      );
    if (settled || sought === undefined) {
      this.sought = sought;
      this.found = this.build(update.view);
      return;
    }
    this.sought = undefined;
    this.found = none;
    this.resting = setTimeout(() => {
      this.view.dispatch({ effects: rested.of(null) });
    }, keyRestMs);
  }

  destroy(): void {
    clearTimeout(this.resting);
    if (marking.get(this.view) === this) {
      marking.delete(this.view);
    }
  }

  private build(view: EditorSurface): readonly Place[] {
    const { sought } = this;
    return sought === undefined
      ? none
      : foundIn(view.state, sought, [view.viewport]);
  }
}

export const occurrencesShown = (view: EditorSurface): readonly Place[] =>
  marking.get(view)?.found ?? none;

export const editorOccurrences: Extension = [
  pausedField,
  surfacePlugin((view) => new OccurrenceMarks(view)),
];
