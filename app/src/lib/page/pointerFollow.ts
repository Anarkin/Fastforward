export interface PointerAt {
  readonly x: number;
  readonly y: number;
}

export function followPointer(
  element: HTMLElement,
  pointed: (at: PointerAt | undefined) => void,
): () => void {
  let last: PointerAt | undefined;
  const moved = (event: PointerEvent) => {
    last = { x: event.clientX, y: event.clientY };
    pointed(last);
  };
  const left = () => {
    last = undefined;
    pointed(undefined);
  };
  const scrolled = () => pointed(last);
  element.addEventListener('pointermove', moved);
  element.addEventListener('pointerleave', left);
  element.addEventListener('scroll', scrolled);
  return () => {
    element.removeEventListener('pointermove', moved);
    element.removeEventListener('pointerleave', left);
    element.removeEventListener('scroll', scrolled);
  };
}
