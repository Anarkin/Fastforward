import { drawnTabSize } from './indent';
import {
  ChangeSet,
  EditorSelection,
  Facet,
  StateEffect,
  Transaction,
  type EditorState,
  type Extension,
  type SelectionRange,
  type TransactionSpec,
} from '@codemirror/state';
import type { CellTable } from '../../../lib/page/cellTable';
import { composes } from '../../../lib/shared/keymap';
import { lineHeightOf } from '../../../lib/page/lineHeight';
import { elementWidths, type TextWidths } from '../../../lib/page/textWidths';
import { boxColumns } from '../../../lib/page/wrapBox';
import { RowIndex, WidestLine } from './rowIndex';

export interface SurfaceUpdate {
  readonly view: EditorSurface;
  readonly state: EditorState;
  readonly startState: EditorState;
  readonly transactions: readonly Transaction[];
  readonly changes: ChangeSet;
  readonly docChanged: boolean;
  readonly selectionSet: boolean;
  readonly viewportChanged: boolean;
  readonly heightChanged: boolean;
  readonly geometryChanged: boolean;
  readonly focusChanged: boolean;
}

export interface SurfacePart {
  update?(update: SurfaceUpdate): void;
  destroy?(): void;
}

const parts = Facet.define<SurfacePlugin<SurfacePart>>();

export class SurfacePlugin<Part extends SurfacePart> {
  readonly extension: Extension;
  private readonly made = new WeakMap<EditorSurface, Part>();

  constructor(private readonly create: (view: EditorSurface) => Part) {
    this.extension = parts.of(this);
  }

  in(view: EditorSurface): Part | undefined {
    return this.made.get(view);
  }

  makeIn(view: EditorSurface): Part {
    const part = this.create(view);
    this.made.set(view, part);
    return part;
  }

  leave(view: EditorSurface): void {
    this.made.delete(view);
  }
}

export const surfacePlugin = <Part extends SurfacePart>(
  create: (view: EditorSurface) => Part,
): SurfacePlugin<Part> => new SurfacePlugin(create);

export type SurfaceHandlers = {
  readonly [Name in keyof HTMLElementEventMap]?: (
    event: HTMLElementEventMap[Name],
    view: EditorSurface,
  ) => boolean;
};

const handlers = Facet.define<SurfaceHandlers>();

export const surfaceEvents = (handled: SurfaceHandlers): Extension =>
  handlers.of(handled);

export const surfaceUpdated = Facet.define<(update: SurfaceUpdate) => void>();

export const linesWrapped = Facet.define<boolean, boolean>({
  combine: (wrapped) => wrapped.some((each) => each),
});

export type RevealStrategy = 'nearest' | 'start' | 'end' | 'center';

export interface Revealing {
  readonly range: SelectionRange;
  readonly x: RevealStrategy;
  readonly y: RevealStrategy;
  readonly xMargin: number;
  readonly yMargin: number;
}

export const revealed = StateEffect.define<Revealing>({
  map: (revealing, changes) => ({
    ...revealing,
    range: revealing.range.map(changes),
  }),
});

export const revealers =
  Facet.define<
    (view: EditorSurface, range: SelectionRange, how: Revealing) => boolean
  >();

const cursorMargin = 5;

export type SurfaceCommand = (view: EditorSurface) => boolean;

export interface Measure<Read> {
  readonly read: (view: EditorSurface) => Read;
  readonly write?: (read: Read, view: EditorSurface) => void;
}

export interface LineBlock {
  readonly from: number;
  readonly to: number;
  readonly top: number;
  readonly height: number;
}

interface Metrics {
  readonly char: number;
  readonly rowHeight: number;
  readonly columns: number | undefined;
  readonly ratio: number;
}

const onPixel = 1e-6;

const surfaceClass = 'editor-surface';

const focusedClass = 'focused';

const wrappedClass = 'wrapped';

export class EditorSurface {
  readonly dom: HTMLElement;
  readonly scrollDOM: HTMLElement;
  readonly contentDOM: HTMLElement;
  private current: EditorState;
  private plugged: readonly SurfacePlugin<SurfacePart>[] = [];
  private made = new Map<SurfacePlugin<SurfacePart>, SurfacePart>();
  private handled: readonly SurfaceHandlers[] = [];
  private readonly listened = new Map<string, (event: Event) => void>();
  private metrics: Metrics | undefined;
  private measured: TextWidths | undefined;
  private index = new RowIndex(undefined);
  private widest = new WidestLine(undefined);
  private shown = { from: 0, to: 0 };
  private rows = 0;
  private below = 0;
  private updating = false;
  private gone = false;
  private focused = false;
  private readonly measures = new Map<object, () => () => void>();
  private measuring = false;
  private readonly resized: ResizeObserver | undefined;
  private scaled: MediaQueryList | undefined;

