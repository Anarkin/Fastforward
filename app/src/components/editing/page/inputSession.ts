import {
  EditorSelection,
  Text,
  type ChangeSet,
  type EditorState,
  type Transaction,
  type TransactionSpec,
} from '@codemirror/state';
import {
  textContextIn,
  type CharacterBoundsUpdate,
  type TextContext,
  type TextUpdate,
} from '../../../lib/page/textContext';
import { typed, type TextChange } from './typed';

const around = 10_000;

const least = 500;

const most = 30_000;

const lineBreak = '\n';

interface Differing {
  readonly from: number;
  readonly toA: number;
  readonly toB: number;
}

export function differing(
  before: string,
  after: string,
  preferred: number,
  fromEnd: boolean,
): Differing | undefined {
  const shorter = Math.min(before.length, after.length);
  let from = 0;
  while (from < shorter && before.charCodeAt(from) === after.charCodeAt(from)) {
    from += 1;
  }
  if (from === shorter && before.length === after.length) {
    return undefined;
  }
  let toA = before.length;
  let toB = after.length;
  while (
    toA > 0 &&
    toB > 0 &&
    before.charCodeAt(toA - 1) === after.charCodeAt(toB - 1)
  ) {
    toA -= 1;
    toB -= 1;
  }
  const wanted = fromEnd
    ? preferred - (toA + Math.max(0, from - Math.min(toA, toB)) - from)
    : preferred;
  if (toA < from && before.length < after.length) {
    const move = wanted <= from && wanted >= toA ? from - wanted : 0;
    from -= move;
    toB = from + (toB - toA);
    toA = from;
  } else if (toB < from) {
    const move = wanted <= from && wanted >= toB ? from - wanted : 0;
    from -= move;
    toA = from + (toA - toB);
    toB = from;
  }
  return { from, toA, toB };
}

interface Drift {
  readonly contextBase: number;
  editorBase: number;
  drifted: boolean;
}

export interface InputHost {
  readonly state: EditorState;
  readonly element: HTMLElement;
  readonly scroller?: HTMLElement | undefined;
  readonly dispatch: (change: Transaction | TransactionSpec) => void;
  readonly cellOf: (at: number, assoc: number) => DOMRect | undefined;
  readonly control: () => DOMRect;
}

export interface InputUpdate {
  readonly state: EditorState;
  readonly startState: EditorState;
  readonly transactions: readonly Transaction[];
  readonly changes: ChangeSet;
  readonly docChanged: boolean;
  readonly selectionSet: boolean;
  readonly geometryChanged: boolean;
}

export class InputSession {
  private readonly context: TextContext | undefined;
  private from = 0;
  private to = 0;
  private pending: TextChange | undefined;
  private drift: Drift | undefined;
  private composing = false;
  private started = false;
  constructor(private readonly host: InputHost) {
    const { state } = host;
    this.window(state);
    const { main } = state.selection;
    this.context = textContextIn(host.element, {
      text: state.doc.sliceString(this.from, this.to),
      selectionStart: this.inContext(
        Math.max(this.from, Math.min(this.to, main.anchor)),
      ),
      selectionEnd: this.inContext(main.head),
    });
    this.context?.addEventListener('textupdate', this.updated);
    this.context?.addEventListener('characterboundsupdate', this.bounded);
    this.context?.addEventListener('compositionstart', this.began);
    this.context?.addEventListener('compositionend', this.ended);
    host.scroller?.addEventListener('scroll', this.scrolled, {
      passive: true,
    });
    this.place();
  }

  update(update: InputUpdate): void {
    const { context } = this;
    if (context === undefined) {
      return;
    }
    const reverted = this.pending;
    const start = update.startState.selection.main;
    if (
      this.drift !== undefined &&
      (this.drift.drifted ||
        (!update.changes.touchesRange(start.from, start.to) &&
          update.transactions.some(
            (each) =>
              !each.isUserEvent('input.type') &&
              each.changes.touchesRange(this.from, this.to),
          )))
    ) {
      this.drift.drifted = true;
      this.drift.editorBase = update.changes.mapPos(this.drift.editorBase);
    } else if (!this.edited(update, context) || !this.holds(update.state)) {
      this.pending = undefined;
      this.reset(update.state, context);
    } else if (
      update.docChanged ||
      update.selectionSet ||
      reverted !== undefined
    ) {
      this.select(update.state, context);
    }
    if (update.geometryChanged || update.docChanged || update.selectionSet) {
      this.place();
    }
  }

  destroy(): void {
    const { context } = this;
    this.host.scroller?.removeEventListener('scroll', this.scrolled);
    if (context === undefined) {
      return;
    }
    context.removeEventListener('textupdate', this.updated);
    context.removeEventListener('characterboundsupdate', this.bounded);
    context.removeEventListener('compositionstart', this.began);
    context.removeEventListener('compositionend', this.ended);
    if (this.host.element.editContext === context) {
      this.host.element.editContext = null;
    }
  }

