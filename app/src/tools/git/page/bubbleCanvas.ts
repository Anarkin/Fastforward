import { fadedOf } from '../../../components/cells/page/listLooks';
import type { ActionKey, BubbleLook } from './bubbleLooks';

interface IconPlace {
  readonly left: number;
  readonly top: number;
  readonly size: number;
  readonly paths: readonly string[];
  readonly strokeWidth: number;
}

interface ButtonPlace {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface CountPlace {
  readonly left: number;
  readonly top: number;
}

interface BubbleGeometry {
  readonly width: number;
  readonly height: number;
  readonly textLeft: number;
  readonly tag: boolean;
  readonly icons: readonly IconPlace[];
  readonly actionBoxes: readonly ButtonPlace[];
  readonly counts: readonly CountPlace[];
}

interface BubbleInks {
  readonly ink: string;
  readonly ground: string;
  readonly edge: string;
}

export interface BubbleLooks {
  readonly geometries: ReadonlyMap<string, BubbleGeometry>;
  readonly plain: BubbleInks;
  readonly checkedOut: BubbleInks;
  readonly font: string;
  readonly baseline: number;
  readonly size: number;
}

function colorOf(host: HTMLElement, value: string): string {
  const probe = document.createElement('span');
  probe.style.color = value;
  host.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

function inksOf(badge: HTMLElement, checkedOut: boolean): BubbleInks {
  const prefix = checkedOut
    ? '--color-git-bubble-checked-out'
    : '--color-git-bubble';
  return {
    ink: getComputedStyle(badge).color,
    ground: colorOf(badge, `var(${prefix})`),
    edge: colorOf(badge, `var(${prefix}-border)`),
  };
}

function geometryOf(badge: HTMLElement): BubbleGeometry {
  const box = badge.getBoundingClientRect();
  const style = getComputedStyle(badge);
  const name = badge.querySelector('.bubble-name');
  const textLeft =
    name === null
      ? parseFloat(style.paddingLeft) || 0
      : name.getBoundingClientRect().left - box.left;
  return {
    width: box.width,
    height: box.height,
    textLeft,
    tag:
      badge.classList.contains('tag') || badge.classList.contains('remote-tag'),
    icons: Array.from(badge.querySelectorAll('svg'), (icon) => {
      const place = icon.getBoundingClientRect();
      return {
        left: place.left - box.left,
        top: place.top - box.top,
        size: place.width,
        paths: Array.from(
          icon.querySelectorAll('path'),
          (path) => path.getAttribute('d') ?? '',
        ),
        strokeWidth: parseFloat(getComputedStyle(icon).strokeWidth) || 1,
      };
    }),
    actionBoxes: Array.from(
      badge.querySelectorAll('.bubble-action'),
      (button) => {
        const place = button.getBoundingClientRect();
        return {
          left: place.left - box.left,
          top: place.top - box.top,
          width: place.width,
          height: place.height,
        };
      },
    ),
    counts: Array.from(badge.querySelectorAll('.bubble-count'), (count) => {
      const place = count.getBoundingClientRect();
      return { left: place.left - box.left, top: place.top - box.top };
    }),
  };
}

export function bubbleLooksOf(probe: HTMLElement): BubbleLooks | undefined {
  const marked = probe.querySelector<HTMLElement>('[data-baseline-of]');
  const mark = marked?.querySelector<HTMLElement>('.baseline-mark');
  const checkedOut = probe.querySelector<HTMLElement>('[data-colors-of]');
  if (!marked || !mark || !checkedOut) {
    return undefined;
  }
  mark.style.display = 'inline-block';
  mark.style.height = '0';
  mark.style.verticalAlign = 'baseline';
  const style = getComputedStyle(marked);
  const geometries = new Map<string, BubbleGeometry>();
  for (const shape of probe.querySelectorAll<HTMLElement>('[data-shape]')) {
    const badge = shape.querySelector<HTMLElement>('.badge');
    if (badge !== null) {
      geometries.set(shape.dataset.shape ?? '', geometryOf(badge));
    }
  }
  return {
    geometries,
    plain: inksOf(marked, false),
    checkedOut: inksOf(checkedOut, true),
    font: `${style.fontStyle} ${style.fontWeight} SIZE ${style.fontFamily}`,
    size: parseFloat(style.fontSize),
    baseline:
      mark.getBoundingClientRect().bottom - marked.getBoundingClientRect().top,
  };
}

export interface PaintedBubble {
  readonly look: BubbleLook;
  readonly checkedOut: boolean;
  readonly text: string;
  readonly textWidth: number;
  readonly width: number;
  readonly geometry: BubbleGeometry;
  readonly hovered: ActionKey | undefined;
  readonly running: readonly ActionKey[];
  readonly bob: number;
}

const bobPeriod = 500;

const bobReach = 1.5;

const bobSteps = 16;

function eased(share: number): number {
  return share * share * (3 - 2 * share);
}

export function bobAt(time: number, reversed: boolean): number {
  const round = (time / bobPeriod) % 2;
  const forth = round < 1 ? round : 2 - round;
  const share = reversed ? 1 - forth : forth;
  return Math.round((eased(share) * 2 - 1) * bobReach * bobSteps) / bobSteps;
}

export function bubbleFontOf(looks: BubbleLooks, scale: number): string {
  return looks.font.replace('SIZE', `${looks.size * scale}px`);
}

function tagPath(
  left: number,
  top: number,
  width: number,
  height: number,
  scale: number,
): Path2D {
  const path = new Path2D();
  const x = (from: number) => left + width - from * scale;
  const y = (at: number) => top + at * scale;
  const middle = height / 2 / scale;
  const bottom = height / scale;
  path.moveTo(left, top);
  path.lineTo(x(8), y(0));
  path.quadraticCurveTo(x(7), y(0), x(6.4), y(0.8));
  path.lineTo(x(0.8), y(middle - 1));
  path.quadraticCurveTo(x(0), y(middle), x(0.8), y(middle + 1));
  path.lineTo(x(6.4), y(bottom - 0.8));
  path.quadraticCurveTo(x(7), y(bottom), x(8), y(bottom));
  path.lineTo(left, top + height);
  path.closePath();
  return path;
}

interface BubblePlace {
  readonly textScale: number;
  readonly left: number;
  readonly top: number;
  readonly tileLeft: number;
  readonly tileTop: number;
  readonly scale: number;
  readonly hairline: number;
}

let scratch: OffscreenCanvasRenderingContext2D | undefined;

function scratchOf(
  width: number,
  height: number,
): OffscreenCanvasRenderingContext2D {
  if (
    scratch === undefined ||
    scratch.canvas.width < width ||
    scratch.canvas.height < height
  ) {
    const canvas = new OffscreenCanvas(
      Math.max(width, scratch?.canvas.width ?? 0),
      Math.max(height, scratch?.canvas.height ?? 0),
    );
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      throw new Error('No 2D canvas to draw bubbles on');
    }
    scratch = context;
  }
  scratch.clearRect(0, 0, width, height);
  return scratch;
}

function paintGround(
  context: OffscreenCanvasRenderingContext2D,
  bubble: PaintedBubble,
  inks: BubbleInks,
  place: BubblePlace,
  box: { x0: number; x1: number; y0: number; y1: number },
): void {
  const { scale, tileLeft, tileTop, hairline } = place;
  const { geometry } = bubble;
  const { x0, x1, y0, y1 } = box;
  context.save();
  if (geometry.tag) {
    context.clip(
      tagPath(
        place.left * scale - tileLeft,
        place.top * scale - tileTop,
        bubble.width * scale,
        geometry.height * scale,
        scale,
      ),
    );
    const holeX = x1 - 9 * scale;
    const holeY = (y0 + y1) / 2;
    const hole = context.createRadialGradient(
      holeX,
      holeY,
      0,
      holeX,
      holeY,
      2.5 * scale,
    );
    const clear = fadedOf(inks.ground, 0);
    hole.addColorStop(0, clear);
    hole.addColorStop(0.8, clear);
    hole.addColorStop(1, inks.ground);
    context.fillStyle = hole;
  } else {
    context.fillStyle = inks.ground;
  }
  context.fillRect(x0, y0, x1 - x0, y1 - y0);
  context.fillStyle = inks.edge;
  const inner = y1 - y0 - 2 * hairline;
  context.fillRect(x0, y0, x1 - x0, hairline);
  context.fillRect(x0, y1 - hairline, x1 - x0, hairline);
  context.fillRect(x0, y0 + hairline, hairline, inner);
  context.fillRect(x1 - hairline, y0 + hairline, hairline, inner);
  context.restore();
}

function paintIcons(
  context: OffscreenCanvasRenderingContext2D,
  bubble: PaintedBubble,
  inks: BubbleInks,
  place: BubblePlace,
  box: { x0: number; x1: number; y0: number; y1: number },
): void {
  const { scale, tileLeft, tileTop } = place;
  const { geometry } = bubble;
  const { x0, x1, y0, y1 } = box;
  const shift = bubble.width - geometry.width;
  context.strokeStyle = inks.ink;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  geometry.icons.forEach((icon, at) => {
    const key = bubble.look.actions[at]?.key;
    const running = key !== undefined && bubble.running.includes(key);
    const lift = running ? (key === 'push' ? -bubble.bob : bubble.bob) : 0;
    const left =
      Math.round((place.left + icon.left + shift) * scale) - tileLeft;
    const top = (place.top + icon.top + lift) * scale - tileTop;
    const units = (icon.size / 16) * scale;
    context.save();
    context.beginPath();
    context.rect(x0, y0, x1 - x0, y1 - y0);
    context.clip();
    context.translate(left, top);
    context.scale(units, units);
    context.lineWidth = icon.strokeWidth;
    for (const path of icon.paths) {
      context.stroke(new Path2D(path));
    }
    context.restore();
  });
}

function paintHover(
  context: OffscreenCanvasRenderingContext2D,
  bubble: PaintedBubble,
  inks: BubbleInks,
  place: BubblePlace,
): void {
  const { scale, tileLeft, tileTop } = place;
  const { geometry, hovered } = bubble;
  if (hovered === undefined || bubble.running.includes(hovered)) {
    return;
  }
  const at = bubble.look.actions.findIndex((action) => action.key === hovered);
  const button = geometry.actionBoxes[at];
  if (button === undefined) {
    return;
  }
  const shift = bubble.width - geometry.width;
  const x0 = Math.round((place.left + button.left + shift) * scale) - tileLeft;
  const x1 =
    Math.round((place.left + button.left + shift + button.width) * scale) -
    tileLeft;
  const y0 = Math.round((place.top + button.top) * scale) - tileTop;
  const y1 =
    Math.min(
      Math.round((place.top + button.top + button.height) * scale),
      Math.round((place.top + geometry.height) * scale),
    ) - tileTop;
  context.fillStyle = fadedOf(inks.ink, hoverShare);
  context.fillRect(x0, y0, x1 - x0, y1 - y0);
}

const hoverShare = 0.22;

function written(
  context: OffscreenCanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  textScale: number,
): void {
  if (textScale === 1) {
    context.fillText(text, x, y);
    return;
  }
  context.save();
  context.translate(x, y);
  context.scale(textScale, textScale);
  context.fillText(text, 0, 0);
  context.restore();
}

export function paintBubble(
  context: OffscreenCanvasRenderingContext2D,
  bubble: PaintedBubble,
  looks: BubbleLooks,
  place: BubblePlace,
): void {
  const { scale, tileLeft, tileTop } = place;
  const inks = bubble.checkedOut ? looks.checkedOut : looks.plain;
  const { geometry } = bubble;
  const box = {
    x0: Math.round(place.left * scale) - tileLeft,
    x1: Math.round((place.left + bubble.width) * scale) - tileLeft,
    y0: Math.round(place.top * scale) - tileTop,
    y1: Math.round((place.top + geometry.height) * scale) - tileTop,
  };
  const width = Math.max(1, Math.ceil(box.x1));
  const height = Math.max(1, Math.ceil(box.y1));
  paintGround(context, bubble, inks, place, box);
  paintHover(context, bubble, inks, place);
  if (geometry.icons.length > 0) {
    const icons = scratchOf(width, height);
    paintIcons(icons, bubble, inks, place, box);
    context.drawImage(icons.canvas, 0, 0, width, height, 0, 0, width, height);
  }
  context.save();
  context.beginPath();
  context.rect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
  context.clip();
  context.fillStyle = inks.ink;
  context.font = bubbleFontOf(looks, scale / place.textScale);
  context.textBaseline = 'alphabetic';
  written(
    context,
    bubble.text,
    (place.left + geometry.textLeft) * scale - tileLeft,
    box.y0 + Math.round(looks.baseline * scale),
    place.textScale,
  );
  const shift = bubble.width - geometry.width;
  bubble.look.actions
    .filter((action) => action.count > 0)
    .forEach((action, at) => {
      const count = geometry.counts[at];
      if (count !== undefined) {
        written(
          context,
          String(action.count),
          (place.left + count.left + shift) * scale - tileLeft,
          box.y0 + Math.round((count.top + looks.baseline) * scale),
          place.textScale,
        );
      }
    });
  context.restore();
}