  constructor(
    parent: HTMLElement,
    state: EditorState,
    private readonly table: CellTable,
  ) {
    const page = parent.ownerDocument;
    this.dom = page.createElement('div');
    this.dom.className = surfaceClass;
    this.scrollDOM = page.createElement('div');
    this.scrollDOM.className = 'editor-scroller';
    this.contentDOM = page.createElement('div');
    this.contentDOM.className = 'editor-content';
    this.contentDOM.tabIndex = 0;
    this.contentDOM.spellcheck = false;
    this.contentDOM.setAttribute('autocorrect', 'off');
    this.contentDOM.setAttribute('autocapitalize', 'off');
    this.scrollDOM.append(this.contentDOM);
    this.dom.append(this.scrollDOM);
    parent.append(this.dom);
    this.current = state;
    this.named();
    this.remeasure();
    this.shown = this.viewed();
    this.scrollDOM.addEventListener('scroll', this.scrolled, {
      passive: true,
    });
    this.contentDOM.addEventListener('focus', this.refocused);
    this.contentDOM.addEventListener('blur', this.refocused);
    const Observer = page.defaultView?.ResizeObserver;
    this.resized =
      Observer === undefined ? undefined : new Observer(this.relaid);
    this.resized?.observe(this.scrollDOM);
    this.rescaled();
    this.replug();
  }

  get state(): EditorState {
    return this.current;
  }

  get lineWrapping(): boolean {
    return this.current.facet(linesWrapped);
  }

  get hasFocus(): boolean {
    const page = this.dom.ownerDocument;
    return page.hasFocus() && page.activeElement === this.contentDOM;
  }

  get defaultCharacterWidth(): number {
    return this.metrics?.char ?? 0;
  }

  get defaultLineHeight(): number {
    return this.metrics?.rowHeight ?? 0;
  }

  get contentHeight(): number {
    return this.rows * this.defaultLineHeight + this.below;
  }

  padBelow(pixels: number): void {
    if (pixels !== this.below) {
      this.below = pixels;
      this.contentDOM.style.setProperty('--rows-below', `${pixels}px`);
    }
  }

  get documentTop(): number {
    return this.contentDOM.getBoundingClientRect().top;
  }

  get viewport(): { readonly from: number; readonly to: number } {
    return this.shown;
  }

  focus(): void {
    this.contentDOM.focus({ preventScroll: true });
  }

  plugin<Part extends SurfacePart>(
    plugin: SurfacePlugin<Part>,
  ): Part | undefined {
    return plugin.in(this);
  }

  readonly dispatch = (
    ...changes: readonly (Transaction | TransactionSpec)[]
  ): void => {
    const [first] = changes;
    const transaction =
      changes.length === 1 && first instanceof Transaction
        ? first
        : this.current.update(
            ...changes.filter(
              (each): each is TransactionSpec => !(each instanceof Transaction),
            ),
          );
    if (transaction.startState !== this.current) {
      throw new RangeError(
        'A transaction of another state was given to the editor.',
      );
    }
    this.told([transaction], {});
  };

  setState(state: EditorState): void {
    this.unplug();
    this.current = state;
    this.named();
    this.metrics = undefined;
    this.remeasure();
    this.shown = this.viewed();
    this.replug();
  }

  requestMeasure<Read>(measure: Measure<Read>): void {
    this.measures.set(measure, () => {
      const read = measure.read(this);
      return () => measure.write?.(read, this);
    });
    if (this.measuring) {
      return;
    }
    this.measuring = true;
    queueMicrotask(() => {
      this.measuring = false;
      if (this.gone) {
        return;
      }
      const asked = [...this.measures.values()];
      this.measures.clear();
      for (const write of asked.map((read) => read())) {
        write();
      }
    });
  }

  lineBlockAt(pos: number): LineBlock {
    const { doc } = this.current;
    const line = doc.lineAt(Math.max(0, Math.min(doc.length, pos)));
    const rowHeight = this.defaultLineHeight;
    return {
      from: line.from,
      to: line.to,
      top: this.index.above(doc, line.number) * rowHeight,
      height: this.index.of(doc, line.number) * rowHeight,
    };
  }

  lineBlockAtHeight(height: number): LineBlock {
    const { doc } = this.current;
    const rowHeight = this.defaultLineHeight;
    const { line } = this.index.at(
      doc,
      rowHeight > 0 ? (height + onPixel) / rowHeight : 0,
    );
    return this.lineBlockAt(doc.line(line).from);
  }

