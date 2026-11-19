import { memo } from 'react';

export interface ScrollbarMark {
  readonly kind: string;
  readonly top: number;
  readonly height: number;
}

function percent(value: number): string {
  return `${value * 100}%`;
}

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
          className={`scrollbar-mark ${mark.kind}`}
          style={{
            top: percent(mark.top * scale),
            height: percent(mark.height * scale),
          }}
        />
      ))}
    </div>
  );
});
