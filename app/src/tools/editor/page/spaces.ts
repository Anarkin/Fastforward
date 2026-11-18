import {
  Prec,
  StateEffect,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import {
  EditorView,
  layer,
  ViewPlugin,
  type LayerMarker,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import { layerOrigin, rowEdge } from './rows';
import { dotLook, roundedTo, type DotLook } from '../../../lib/page/dotLook';
import { scratchRange } from '../../../lib/page/scratchRange';

const layoutUnits = 64;

const snapTo = (value: number, pixel: number) =>
  Math.floor(Math.round((value / pixel) * layoutUnits) / layoutUnits + 0.5) *
  pixel;

export interface SpaceRun {
  readonly left: number;
  readonly top: number;
  readonly height: number;
  readonly length: number;
}

interface Point {
  readonly left: number;
  readonly top: number;
}

const figure = (value: number) => String(Math.round(value * 1000) / 1000);

export interface DotFill {
  readonly phase: number;
  readonly path: string;
}

export function dotFills(
  runs: readonly SpaceRun[],
  look: DotLook,
  origin: Point,
): DotFill[] {
  const { advance, dot, pixel } = look;
  const fills = new Map<string, string[]>();
  for (const run of runs) {
    if (run.length > 0) {
      const left = snapTo(run.left, pixel) - origin.left;
      const top = snapTo(run.top + (run.height - dot) / 2, pixel) - origin.top;
      const phase = figure(((left % advance) + advance) % advance);
      const parts = fills.get(phase) ?? [];
      fills.set(phase, parts);
      parts.push(
        `M${figure(left)} ${figure(top)}h${figure(run.length * advance)}v${figure(dot)}h${figure(-run.length * advance)}z`,
      );
    }
  }
  return [...fills].map(([phase, parts]) => ({
    phase: Number(phase),
    path: parts.join(''),
  }));
}

export interface Band {
  readonly top: number;
  readonly bottom: number;
}

const leastMargin = 200;

export function dotsBand(top: number, bottom: number): Band {
  const margin = Math.max(leastMargin, (bottom - top) / 4);
  return { top: top - margin, bottom: bottom + margin };
}

export const holds = (band: Band, top: number, bottom: number): boolean =>
  band.top <= top && bottom <= band.bottom;

export interface Span {
  readonly from: number;
  readonly to: number;
}

export function dotsSpan(left: number, right: number): Span {
  const margin = Math.max(leastMargin, (right - left) / 2);
  return { from: left - margin, to: right + margin };
}

export function clippedRun(
  run: SpaceRun,
  span: Span | undefined,
  advance: number,
): SpaceRun | undefined {
  if (span === undefined) {
    return run;
  }
  const skipped = Math.max(0, Math.floor((span.from - run.left) / advance));
  const left = run.left + skipped * advance;
  const length = Math.min(
    run.length - skipped,
    Math.ceil((span.to - left) / advance),
  );
  return length > 0 ? { ...run, left, length } : undefined;
}

const spaces = / +/g;

const singleCells = /^[\x20-\x7e]*$/;

interface Box {
  readonly left: number;
  readonly top: number;
  readonly height: number;
  readonly width: number;
}

export interface TextRow {
  readonly left: number;
  readonly top: number;
  readonly height: number;
  readonly from: number;
  readonly to: number;
}

export function textRows(
  rects: readonly Box[],
  text: string,
  advance: number,
): TextRow[] | undefined {
  if (text.length === 0 || !singleCells.test(text)) {
    return undefined;
  }
  const rows: TextRow[] = [];
  let from = 0;
  for (const { left, top, height, width } of rects) {
    const cells = Math.round(width / advance);
    if (cells > 0) {
      rows.push({ left, top, height, from, to: from + cells });
      from += cells;
    }
  }
  return from === text.length ? rows : undefined;
}

function measuredRows(
  range: Range,
  node: Text,
  advance: number,
): TextRow[] | undefined {
  if (!singleCells.test(node.data)) {
    return undefined;
  }
  range.selectNodeContents(node);
  return textRows([...range.getClientRects()], node.data, advance);
}

function placeOf(
  range: Range,
  node: Text,
  index: number,
  rows: readonly TextRow[] | undefined,
  advance: number,
): Omit<SpaceRun, 'length'> | undefined {
  if (rows === undefined) {
    range.setStart(node, index);
    range.setEnd(node, index + 1);
    const [rect] = range.getClientRects();
    return rect === undefined
      ? undefined
      : { left: rect.left, top: rect.top, height: rect.height };
  }
  const row = rows.find(({ from, to }) => from <= index && index < to);
  return row === undefined
    ? undefined
    : {
        left: row.left + (index - row.from) * advance,
        top: row.top,
        height: row.height,
      };
}

export interface LineRuns {
  readonly key: string;
  readonly runs: readonly SpaceRun[];
}

export function runsOfLine<Line extends object>(
  kept: WeakMap<Line, LineRuns>,
  line: Line,
  key: string,
  at: Point,
  measure: () => readonly SpaceRun[],
): SpaceRun[] {
  let held = kept.get(line);
  if (held?.key !== key) {
    held = {
      key,
      runs: measure().map((run) => ({
        ...run,
        left: run.left - at.left,
        top: run.top - at.top,
      })),
    };
    kept.set(line, held);
  }
  return held.runs.map((run) => ({
    ...run,
    left: run.left + at.left,
    top: run.top + at.top,
  }));
}

export function fittingRun(
  run: SpaceRun,
  edge: number | undefined,
  advance: number,
): SpaceRun | undefined {
  if (edge === undefined) {
    return run;
  }
  const length = Math.min(run.length, Math.round((edge - run.left) / advance));
  return length > 0 ? { ...run, length } : undefined;
}

function spaceRunsOf(
  view: EditorView,
  line: Element,
  advance: number,
  across: Span | undefined,
): SpaceRun[] {
  const edge = rowEdge(view);
  const runs: SpaceRun[] = [];
  const range = scratchRange();
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  for (
    let node = walker.nextNode();
    node instanceof Text;
    node = walker.nextNode()
  ) {
    if (!node.data.includes(' ')) {
      continue;
    }
    const at = view.posAtDOM(node, 0);
    if (view.state.sliceDoc(at, at + node.length) !== node.data) {
      continue;
    }
    const rows = measuredRows(range, node, advance);
    const [row] = rows ?? [];
    const first =
      across === undefined || rows?.length !== 1 || row === undefined
        ? 0
        : Math.max(0, Math.floor((across.from - row.left) / advance));
    const last =
      across === undefined || rows?.length !== 1 || row === undefined
        ? node.length
        : Math.min(node.length, Math.ceil((across.to - row.left) / advance));
    if (last <= first) {
      continue;
    }
    const text =
      first === 0 && last === node.length
        ? node.data
        : node.data.slice(first, last);
    for (const found of text.matchAll(spaces)) {
      const place = placeOf(range, node, first + found.index, rows, advance);
      const fitting =
        place &&
        fittingRun({ ...place, length: found[0].length }, edge, advance);
      const run = fitting && clippedRun(fitting, across, advance);
      if (run !== undefined) {
        runs.push(run);
      }
    }
  }
  return runs;
}

function lineOf(view: EditorView, pos: number): Element | undefined {
  const { contentDOM } = view;
  let node: Node | null = view.domAtPos(pos).node;
  while (node !== null && node.parentNode !== contentDOM) {
    node = node.parentNode;
  }
  return node instanceof Element ? node : undefined;
}

const wholeLine = 2000;

const keptRuns = new WeakMap<EditorView, WeakMap<Element, LineRuns>>();

function spaceRunsIn(
  view: EditorView,
  band: Band,
  across: Span | undefined,
  look: DotLook,
  laidOut: number,
): SpaceRun[] {
  let kept = keptRuns.get(view);
  if (kept === undefined) {
    kept = new WeakMap();
    keptRuns.set(view, kept);
  }
  const shape = `${laidOut}:${view.lineWrapping}:${view.contentDOM.clientWidth}:${look.advance}:${look.dot}:${look.pixel}`;
  const runs: SpaceRun[] = [];
  const seen = new Set<Element>();
  for (const block of view.viewportLineBlocks) {
    const line = lineOf(view, block.from);
    if (line === undefined || seen.has(line)) {
      continue;
    }
    seen.add(line);
    const { left, top, bottom, height } = line.getBoundingClientRect();
    if (bottom <= band.top || top >= band.bottom) {
      continue;
    }
    if (block.length > wholeLine) {
      runs.push(...spaceRunsOf(view, line, look.advance, across));
      continue;
    }
    const text = view.state.sliceDoc(block.from, block.to);
    if (!text.includes(' ')) {
      continue;
    }
    runs.push(
      ...runsOfLine(
        kept,
        line,
        `${shape}:${height}:${across === undefined ? '' : `${across.from - left}:${across.to - left}`}
${text}`,
        { left, top },
        () => spaceRunsOf(view, line, look.advance, across),
      ),
    );
  }
  return runs;
}

let patterns = 0;

const svgSpace = 'http://www.w3.org/2000/svg';

class DotsMarker implements LayerMarker {
  private readonly drawn: string;

  constructor(
    private readonly fills: readonly DotFill[],
    private readonly look: DotLook,
  ) {
    this.drawn = JSON.stringify([fills, look]);
  }

  eq(other: LayerMarker): boolean {
    return other instanceof DotsMarker && other.drawn === this.drawn;
  }

  private fill(svg: Element): void {
    const { advance, dot, start } = this.look;
    svg.replaceChildren(
      ...this.fills.flatMap(({ phase, path }) => {
        patterns += 1;
        const id = `space-dots-${patterns}`;
        const pattern = document.createElementNS(svgSpace, 'pattern');
        pattern.setAttribute('id', id);
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');
        pattern.setAttribute('width', figure(advance));
        pattern.setAttribute('height', '1');
        pattern.setAttribute('patternTransform', `translate(${phase} 0)`);
        const stripe = document.createElementNS(svgSpace, 'rect');
        stripe.setAttribute('x', figure(start));
        stripe.setAttribute('width', figure(dot));
        stripe.setAttribute('height', '1');
        pattern.append(stripe);
        const filled = document.createElementNS(svgSpace, 'path');
        filled.setAttribute('d', path);
        filled.setAttribute('fill', `url(#${id})`);
        return [pattern, filled];
      }),
    );
  }

  draw(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'space-dots';
    const svg = document.createElementNS(svgSpace, 'svg');
    this.fill(svg);
    box.append(svg);
    return box;
  }

  update(dom: HTMLElement): boolean {
    const svg = dom.querySelector('svg');
    if (svg === null) {
      return false;
    }
    this.fill(svg);
    return true;
  }
}

const redraw = StateEffect.define();

const drawnBands = new WeakMap<
  EditorView,
  { readonly band: Band; readonly across: Span | undefined }
>();

function lookOf(view: EditorView): DotLook {
  const pixel = 1 / window.devicePixelRatio;
  const fontSize = parseFloat(getComputedStyle(view.contentDOM).fontSize);
  return dotLook(fontSize, roundedTo(view.defaultCharacterWidth, pixel), pixel);
}

function dotMarkers(
  view: EditorView,
  shown: (state: EditorState) => boolean,
  laidOut: number,
): LayerMarker[] {
  const { scrollDOM } = view;
  if (!shown(view.state) || scrollDOM.clientHeight === 0) {
    drawnBands.delete(view);
    return [];
  }
  const band = dotsBand(
    scrollDOM.scrollTop,
    scrollDOM.scrollTop + scrollDOM.clientHeight,
  );
  const across = view.lineWrapping
    ? undefined
    : dotsSpan(
        scrollDOM.scrollLeft,
        scrollDOM.scrollLeft + scrollDOM.clientWidth,
      );
  drawnBands.set(view, { band, across });
  const origin = layerOrigin(view);
  const look = lookOf(view);
  const runs = spaceRunsIn(
    view,
    { top: origin.top + band.top, bottom: origin.top + band.bottom },
    across && {
      from: origin.left + across.from,
      to: origin.left + across.to,
    },
    look,
    laidOut,
  );
  return runs.length === 0
    ? []
    : [new DotsMarker(dotFills(runs, look, origin), look)];
}

class ScrollWatch implements PluginValue {
  constructor(private readonly view: EditorView) {
    view.scrollDOM.addEventListener('scroll', this.scrolled, { passive: true });
  }

  private readonly scrolled = () => {
    const drawn = drawnBands.get(this.view);
    const { scrollTop, clientHeight, scrollLeft, clientWidth } =
      this.view.scrollDOM;
    if (
      drawn !== undefined &&
      (!holds(drawn.band, scrollTop, scrollTop + clientHeight) ||
        (drawn.across !== undefined &&
          (scrollLeft < drawn.across.from ||
            scrollLeft + clientWidth > drawn.across.to)))
    ) {
      this.view.dispatch({ effects: redraw.of(null) });
    }
  };

  destroy(): void {
    this.view.scrollDOM.removeEventListener('scroll', this.scrolled);
  }
}

const redrawn = (update: ViewUpdate) =>
  update.transactions.some((transaction) =>
    transaction.effects.some((effect) => effect.is(redraw)),
  );

export function spaceDots(
  shown: (state: EditorState) => boolean,
  laidOut: (view: EditorView) => number,
): Extension {
  return [
    Prec.lowest(
      layer({
        above: true,
        class: 'space-dot-layer',
        markers: (view) => dotMarkers(view, shown, laidOut(view)),
        update: (update) => {
          const toggled = shown(update.startState) !== shown(update.state);
          if (
            toggled ||
            update.transactions.some((transaction) => transaction.reconfigured)
          ) {
            keptRuns.delete(update.view);
          }
          return (
            update.docChanged ||
            update.viewportChanged ||
            toggled ||
            redrawn(update)
          );
        },
      }),
    ),
    ViewPlugin.define((view) => new ScrollWatch(view)),
  ];
}
