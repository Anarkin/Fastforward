import { snapOffset } from '../../lib/page/devicePixels';
import type { TipAt } from '../../lib/page/tips';

export interface TipBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface TipSize {
  readonly width: number;
  readonly height: number;
}

export interface TipPlace {
  readonly left: number;
  readonly top: number;
}

export const tipGap = 4;

const edge = 4;

const within = (value: number, room: number) =>
  Math.max(edge, Math.min(value, room - edge));

function across(anchor: TipBox, width: number, at: TipAt): number {
  if (at.endsWith('-center')) {
    return anchor.left + anchor.width / 2 - width / 2;
  }
  return at.endsWith('-end') ? anchor.left + anchor.width - width : anchor.left;
}

function down(anchor: TipBox, size: TipSize, view: TipSize, at: TipAt): number {
  const below = anchor.top + anchor.height + tipGap;
  const above = anchor.top - tipGap - size.height;
  const fitsBelow = below + size.height <= view.height - edge;
  const fitsAbove = above >= edge;
  if (at.startsWith('above')) {
    return fitsAbove || !fitsBelow ? above : below;
  }
  return fitsBelow || !fitsAbove ? below : above;
}

export function placedTip(
  anchor: TipBox,
  size: TipSize,
  view: TipSize,
  at: TipAt,
  inset: number,
  ratio: number,
): TipPlace {
  const [left, top] =
    at === 'over'
      ? [anchor.left - inset, anchor.top + (anchor.height - size.height) / 2]
      : [across(anchor, size.width, at), down(anchor, size, view, at)];
  const kept = {
    left: within(left, view.width - size.width),
    top: within(top, view.height - size.height),
  };
  return {
    left: kept.left + snapOffset(kept.left, ratio),
    top: kept.top + snapOffset(kept.top, ratio),
  };
}
