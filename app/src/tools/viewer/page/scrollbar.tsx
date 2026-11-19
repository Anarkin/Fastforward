import { memo, useMemo } from 'react';
import { ScrollbarMarks } from '../../../lib/page/scrollbarMarks';
import type { ByteRange } from '../shared/protocol';
import { matchTicks } from './scrollThumbs';

const minTick = 2;

export const MatchTicks = memo(function MatchTicks({
  ticks,
  matches,
  size,
  track,
}: {
  ticks: React.Ref<HTMLDivElement>;
  matches: readonly ByteRange[];
  size: number;
  track: number;
}) {
  const marks = useMemo(
    () =>
      matchTicks(matches, size, track > 0 ? minTick / track : 0).map(
        (tick) => ({ kind: 'match', ...tick }),
      ),
    [matches, size, track],
  );
  return <ScrollbarMarks marks={marks} marked={ticks} />;
});
