export interface Thumb {
  readonly offset: number;
  readonly length: number;
}

const minThumb = 24;
export const hideAfter = 1000;

export function thumbOf(
  scrollSize: number,
  clientSize: number,
  scrolled: number,
  track = clientSize,
): Thumb | undefined {
  if (scrollSize <= clientSize + 1) {
    return undefined;
  }
  const length = Math.min(
    track,
    Math.max(minThumb, (track * clientSize) / scrollSize),
  );
  const range = scrollSize - clientSize;
  const position = scrolled >= range - 1 ? range : Math.max(scrolled, 0);
  const offset = ((track - length) * position) / range;
  return { offset, length };
}

export function scrollPerPixel(
  scrollSize: number,
  clientSize: number,
  track = clientSize,
): number {
  const thumb = thumbOf(scrollSize, clientSize, 0, track);
  const room = thumb ? track - thumb.length : 0;
  return room > 0 ? (scrollSize - clientSize) / room : 0;
}

export interface Track {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

const noTrackInsets: Track = { top: 0, bottom: 0, left: 0, right: 0 };

export type Axis = 'vertical' | 'horizontal';

export interface ScrollerMetrics {
  readonly left: number;
  readonly top: number;
  readonly clientLeft: number;
  readonly clientTop: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly track?: Track;
  readonly padding?: Track;
  readonly edges?: Edges;
  readonly bends?: Track;
}

interface Edges {
  readonly right: number;
  readonly bottom: number;
}

export interface Frame {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly line: number;
  readonly radius: number;
}

export function paintedFrame(frame: Frame, ratio: number): Frame {
  const snapped = (value: number) => Math.round(value * ratio) / ratio;
  return {
    left: snapped(frame.left),
    top: snapped(frame.top),
    right: snapped(frame.right),
    bottom: snapped(frame.bottom),
    line: Math.floor(frame.line * ratio + 0.001) / ratio,
    radius: frame.radius,
  };
}

function meets(one: number, other: number): boolean {
  return Math.abs(one - other) <= 1;
}

function sharedEdges(
  metrics: ScrollerMetrics,
  frame: Frame,
): Record<keyof Track, boolean> {
  const left = metrics.left + metrics.clientLeft;
  const top = metrics.top + metrics.clientTop;
  return {
    left: meets(left, frame.left),
    top: meets(top, frame.top),
    right: meets(left + metrics.clientWidth, frame.right),
    bottom: meets(top + metrics.clientHeight, frame.bottom),
  };
}

export function sharesEdge(metrics: ScrollerMetrics, frame: Frame): boolean {
  return Object.values(sharedEdges(metrics, frame)).some(Boolean);
}

export function framedMetrics(
  metrics: ScrollerMetrics,
  frame: Frame | undefined,
): ScrollerMetrics {
  if (frame === undefined || !sharesEdge(metrics, frame)) {
    return metrics;
  }
  const at = sharedEdges(metrics, frame);
  const left = metrics.left + metrics.clientLeft;
  const top = metrics.top + metrics.clientTop;
  const right = left + metrics.clientWidth;
  const bottom = top + metrics.clientHeight;
  const inset: Track = {
    top: frame.top + frame.line - top,
    bottom: bottom - (frame.bottom - frame.line),
    left: frame.left + frame.line - left,
    right: right - (frame.right - frame.line),
  };
  const inner = Math.max(0, frame.radius - frame.line);
  const own = metrics.track ?? noTrackInsets;
  const padding = metrics.padding ?? own;
  const end = (side: keyof Track) =>
    !at[side]
      ? own[side]
      : padding[side] > 0
        ? Math.max(padding[side], inset[side])
        : inset[side];
  const track: Track = {
    top: end('top'),
    bottom: end('bottom'),
    left: end('left'),
    right: end('right'),
  };
  const bend = (side: keyof Track, corner: boolean) =>
    at[side] && corner && track[side] - inset[side] < 0.5 ? inner : 0;
  return {
    ...metrics,
    track,
    edges: {
      right: at.right ? inset.right : 0,
      bottom: at.bottom ? inset.bottom : 0,
    },
    bends: {
      top: bend('top', at.right),
      bottom: bend('bottom', at.right),
      left: bend('left', at.bottom),
      right: bend('right', at.bottom),
    },
  };
}

export interface ThumbClip {
  readonly before: number;
  readonly after: number;
  readonly start: number;
  readonly end: number;
}

export interface ThumbBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly clip?: ThumbClip;
}

function clipOf(
  thumb: Thumb,
  track: number,
  start: number,
  end: number,
): ThumbClip {
  return {
    before: thumb.offset,
    after: track - thumb.offset - thumb.length,
    start,
    end,
  };
}

export function clipPathOf(axis: Axis, clip: ThumbClip | undefined): string {
  if (clip === undefined) {
    return '';
  }
  const { before, after, start, end } = clip;
  const across = Math.max(start, end);
  return axis === 'vertical'
    ? `inset(${-before}px 0px ${-after}px ${-across}px round 0px ${start}px ${end}px 0px)`
    : `inset(${-across}px ${-after}px 0px ${-before}px round 0px 0px ${end}px ${start}px)`;
}

