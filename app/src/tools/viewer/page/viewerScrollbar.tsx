import { memo, useMemo, useState } from 'react';
import type { ByteRange } from '../shared/protocol';
import { followDrag } from '../../../lib/page/followDrag';
import { shareAt } from '../../../lib/page/scrollbarGeometry';
import { overlayScrollbarClass } from '../../../lib/page/overlayScrollbars';
import { type Thumb, thumbBox, matchTicks, grabbedAt } from './scrollThumbs';

const minTick = 2;

function percent(share: number): string {
  return `${share * 100}%`;
}

const MatchTicks = memo(function MatchTicks({
  matches,
  size,
  track,
}: {
  matches: readonly ByteRange[];
  size: number;
  track: number;
}) {
  const ticks = useMemo(
    () => matchTicks(matches, size, track > 0 ? minTick / track : 0),
    [matches, size, track],
  );
  return ticks.map((tick) => (
    <div
      key={tick.top}
      className="minimap-mark match"
      style={{ top: percent(tick.top), height: percent(tick.height) }}
    />
  ));
});

export function ViewerScrollbar({
  scrollbar,
  thumb,
  track,
  shown,
  onShow,
  jump,
  matches,
  size,
}: {
  scrollbar: React.Ref<HTMLDivElement>;
  thumb: Thumb | undefined;
  track: number;
  shown: boolean;
  onShow: () => void;
  jump: (share: number) => void;
  matches: readonly ByteRange[];
  size: number;
}) {
  const [dragging, setDragging] = useState(false);
  const box = thumb && thumbBox(thumb, track);
  return (
    <div
      className="viewer-scrollbar"
      ref={scrollbar}
      style={box === undefined ? { pointerEvents: 'none' } : undefined}
      onPointerDown={(event) => {
        if (box === undefined) {
          return;
        }
        event.preventDefault();
        const bar = event.currentTarget.getBoundingClientRect();
        const grab = grabbedAt(event.clientY - bar.top, box);
        const at = (clientY: number) => {
          setDragging(true);
          jump(shareAt(clientY, bar.top, bar.height, box.height, grab));
        };
        at(event.clientY);
        followDrag(
          window,
          (pointer: PointerEvent) => at(pointer.clientY),
          () => {
            setDragging(false);
            onShow();
          },
        );
      }}
    >
      {box !== undefined && (
        <>
          <MatchTicks matches={matches} size={size} track={track} />
          <div
            className={`${overlayScrollbarClass} viewer-thumb${shown || dragging ? ' shown' : ''}${dragging ? ' dragging' : ''}`}
            style={{
              top: box.top,
              height: box.height,
            }}
          />
        </>
      )}
    </div>
  );
}
