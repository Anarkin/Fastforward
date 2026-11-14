import { useEffect, useRef, useState } from 'react';
import { clicked, released } from '../shared/keymap';
import { keymap } from './keymap';

const dragEnds = ['pointerup', 'pointercancel'];

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

export function draggedTo(
  start: Point,
  moved: Point,
  size: Size,
  view: Size & { readonly ratio: number },
): Point {
  const placed = (value: number, room: number) =>
    Math.max(
      0,
      Math.min(
        Math.round(value * view.ratio) / view.ratio,
        Math.floor(room * view.ratio) / view.ratio,
      ),
    );
  return {
    x: placed(start.x + moved.x, view.width - size.width),
    y: placed(start.y + moved.y, view.height - size.height),
  };
}

export function useDialogDrag(dialog: React.RefObject<HTMLElement | null>) {
  const [place, setPlace] = useState<Point>();
  const stop = useRef<() => void>(undefined);
  useEffect(() => () => stop.current?.(), []);
  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const element = dialog.current;
    const view = element?.ownerDocument.defaultView;
    const target = event.target as Partial<Element>;
    if (
      !clicked(keymap.drag, event) ||
      !element ||
      !view ||
      target.closest?.('button')
    ) {
      return;
    }
    event.preventDefault();
    const box = element.getBoundingClientRect();
    const from = { x: event.clientX, y: event.clientY };
    const move = (moved: MouseEvent) => {
      if (released(moved)) {
        end();
        return;
      }
      setPlace(
        draggedTo(
          { x: box.left, y: box.top },
          { x: moved.clientX - from.x, y: moved.clientY - from.y },
          box,
          {
            width: view.innerWidth,
            height: view.innerHeight,
            ratio: view.devicePixelRatio,
          },
        ),
      );
    };
    stop.current?.();
    const end = () => {
      view.removeEventListener('pointermove', move);
      for (const type of dragEnds) {
        view.removeEventListener(type, end);
      }
      stop.current = undefined;
    };
    view.addEventListener('pointermove', move);
    for (const type of dragEnds) {
      view.addEventListener(type, end);
    }
    stop.current = end;
  };
  return {
    style:
      place === undefined
        ? undefined
        : { position: 'fixed' as const, left: place.x, top: place.y },
    onPointerDown,
  };
}
