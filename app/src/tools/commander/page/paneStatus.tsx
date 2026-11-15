import { type Side } from '../shared/protocol';
import { readingKey } from './commanderReceived';
import { useCommander } from './store';
import { StatusLine } from './statusLine';
import { sentencesOf } from '../../../lib/shared/sentences';
import { strings } from '../../../lib/shared/strings';
import { Words } from '../../../lib/page/name';

export function ReadingStatus({ side }: { side: Side }) {
  const reading = useCommander((state) =>
    state.readingArchives.get(readingKey(state.view.tab, side)),
  );
  return reading === undefined ? null : (
    <StatusLine announced>
      <Words>
        {sentencesOf(
          [
            strings.commander.readingArchive(reading),
            strings.commander.escapeStops,
          ],
          ' · ',
        )}
      </Words>
    </StatusLine>
  );
}

export function DuplicatesStatus({ side }: { side: Side }) {
  const duplicates = useCommander(
    (state) => state.view.panes[side]?.duplicates,
  );
  if (duplicates === undefined) {
    return null;
  }
  if (duplicates.reading) {
    return (
      <StatusLine announced>
        {[
          strings.commander.findingDuplicates,
          strings.commander.escapeStops,
        ].join(' · ')}
      </StatusLine>
    );
  }
  return duplicates.groups.length === 0 ? (
    <StatusLine announced>{strings.commander.noDuplicates}</StatusLine>
  ) : null;
}

export function CountingStatus({ side }: { side: Side }) {
  const counting = useCommander(
    (state) => state.view.panes[side]?.counting ?? 0,
  );
  return counting === 0 ? null : (
    <StatusLine announced>
      {[
        strings.commander.countingSizes(counting),
        strings.commander.escapeStops,
      ].join(' · ')}
    </StatusLine>
  );
}

export function FlatStatus({
  side,
  files,
  under,
}: {
  side: Side;
  files: number;
  under: string | undefined;
}) {
  const progress = useCommander(
    (state) => state.view.panes[side]?.flat?.progress,
  );
  if (progress === undefined) {
    return null;
  }
  const { reading, stopped, folders, failed } = progress;
  const read = reading
    ? strings.commander.flatReading(files, folders)
    : stopped
      ? strings.commander.flatStopped(files, folders)
      : strings.commander.flatRead(files, folders);
  return (
    <StatusLine
      announced
      tone={stopped ? 'warning' : undefined}
      end={under === undefined || under === '' ? undefined : under.slice(0, -1)}
    >
      {[
        read,
        failed > 0 ? strings.commander.flatFailed(failed) : undefined,
        reading ? strings.commander.escapeStops : undefined,
      ]
        .filter((part) => part !== undefined)
        .join(' · ')}
    </StatusLine>
  );
}