  private readonly updated = (event: TextUpdate) => {
    const { host: view, context } = this;
    if (context === undefined) {
      return;
    }
    const { main } = view.state.selection;
    let from = this.inEditor(event.updateRangeStart);
    let to = this.inEditor(event.updateRangeEnd);
    if (this.composing && this.drift === undefined) {
      this.drift = {
        contextBase: event.updateRangeStart,
        editorBase: from,
        drifted: false,
      };
    }
    const deletes = to - from > event.text.length;
    if (from === this.from && main.anchor < this.from) {
      from = main.anchor;
    } else if (to === this.to && main.anchor > this.to) {
      to = main.anchor;
    }
    const differs = differing(
      view.state.sliceDoc(from, to),
      event.text,
      (deletes ? main.from : main.to) - from,
      deletes,
    );
    if (differs === undefined) {
      const selection = EditorSelection.single(
        this.inEditor(event.selectionStart),
        this.inEditor(event.selectionEnd),
      );
      if (
        selection.main.anchor !== main.anchor ||
        selection.main.head !== main.head
      ) {
        view.dispatch({ selection, userEvent: 'select' });
      }
      return;
    }
    const change: TextChange = {
      from: differs.from + from,
      to: differs.toA + from,
      insert: Text.of(
        event.text.slice(differs.from, differs.toB).split(lineBreak),
      ),
    };
    this.pending = change;
    if (!view.state.readOnly) {
      const length =
        this.to - this.from + (change.to - change.from + change.insert.length);
      const composing = !this.composing
        ? undefined
        : this.started
          ? 'going'
          : 'started';
      this.started = this.composing;
      view.dispatch(
        typed(
          view.state,
          change,
          EditorSelection.single(
            this.inEditor(event.selectionStart, length),
            this.inEditor(event.selectionEnd, length),
          ),
          composing,
        ),
      );
    }
    if (this.pending !== undefined) {
      this.revert(view.state, context);
      this.select(view.state, context);
    }
  };

  private readonly bounded = (event: CharacterBoundsUpdate) => {
    const { host, context } = this;
    if (context === undefined) {
      return;
    }
    const bounds: DOMRect[] = [];
    const end = this.inEditor(event.rangeEnd);
    for (let at = this.inEditor(event.rangeStart); at < end; at++) {
      const cell = host.cellOf(at, 1);
      if (cell === undefined) {
        return;
      }
      bounds.push(cell);
    }
    context.updateCharacterBounds(event.rangeStart, bounds);
  };

  private readonly began = () => {
    this.composing = true;
    this.started = false;
  };

  private readonly ended = () => {
    this.composing = false;
    this.started = false;
    const { drift, context } = this;
    this.drift = undefined;
    if (drift?.drifted === true && context !== undefined) {
      this.reset(this.host.state, context);
    }
  };

  private readonly scrolled = () => {
    if (this.composing) {
      this.place();
    }
  };

  private place(): void {
    const { host, context } = this;
    if (context === undefined) {
      return;
    }
    const { main } = host.state.selection;
    const cell = host.cellOf(main.head, main.assoc || 1);
    if (cell === undefined) {
      return;
    }
    context.updateSelectionBounds(cell);
    context.updateControlBounds(host.control());
  }

  private edited(update: InputUpdate, context: TextContext): boolean {
    let off = 0;
    let within = true;
    let { pending } = this;
    update.changes.iterChanges((startA, endA, _fromB, _toB, insert) => {
      if (!within) {
        return;
      }
      const grown = insert.length - (endA - startA);
      if (pending !== undefined && endA >= pending.to) {
        if (
          pending.from === startA &&
          pending.to === endA &&
          pending.insert.eq(insert)
        ) {
          pending = undefined;
          this.pending = undefined;
          off += grown;
          this.to += grown;
          return;
        }
        pending = undefined;
        this.revert(update.state, context);
      }
      const fromA = startA + off;
      const toA = endA + off;
      if (toA <= this.from) {
        this.from += grown;
        this.to += grown;
      } else if (fromA < this.to) {
        if (
          fromA < this.from ||
          toA > this.to ||
          this.to - this.from + insert.length > most
        ) {
          within = false;
          return;
        }
        context.updateText(
          this.inContext(fromA),
          this.inContext(toA),
          insert.toString(),
        );
        this.to += grown;
      }
      off += grown;
    });
    if (pending !== undefined && within) {
      this.revert(update.state, context);
    }
    return within;
  }

  private window(state: EditorState): void {
    const { head } = state.selection.main;
    this.from = Math.max(0, head - around);
    this.to = Math.min(state.doc.length, head + around);
  }

  private reset(state: EditorState, context: TextContext): void {
    this.window(state);
    context.updateText(
      0,
      context.text.length,
      state.doc.sliceString(this.from, this.to),
    );
    this.select(state, context);
  }

  private revert(state: EditorState, context: TextContext): void {
    const { pending } = this;
    this.pending = undefined;
    if (pending !== undefined) {
      context.updateText(
        this.inContext(pending.from),
        this.inContext(pending.from + pending.insert.length),
        state.doc.sliceString(pending.from, pending.to),
      );
    }
  }

  private select(state: EditorState, context: TextContext): void {
    const { main } = state.selection;
    const start = this.inContext(
      Math.max(this.from, Math.min(this.to, main.anchor)),
    );
    const end = this.inContext(main.head);
    if (context.selectionStart !== start || context.selectionEnd !== end) {
      context.updateSelection(start, end);
    }
  }

  private holds(state: EditorState): boolean {
    const { head } = state.selection.main;
    return !(
      (this.from > 0 && head - this.from < least) ||
      (this.to < state.doc.length && this.to - head < least) ||
      this.to - this.from > around * 3
    );
  }

  private inEditor(at: number, length = this.to - this.from): number {
    const within = Math.min(at, length);
    const { drift } = this;
    return drift?.drifted === true
      ? drift.editorBase + (within - drift.contextBase)
      : within + this.from;
  }

  private inContext(at: number): number {
    const { drift } = this;
    return drift?.drifted === true
      ? drift.contextBase + (at - drift.editorBase)
      : at - this.from;
  }
}
