import { memo } from 'react';
import { BubbleReplica } from './bubbles';
import type { BubbleLook } from './bubbleLooks';

const baselineSample = 'x';

export const BubbleShapes = memo(function BubbleShapes({
  shapes,
  probe,
}: {
  shapes: ReadonlyMap<string, BubbleLook>;
  probe: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="bubble-lab" aria-hidden="true" ref={probe}>
      <div className="bubble-lab-line">
        <span className="badge" data-baseline-of="">
          <span className="baseline-mark" />
          {baselineSample}
        </span>
        <span className="badge checked-out" data-colors-of="checked-out" />
        {[...shapes].map(([key, look]) => (
          <span key={key} data-shape={key}>
            <BubbleReplica look={look} />
          </span>
        ))}
      </div>
    </div>
  );
});
