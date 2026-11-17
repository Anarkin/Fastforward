import { MenuButton } from '../../../lib/page/menu';
import { strings } from '../../../lib/shared/strings';
import { useShell } from '../../../shell/page/store';
import { useViewer, useViewerActions } from './store';
import { showsCommit, versionLabel, versionMenu } from './versionMenu';

export function VersionButton({ onChosen }: { readonly onChosen: () => void }) {
  const listed = useViewer((state) =>
    state.tab === undefined ? undefined : state.versions.get(state.tab),
  );
  const version = useViewer((state) => state.version);
  const { chooseVersion } = useViewerActions();
  const scrolling = useShell((state) => state.scrolling);
  const dateFormat = useShell((state) => state.dateFormat);
  if (listed === undefined) {
    return null;
  }
  return (
    <div
      className={
        showsCommit(version, listed)
          ? 'viewer-version version-hash'
          : 'viewer-version'
      }
    >
      <MenuButton
        scrolling={scrolling}
        title={strings.viewer.version}
        label={versionLabel(version, listed)}
        onChosen={onChosen}
        filter={strings.viewer.findVersion}
        items={versionMenu(listed, version, dateFormat, chooseVersion)}
      />
    </div>
  );
}
