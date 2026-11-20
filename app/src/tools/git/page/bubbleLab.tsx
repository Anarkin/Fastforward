import { useLayoutEffect, useRef } from 'react';
import { BubbleReplica } from './bubbles';
import { lookKey, type BubbleLook } from './bubbleLooks';
import { noBubbleRoom, roomOf, sameRoom, type BubbleRoom } from './bubbleRoom';

export function BubbleLab({
  looks,
  onRoom,
}: {
  looks: readonly BubbleLook[];
  onRoom: (room: BubbleRoom) => void;
}) {
  const lineRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLSpanElement>(null);
  const told = useRef(noBubbleRoom);
  useLayoutEffect(() => {
    const line = lineRef.current;
    const row = rowRef.current;
    if (!line || !row) {
      return undefined;
    }
    const measure = () => {
      const room = roomOf(line, row, looks);
      if (!sameRoom(room, told.current)) {
        told.current = room;
        onRoom(room);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(line);
    observer.observe(row);
    return () => observer.disconnect();
  }, [looks, onRoom]);
  return (
    <div className="bubble-lab" aria-hidden="true" style={{ paddingLeft: 0 }}>
      <div className="bubble-lab-line" ref={lineRef}>
        <span className="bubble-lab-row" ref={rowRef}>
          {looks.map((look) => (
            <BubbleReplica key={lookKey(look)} look={look} />
          ))}
          <span className="bubble-lab-end" />
        </span>
      </div>
    </div>
  );
}