  destroy(): void {
    this.gone = true;
    this.unplug();
    for (const [name, listener] of this.listened) {
      this.contentDOM.removeEventListener(name, listener);
    }
    this.listened.clear();
    this.scrollDOM.removeEventListener('scroll', this.scrolled);
    this.contentDOM.removeEventListener('focus', this.refocused);
    this.contentDOM.removeEventListener('blur', this.refocused);
    this.resized?.disconnect();
    this.scaled?.removeEventListener('change', this.rescaled);
    this.dom.remove();
  }

  private named(): void {
    this.dom.className = [
      surfaceClass,
      ...(this.lineWrapping ? [wrappedClass] : []),
      ...(this.focused ? [focusedClass] : []),
    ].join(' ');
  }

  private readonly scrolled = () => {
    const before = this.shown;
    const shown = this.viewed();
    if (before.from !== shown.from || before.to !== shown.to) {
      this.told([], {});
    }
  };

  private readonly refocused = () => {
    if (this.updating) {
      queueMicrotask(this.refocused);
      return;
    }
    const focused = this.hasFocus;
    if (focused !== this.focused && !this.gone) {
      this.told([], { focusChanged: true });
    }
  };

  private readonly relaid = () => {
    if (!this.gone && this.remeasure()) {
      this.told([], { geometryChanged: true });
    }
  };

  private readonly rescaled = () => {
    this.scaled?.removeEventListener('change', this.rescaled);
    this.scaled = this.dom.ownerDocument.defaultView?.matchMedia?.(
      `(resolution: ${devicePixelRatio}dppx)`,
    );
    this.scaled?.addEventListener('change', this.rescaled);
    this.relaid();
  };

  private remeasure(): boolean {
    const before = this.metrics;
    const widths = this.measured;
    const now = this.measure();
    this.metrics = now;
    const changed =
      before?.char !== now?.char ||
      before?.rowHeight !== now?.rowHeight ||
      before?.columns !== now?.columns ||
      before?.ratio !== now?.ratio;
    if (before?.columns !== now?.columns || widths !== this.measured) {
      this.index = new RowIndex(
        now?.columns === undefined
          ? undefined
          : { columns: now.columns, widths: this.measured },
      );
    }
    if (widths !== this.measured) {
      this.widest = new WidestLine(this.measured);
    }
    return this.size() || changed;
  }

  private measure(): Metrics | undefined {
    if (!this.contentDOM.isConnected) {
      return undefined;
    }
    const ratio = devicePixelRatio;
    const rowHeight = lineHeightOf(this.contentDOM, 0, ratio);
    const widths = elementWidths(this.contentDOM, this.table);
    if (widths === undefined || !(rowHeight > 0)) {
      return undefined;
    }
    const tabSize = drawnTabSize(this.current);
    if (
      this.measured?.char !== widths.char ||
      this.measured.tabSize !== tabSize
    ) {
      this.measured = {
        char: widths.char,
        of: widths.of,
        ...(tabSize !== undefined && { tabSize }),
      };
    }
    const pixel = 1 / ratio;
    return {
      char: widths.char,
      rowHeight,
      columns: this.lineWrapping
        ? boxColumns(
            this.contentDOM,
            Math.round(widths.char / pixel + onPixel) * pixel,
          )
        : undefined,
      ratio,
    };
  }

  private size(): boolean {
    const { metrics, contentDOM } = this;
    const { doc } = this.current;
    const before = this.rows;
    this.rows = this.index.rows(doc);
    if (metrics === undefined) {
      return false;
    }
    const pixel = 1 / metrics.ratio;
    contentDOM.style.setProperty(
      '--text-height',
      `${this.rows * metrics.rowHeight}px`,
    );
    contentDOM.style.setProperty(
      '--text-width',
      metrics.columns === undefined
        ? `${this.widest.columns(doc) * Math.round(metrics.char / pixel + onPixel) * pixel}px`
        : '0px',
    );
    return before !== this.rows;
  }

  private viewed(): { readonly from: number; readonly to: number } {
    const { doc } = this.current;
    const rowHeight = this.defaultLineHeight;
    if (!(rowHeight > 0)) {
      return { from: 0, to: doc.line(Math.min(doc.lines, 1)).to };
    }
    const top = this.scrollDOM.scrollTop / rowHeight;
    const screen = this.scrollDOM.clientHeight / rowHeight;
    const step = Math.max(1, Math.floor(screen / 2));
    const first = this.index.at(
      doc,
      Math.floor((top - screen) / step) * step,
    ).line;
    const last = this.index.at(
      doc,
      Math.ceil((top + 2 * screen) / step) * step,
    ).line;
    return { from: doc.line(first).from, to: doc.line(last).to };
  }

