import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import type { Side } from '../shared/sides';
import { nameRoom } from './plainLine';

const nameWidth = '--commander-name-width';

const lastRooms = new Map<Side, number>();

export function useNameRoom(
  section: RefObject<HTMLElement | null>,
  side: Side,
  list: string | undefined,
): number | undefined {
  const [room, setRoom] = useState(() => lastRooms.get(side));
  const told = useRef(room);
  useLayoutEffect(() => {
    const pane = section.current;
    const ruler = pane?.querySelector('.commander-ruler');
    const cell = ruler?.firstElementChild;
    const rows = pane?.querySelector('.column-body .virtual-spacer');
    if (list === undefined || !pane || !ruler || !cell || !rows) {
      return undefined;
    }
    const measure = (tell: (next: number | undefined) => void) => {
      const across = rows.getBoundingClientRect().width;
      if (across === 0) {
        return;
      }
      const width = Math.max(
        0,
        across -
          ruler.getBoundingClientRect().width +
          cell.getBoundingClientRect().width,
      );
      pane.style.setProperty(nameWidth, `${width}px`);
      const next = nameRoom(
        width,
        parseFloat(getComputedStyle(ruler).columnGap),
      );
      if (next !== told.current) {
        told.current = next;
        if (next !== undefined) {
          lastRooms.set(side, next);
        }
        tell(next);
      }
    };
    measure(setRoom);
    const observer = new ResizeObserver(() =>
      measure((next) => flushSync(() => setRoom(next))),
    );
    observer.observe(rows);
    observer.observe(cell);
    return () => observer.disconnect();
  }, [section, side, list]);
  return list === undefined ? undefined : room;
}
