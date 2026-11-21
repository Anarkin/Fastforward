import { memo } from 'react';

export interface ScrollbarMark {
  readonly kind: string;
  readonly top: number;
  readonly height: number;
}

interface MarkPlace extends React.CSSProperties {
  readonly '--mark-top': string;
  readonly '--mark-height': string;
}

function percent(value: number): string {
  return `${value * 100}%`;
}

function placeOf(mark: ScrollbarMark, scale: number): MarkPlace {
  return {
    '--mark-top': percent(mark.top * scale),
    '--mark-height': percent(mark.height * scale),
  };
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
          style={placeOf(mark, scale)}
        />
      ))}
    </div>
  );
});
