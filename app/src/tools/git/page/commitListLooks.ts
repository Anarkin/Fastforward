import { scratchRange } from '../../../shell/page/scratchRange';
import { layerOf } from '../../../components/cells/page/cellLook';
import { graphColors } from '../shared/protocol';
import { fadedOf } from './bubbleCanvas';
import { color } from './graphLanes';

export type Rgba = ReturnType<typeof layerOf>;

export interface Looks {
  readonly ground: Rgba;
  readonly hover: Rgba;
  readonly selected: Rgba;
  readonly focus: Rgba;
  readonly bar: Rgba;
  readonly barRadius: number;
  readonly baseline: number;
  readonly ink: string;
  readonly muted: string;
  readonly markInk: string;
  readonly markGround: Rgba;
  readonly markTop: number;
  readonly textScale: number;
  readonly markHeight: number;
  readonly mutedWorkingTree: string;
  readonly emptyWorkingTree: string;
  readonly family: string;
  readonly size: number;
  readonly weight: string;
  readonly bold: string;
  readonly lanes: readonly Rgba[];
}

export const over = (base: Rgba, layer: Rgba): Rgba => [
  Math.round(base[0] + (layer[0] - base[0]) * layer[3]),
  Math.round(base[1] + (layer[1] - base[1]) * layer[3]),
  Math.round(base[2] + (layer[2] - base[2]) * layer[3]),
  1,
];

export const packed = (rgba: Rgba): number => {
  const [red, green, blue] = rgba.map(Math.round);
  return ((255 << 24) | (blue << 16) | (green << 8) | red) >>> 0;
};

export const cssOf = (rgba: Rgba): string => {
  const [red, green, blue] = rgba.map(Math.round);
  return `rgb(${red} ${green} ${blue})`;
};

function probed(host: HTMLElement, html: string): HTMLElement {
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.innerHTML = html;
  host.append(probe);
  return probe;
}

const shapedSample =
  'The quick brown fox jumps over the lazy dog, 0123456789 times';

let measuring: OffscreenCanvasRenderingContext2D | null | undefined;

function textScaleOf(sample: HTMLElement, scale: number): number {
  measuring ??= new OffscreenCanvas(1, 1).getContext('2d');
  if (measuring === null || scale === 1) {
    return 1;
  }
  const style = getComputedStyle(sample);
  const size = parseFloat(style.fontSize);
  const widthAt = (pixels: number) => {
    if (measuring === null || measuring === undefined) {
      return 0;
    }
    measuring.font = `${style.fontWeight} ${pixels}px ${style.fontFamily}`;
    return measuring.measureText(shapedSample).width;
  };
  const range = scratchRange();
  range.selectNodeContents(sample);
  const laid = range.getBoundingClientRect().width;
  const asDevice = widthAt(size * scale) / scale;
  const asCss = widthAt(size);
  return Math.abs(asCss - laid) < Math.abs(asDevice - laid) ? scale : 1;
}

export function looksOf(list: HTMLElement, scale: number): Looks {
  const probe = probed(
    list,
    `<div class="commit"><div class="commit-line"><span class="subject">a</span></div><div class="commit-line secondary"><span class="author">a</span></div></div>` +
      `<div class="commit checked-out"><span class="subject">a</span></div>` +
      `<div class="commit selected"></div>` +
      `<div class="commit working-tree"><span class="subject">a</span></div>` +
      `<div class="commit working-tree empty"><span class="subject">a</span></div>` +
      `<div class="commit-line" data-line><span class="subject">a<span data-baseline></span></span></div>` +
      `<span class="bar"></span><span data-hover></span><span data-focus></span>` +
      `<div class="commit-line"><span class="subject" data-sample></span></div>` +
      `<div class="commit-line" data-marked><span class="subject"><span data-mark>a</span></span></div>`,
  );
  const at = (selector: string) => {
    const element = probe.querySelector<HTMLElement>(selector);
    if (element === null) {
      throw new Error(`No ${selector} to read the commit list from`);
    }
    return element;
  };
  const hover = at('[data-hover]');
  hover.style.background = 'var(--hover-background)';
  const focus = at('[data-focus]');
  focus.style.background = 'var(--color-focus)';
  const lane = document.createElement('span');
  probe.append(lane);
  const lanes = Array.from({ length: graphColors }, (_, index) => {
    lane.style.background = color(index);
    return layerOf(lane);
  });
  const subject = getComputedStyle(at('.commit .subject'));
  const bar = getComputedStyle(at('.bar'));
  const barColor = layerOf(at('.bar'));
  const emptyText = getComputedStyle(at('.working-tree.empty .subject'));
  const muted = getComputedStyle(at('.working-tree .subject')).color;
  const baselineMark = at('[data-baseline]');
  baselineMark.style.display = 'inline-block';
  baselineMark.style.verticalAlign = 'baseline';
  baselineMark.style.height = '0';
  const marked = at('[data-mark]');
  marked.style.color = 'var(--color-search-match-foreground)';
  marked.style.background = 'var(--color-search-match)';
  const sample = at('[data-sample]');
  sample.textContent = shapedSample;
  const looks: Looks = {
    textScale: textScaleOf(sample, scale),
    baseline:
      baselineMark.getBoundingClientRect().bottom -
      at('[data-line]').getBoundingClientRect().top,
    ground: over([0, 0, 0, 1], layerOf(list)),
    hover: layerOf(hover),
    selected: layerOf(at('.commit.selected')),
    focus: layerOf(focus),
    bar: [
      barColor[0],
      barColor[1],
      barColor[2],
      barColor[3] * Number(bar.opacity),
    ],
    barRadius: parseFloat(bar.borderTopLeftRadius) || 0,
    ink: subject.color,
    muted: getComputedStyle(at('.secondary .author')).color,
    markInk: getComputedStyle(marked).color,
    markGround: over([0, 0, 0, 1], layerOf(marked)),
    markTop:
      marked.getBoundingClientRect().top -
      at('[data-marked]').getBoundingClientRect().top,
    markHeight: marked.getBoundingClientRect().height,
    mutedWorkingTree: muted,
    emptyWorkingTree: fadedOf(emptyText.color, Number(emptyText.opacity)),
    family: subject.fontFamily,
    size: parseFloat(subject.fontSize),
    weight: subject.fontWeight,
    bold: getComputedStyle(at('.checked-out .subject')).fontWeight,
    lanes,
  };
  probe.remove();
  return looks;
}
