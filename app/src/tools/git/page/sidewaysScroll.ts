import { wheeled, type Modifiers } from '../../../lib/shared/keymap';
import { gitKeymap } from './keymap';
import { sidewaysColumns } from '../../../lib/page/rowScroll';

export function sideScroll(scroll: number, widest: number): number {
  return Math.max(0, Math.min(widest, scroll));
}

export const wheelGlide = 120;

export function wheelSideways(
  event: Modifiers & Pick<WheelEvent, 'deltaX' | 'deltaY'>,
): { delta: number; duration: number } {
  if (wheeled(gitKeymap.wheelSideways, event)) {
    return { delta: event.deltaX || event.deltaY, duration: wheelGlide };
  }
  return {
    delta: Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : 0,
    duration: 0,
  };
}

export function diffScrollLeft(
  step: 1 | -1,
  scrolled: number,
  room: number | undefined,
  advance: number,
): number | undefined {
  const by = sidewaysColumns * advance;
  if (step === -1 && scrolled > 0) {
    return Math.max(0, scrolled - by);
  }
  if (step === 1 && room !== undefined && scrolled < room) {
    return Math.min(room, scrolled + by);
  }
  return undefined;
}

export function sideRoom(element: HTMLElement): {
  side: number;
  widest: number;
} {
  const codes = Array.from(
    element.querySelectorAll<HTMLElement>('.split-code'),
  );
  return {
    side: codes.at(0)?.clientWidth ?? 0,
    widest: Math.max(
      0,
      ...codes.map(
        (code) =>
          (code.firstElementChild instanceof HTMLElement
            ? code.firstElementChild.offsetWidth
            : 0) - code.clientWidth,
      ),
    ),
  };
}
