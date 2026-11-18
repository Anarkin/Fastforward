import { wheeled, type Modifiers } from '../../../lib/shared/keymap';
import { diffKeymap } from './keymap';
import { sidewaysColumns } from '../../../lib/page/scrollSettings';
import { snappedLeft } from '../../../lib/page/columnScroll';
import { snapOffset } from '../../../lib/page/devicePixels';

export function codeShift(by: number, scale: number): string {
  const snapped = by + snapOffset(by, scale);
  return `translateX(${snapped === 0 ? 0 : -snapped}px)`;
}

export const wheelsSideways = (event: Modifiers): boolean =>
  wheeled(diffKeymap.wheelSideways, event) === true;

export function diffScrollLeft(
  step: 1 | -1,
  scrolled: number,
  room: number,
  advance: number,
): number | undefined {
  const by = sidewaysColumns * advance;
  if (step === -1 ? scrolled > 0 : scrolled < room) {
    return snappedLeft(scrolled + step * by, advance, room);
  }
  return undefined;
}

export function sideWidth(element: HTMLElement): number {
  return (
    element.querySelector<HTMLElement>('.diff-row .split-code')?.clientWidth ??
    0
  );
}
