import { memo, useMemo } from 'react';
import { ScrollbarMarks } from '../../../lib/page/scrollbarMarks';
import { leastOn, matchMarks } from '../../../lib/page/scrollbarTicks';
import type { ByteRange } from '../shared/protocol';

const spanOf = ({ start, end }: ByteRange) => ({ top: start, bottom: end });

export const MatchTicks = memo(function MatchTicks({
  ticks,
  matches,
  current,
  size,
  track,
}: {
  ticks: React.Ref<HTMLDivElement>;
  matches: readonly ByteRange[];
  current: ByteRange | undefined;
  size: number;
  track: number;
}) {
  const marks = useMemo(
    () =>
      matchMarks(
        matches.map(spanOf),
        current === undefined ? undefined : spanOf(current),
        size,
        leastOn(track),
      ),
    [matches, current, size, track],
  );
  return <ScrollbarMarks marks={marks} marked={ticks} />;
});