export function thumbBox(
  axis: Axis,
  scroller: ScrollerMetrics,
  size: number,
): ThumbBox | undefined {
  const left = scroller.left + scroller.clientLeft;
  const top = scroller.top + scroller.clientTop;
  const track = scroller.track ?? noTrackInsets;
  if (axis === 'vertical') {
    const thumb = thumbOf(
      scroller.scrollHeight,
      scroller.clientHeight,
      scroller.scrollTop,
      verticalTrack(scroller),
    );
    return (
      thumb && {
        left: left + scroller.clientWidth - size - (scroller.edges?.right ?? 0),
        top: top + track.top + thumb.offset,
        width: size,
        height: thumb.length,
        ...(scroller.bends && {
          clip: clipOf(
            thumb,
            verticalTrack(scroller),
            scroller.bends.top,
            scroller.bends.bottom,
          ),
        }),
      }
    );
  }
  const thumb = thumbOf(
    scroller.scrollWidth,
    scroller.clientWidth,
    scroller.scrollLeft,
    horizontalTrack(scroller),
  );
  return (
    thumb && {
      left: left + track.left + thumb.offset,
      top: top + scroller.clientHeight - size - (scroller.edges?.bottom ?? 0),
      width: thumb.length,
      height: size,
      ...(scroller.bends && {
        clip: clipOf(
          thumb,
          horizontalTrack(scroller),
          scroller.bends.left,
          scroller.bends.right,
        ),
      }),
    }
  );
}

export function trackBox(
  axis: Axis,
  scroller: ScrollerMetrics,
  size: number,
): ThumbBox | undefined {
  if (!thumbBox(axis, scroller, size)) {
    return undefined;
  }
  const left = scroller.left + scroller.clientLeft;
  const top = scroller.top + scroller.clientTop;
  const track = scroller.track ?? noTrackInsets;
  return axis === 'vertical'
    ? {
        left: left + scroller.clientWidth - size - (scroller.edges?.right ?? 0),
        top: top + track.top,
        width: size,
        height: verticalTrack(scroller),
      }
    : {
        left: left + track.left,
        top: top + scroller.clientHeight - size - (scroller.edges?.bottom ?? 0),
        width: horizontalTrack(scroller),
        height: size,
      };
}

export function contains(
  box: ThumbBox,
  pointer: { readonly clientX: number; readonly clientY: number },
): boolean {
  return (
    pointer.clientX >= box.left &&
    pointer.clientX < box.left + box.width &&
    pointer.clientY >= box.top &&
    pointer.clientY < box.top + box.height
  );
}

export function shareAt(
  pointer: number,
  start: number,
  track: number,
  length: number,
  grab = length / 2,
): number {
  const room = track - length;
  return room > 0
    ? Math.min(Math.max((pointer - start - grab) / room, 0), 1)
    : 0;
}

export function grabbedAt(
  pointer: number,
  thumb: { readonly top: number; readonly height: number },
): number {
  return pointer >= thumb.top && pointer <= thumb.top + thumb.height
    ? pointer - thumb.top
    : thumb.height / 2;
}

export function jumpedScroll(
  axis: Axis,
  scroller: ScrollerMetrics,
  pointer: { readonly clientX: number; readonly clientY: number },
): number {
  const track = scroller.track ?? noTrackInsets;
  const [scrollSize, clientSize, along, start, length] =
    axis === 'vertical'
      ? [
          scroller.scrollHeight,
          scroller.clientHeight,
          pointer.clientY,
          scroller.top + scroller.clientTop + track.top,
          verticalTrack(scroller),
        ]
      : [
          scroller.scrollWidth,
          scroller.clientWidth,
          pointer.clientX,
          scroller.left + scroller.clientLeft + track.left,
          horizontalTrack(scroller),
        ];
  const thumb = thumbOf(scrollSize, clientSize, 0, length);
  return thumb
    ? shareAt(along, start, length, thumb.length) * (scrollSize - clientSize)
    : 0;
}

function verticalTrack({ clientHeight, track }: ScrollerMetrics): number {
  return Math.max(0, clientHeight - (track?.top ?? 0) - (track?.bottom ?? 0));
}

function horizontalTrack({ clientWidth, track }: ScrollerMetrics): number {
  return Math.max(0, clientWidth - (track?.left ?? 0) - (track?.right ?? 0));
}

export interface Drag {
  readonly pointer: number;
  readonly scroll: number;
  readonly ratio: number;
}

export function dragFrom(
  axis: Axis,
  scroller: ScrollerMetrics,
  pointer: { readonly clientX: number; readonly clientY: number },
): Drag {
  return axis === 'vertical'
    ? {
        pointer: pointer.clientY,
        scroll: scroller.scrollTop,
        ratio: scrollPerPixel(
          scroller.scrollHeight,
          scroller.clientHeight,
          verticalTrack(scroller),
        ),
      }
    : {
        pointer: pointer.clientX,
        scroll: scroller.scrollLeft,
        ratio: scrollPerPixel(
          scroller.scrollWidth,
          scroller.clientWidth,
          horizontalTrack(scroller),
        ),
      };
}

export function draggedScroll(
  axis: Axis,
  drag: Drag,
  pointer: { readonly clientX: number; readonly clientY: number },
): number {
  const now = axis === 'vertical' ? pointer.clientY : pointer.clientX;
  return drag.scroll + (now - drag.pointer) * drag.ratio;
}
