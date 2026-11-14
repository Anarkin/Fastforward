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
import { layerOrigin } from './editorSelection';

export interface DotLook {
  readonly advance: number;
  readonly dot: number;
  readonly start: number;
  readonly pixel: number;
}

const onPixel = 1e-6;

const roundTo = (value: number, step: number) =>
  Math.round(value / step + onPixel) * step;

const layoutUnits = 64;

const snapTo = (value: number, pixel: number) =>
  Math.floor(Math.round((value / pixel) * layoutUnits) / layoutUnits + 0.5) *
  pixel;

const floorTo = (value: number, step: number) =>
  Math.floor(value / step + onPixel) * step;

export function dotLook(
  fontSize: number,
  advance: number,
  pixel: number,
): DotLook {
  const dot = Math.max(pixel, roundTo(0.16 * fontSize, pixel));
  return { advance, dot, start: floorTo((advance - dot) / 2, pixel), pixel };
}

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

export function dotsPath(
  runs: readonly SpaceRun[],
  look: DotLook,
  origin: Point,
): string {
  const { advance, dot, start, pixel } = look;
  const square = `h${figure(dot)}v${figure(dot)}h${figure(-dot)}z`;
  const parts: string[] = [];
  for (const run of runs) {
    const left = snapTo(run.left, pixel) + start - origin.left;
    const top = figure(
      snapTo(run.top + (run.height - dot) / 2, pixel) - origin.top,
    );
    for (let at = 0; at < run.length; at++) {
      parts.push(`M${figure(left + at * advance)} ${top}${square}`);
    }
  }
  return parts.join('');
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

function spaceRunsIn(
  view: EditorView,
  band: Band,
  advance: number,
): SpaceRun[] {
  const content = view.contentDOM.getBoundingClientRect();
  const top = Math.max(band.top, content.top);
  const bottom = Math.min(band.bottom, content.bottom - 1);
  if (bottom <= top) {
    return [];
  }
  const from = view.posAtCoords({ x: content.left, y: top }, false);
  const to = view.posAtCoords({ x: content.right - 1, y: bottom }, false);
  const runs: SpaceRun[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(
    view.contentDOM,
    NodeFilter.SHOW_TEXT,
  );
  const start = view.domAtPos(from).node;
  walker.currentNode = start;
  for (
    let node = start instanceof Text ? start : walker.nextNode();
    node instanceof Text;
    node = walker.nextNode()
  ) {
    const at = view.posAtDOM(node, 0);
    if (at > to) {
      break;
    }
    if (
      !node.data.includes(' ') ||
      view.state.sliceDoc(at, at + node.length) !== node.data
    ) {
      continue;
    }
    const rows = measuredRows(range, node, advance);
    for (const found of node.data.matchAll(spaces)) {
      const place = placeOf(range, node, found.index, rows, advance);
      if (
        place !== undefined &&
        place.top + place.height > band.top &&
        place.top < band.bottom
      ) {
        runs.push({ ...place, length: found[0].length });
      }
    }
  }
  return runs;
}

class DotsMarker implements LayerMarker {
  constructor(private readonly path: string) {}

  eq(other: LayerMarker): boolean {
    return other instanceof DotsMarker && other.path === this.path;
  }

  draw(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'space-dots';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', this.path);
    svg.append(path);
    box.append(svg);
    return box;
  }

  update(dom: HTMLElement): boolean {
    const path = dom.querySelector('path');
    path?.setAttribute('d', this.path);
    return path !== null;
  }
}

const redraw = StateEffect.define();

const drawnBands = new WeakMap<EditorView, Band>();

function lookOf(view: EditorView): DotLook {
  const pixel = 1 / window.devicePixelRatio;
  const fontSize = parseFloat(getComputedStyle(view.contentDOM).fontSize);
  return dotLook(fontSize, roundTo(view.defaultCharacterWidth, pixel), pixel);
}

function dotMarkers(
  view: EditorView,
  shown: (state: EditorState) => boolean,
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
  drawnBands.set(view, band);
  const origin = layerOrigin(view);
  const look = lookOf(view);
  const runs = spaceRunsIn(
    view,
    { top: origin.top + band.top, bottom: origin.top + band.bottom },
    look.advance,
  );
  return runs.length === 0
    ? []
    : [new DotsMarker(dotsPath(runs, look, origin))];
}

class ScrollWatch implements PluginValue {
  constructor(private readonly view: EditorView) {
    view.scrollDOM.addEventListener('scroll', this.scrolled, { passive: true });
  }

  private readonly scrolled = () => {
    const band = drawnBands.get(this.view);
    const { scrollTop, clientHeight } = this.view.scrollDOM;
    if (
      band !== undefined &&
      !holds(band, scrollTop, scrollTop + clientHeight)
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

export function spaceDots(shown: (state: EditorState) => boolean): Extension {
  return [
    Prec.lowest(
      layer({
        above: true,
        class: 'space-dot-layer',
        markers: (view) => dotMarkers(view, shown),
        update: (update) =>
          update.docChanged ||
          update.viewportChanged ||
          shown(update.startState) !== shown(update.state) ||
          redrawn(update),
      }),
    ),
    ViewPlugin.define((view) => new ScrollWatch(view)),
  ];
}