  private told(
    transactions: readonly Transaction[],
    {
      geometryChanged = false,
      focusChanged = false,
    }: { geometryChanged?: boolean; focusChanged?: boolean },
  ): void {
    if (this.updating) {
      throw new Error('The editor was changed while it told of a change.');
    }
    if (this.gone) {
      return;
    }
    const startState = this.current;
    const state = transactions.at(-1)?.state ?? startState;
    this.current = state;
    const docChanged = transactions.some((each) => each.docChanged);
    const rewrapped =
      startState.facet(linesWrapped) !== state.facet(linesWrapped) ||
      drawnTabSize(startState) !== drawnTabSize(state);
    const rowsBefore = this.rows;
    let relaid = geometryChanged;
    if (rewrapped) {
      this.named();
      this.remeasure();
      relaid = true;
    } else if (docChanged) {
      this.size();
    }
    if (focusChanged) {
      this.focused = this.hasFocus;
      this.named();
    }
    const before = this.shown;
    this.shown = this.viewed();
    const update: SurfaceUpdate = {
      view: this,
      state,
      startState,
      transactions,
      changes: transactions.reduce(
        (changes, each) => changes.compose(each.changes),
        ChangeSet.empty(startState.doc.length),
      ),
      docChanged,
      selectionSet: transactions.some((each) => each.selection !== undefined),
      viewportChanged:
        before.from !== this.shown.from || before.to !== this.shown.to,
      heightChanged: rowsBefore !== this.rows || relaid,
      geometryChanged: relaid,
      focusChanged,
    };
    this.updating = true;
    try {
      const known = [...this.made.values()];
      this.plug();
      for (const part of known) {
        if ([...this.made.values()].includes(part)) {
          part.update?.(update);
        }
      }
    } finally {
      this.updating = false;
    }
    this.listen();
    for (const listener of state.facet(surfaceUpdated)) {
      listener(update);
    }
    this.reveal(transactions);
  }

  private reveal(transactions: readonly Transaction[]): void {
    let wanted: Revealing | undefined;
    for (const transaction of transactions) {
      for (const effect of transaction.effects) {
        if (effect.is(revealed)) {
          wanted = effect.value;
        }
      }
      if (transaction.scrollIntoView) {
        const { main } = this.current.selection;
        wanted = {
          range: main.empty
            ? main
            : EditorSelection.cursor(
                main.head,
                main.head > main.anchor ? -1 : 1,
              ),
          x: 'nearest',
          y: 'nearest',
          xMargin: cursorMargin,
          yMargin: 0,
        };
      }
    }
    if (wanted === undefined) {
      return;
    }
    const { length } = this.current.doc;
    const { range } = wanted;
    if (range.from > length || range.to > length) {
      return;
    }
    for (const revealer of this.current.facet(revealers)) {
      if (revealer(this, range, wanted)) {
        break;
      }
    }
  }

  private replug(): void {
    this.updating = true;
    try {
      this.plug();
    } finally {
      this.updating = false;
    }
    this.listen();
  }

  private plug(): void {
    const wanted = this.current.facet(parts);
    if (wanted === this.plugged) {
      return;
    }
    this.plugged = wanted;
    const made = new Map<SurfacePlugin<SurfacePart>, SurfacePart>();
    for (const [plugin, part] of this.made) {
      if (!wanted.includes(plugin)) {
        part.destroy?.();
        plugin.leave(this);
      }
    }
    for (const plugin of wanted) {
      made.set(plugin, this.made.get(plugin) ?? plugin.makeIn(this));
    }
    this.made = made;
  }

  private unplug(): void {
    for (const [plugin, part] of this.made) {
      part.destroy?.();
      plugin.leave(this);
    }
    this.made = new Map();
    this.plugged = [];
  }

  private listen(): void {
    const handled = this.current.facet(handlers);
    if (handled === this.handled) {
      return;
    }
    this.handled = handled;
    const names = new Set(handled.flatMap((each) => Object.keys(each)));
    for (const [name, listener] of this.listened) {
      if (!names.has(name)) {
        this.contentDOM.removeEventListener(name, listener);
        this.listened.delete(name);
      }
    }
    for (const name of names) {
      if (!this.listened.has(name)) {
        const listener = (event: Event) => this.handle(name, event);
        this.listened.set(name, listener);
        this.contentDOM.addEventListener(name, listener);
      }
    }
  }

  private handle(name: string, event: Event): void {
    if (composes(event)) {
      return;
    }
    for (const each of this.handled) {
      if (event.defaultPrevented) {
        return;
      }
      const handler: unknown = Reflect.get(each, name);
      if (
        typeof handler === 'function' &&
        Reflect.apply(handler, each, [event, this]) === true
      ) {
        event.preventDefault();
        return;
      }
    }
  }
}
