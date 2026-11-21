import { withinDevicePixel } from './devicePixels';
import { menuGap } from './menuControls';

export interface MenuFit {
  readonly tallest: number | undefined;
  readonly moved: number;
}

interface MenuBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

interface View {
  readonly width: number;
  readonly height: number;
  readonly ratio: number;
}

function sameLength(
  length: number | undefined,
  other: number | undefined,
  ratio: number,
): boolean {
  return length === undefined || other === undefined
    ? length === other
    : withinDevicePixel(length, other, ratio);
}

export function menuFit(
  fit: MenuFit | undefined,
  box: MenuBox,
  scrollHeight: number,
  scrolls: boolean,
  view: View,
): MenuFit | undefined {
  const below = view.height - box.top - menuGap;
  const tallest = scrolls && scrollHeight > below ? below : undefined;
  const was = fit?.moved ?? 0;
  const past = box.right + was - (view.width - menuGap);
  const moved = Math.max(0, Math.min(past, box.left + was - menuGap));
  return sameLength(fit?.tallest, tallest, view.ratio) &&
    withinDevicePixel(was, moved, view.ratio)
    ? undefined
    : { tallest, moved };
}
