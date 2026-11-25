import { memo, useMemo } from 'react';
import { ScrollbarMarks } from '../../../lib/page/scrollbarMarks';
import { leastTick } from '../../../lib/page/scrollbarTicks';
import type { ByteRange } from '../shared/protocol';
import { currentTick, matchTicks } from './scrollThumbs';

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
  const marks = useMemo(() => {
    const least = track > 0 ? leastTick / track : 0;
    const shown = currentTick(current, size, least);
    return [
      ...matchTicks(matches, size, least).map((tick) => ({
        kind: 'match',
        ...tick,
      })),
      ...(shown === undefined ? [] : [{ kind: 'current', ...shown }]),
    ];
  }, [matches, current, size, track]);
  return <ScrollbarMarks marks={marks} marked={ticks} />;
});
