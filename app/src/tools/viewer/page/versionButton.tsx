import { viewerKeymap } from './keymap';
import { keysOf } from '../../../lib/shared/keymap';
import { VersionButton as VersionMenuButton } from '../../../components/versions/page/versionButton';
import { useShell } from '../../../shell/page/store';
import { useViewer, useViewerActions } from './store';

export function ViewedVersionButton({
  trigger,
  onChosen,
}: {
  readonly trigger: React.Ref<HTMLButtonElement>;
  readonly onChosen: () => void;
}) {
  const listed = useViewer((state) =>
    state.tab === undefined ? undefined : state.versions.get(state.tab),
  );
  const version = useViewer((state) => state.version);
  const { chooseVersion } = useViewerActions();
  const scrolling = useShell((state) => state.scrolling);
  const dateFormat = useShell((state) => state.dateFormat);
  return (
    <VersionMenuButton
      listed={listed}
      version={version}
      choose={chooseVersion}
      dateFormat={dateFormat}
      scrolling={scrolling}
      trigger={trigger}
      keys={keysOf(viewerKeymap.version)}
      onChosen={onChosen}
    />
  );
}
