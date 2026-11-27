import { memo } from 'react';
import { markClassOf, markPlaceOf, type ScrollbarMark } from './trackMarks';

export const ScrollbarMarks = memo(function ScrollbarMarks({
  marks,
  scale = 1,
  marked,
}: {
  marks: readonly ScrollbarMark[];
  scale?: number;
  marked?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div className="scrollbar-marks" ref={marked}>
      {marks.map((mark) => (
        <div
          key={`${mark.kind}:${mark.top}`}
          className={markClassOf(mark)}
          style={markPlaceOf(mark, scale)}
        />
      ))}
    </div>
  );
});
