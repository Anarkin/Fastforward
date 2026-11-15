import { type Side } from '../shared/sides';
import { type Row } from './listing';
import { readingKey } from './commanderReceived';
import { useCommander } from './store';
import { StatusLine } from '../../../lib/page/statusLine';
import { PathName } from '../../../lib/page/pathName';
import { useShownAfter } from '../../../lib/page/shownAfter';
import { selectedPathOf, goesOn } from './sideStatus';
import { strings } from '../../../lib/shared/strings';

export function PaneStatus({
  side,
  selected,
}: {
  side: Side;
  selected: Row | undefined;
}) {
  const told = useCommander((state) =>
    state.readingSides.has(readingKey(state.view.tab, side)),
  );
  const going = useCommander((state) => goesOn(state.view.panes[side]));
  const path = useCommander((state) =>
    selectedPathOf(state.view.panes[side], selected, state.view.platform),
  );
  const reading = useShownAfter(going) || told;
  if (reading) {
    return (
      <StatusLine font="monospace" announced>
        {strings.common.reading}
      </StatusLine>
    );
  }
  return path === undefined ? null : (
    <StatusLine font="monospace">
      <PathName path={path} file />
    </StatusLine>
  );
}
