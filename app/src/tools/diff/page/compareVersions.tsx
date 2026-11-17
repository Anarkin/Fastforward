import { ForwardIcon } from '../../../lib/page/icons';
import { VersionButton } from '../../../components/versions/page/versionButton';
import { useShell } from '../../../shell/page/store';
import type { ComparedSide } from '../shared/protocol';
import { useDiff, useDiffActions } from './store';

function SideVersion({ side }: { readonly side: ComparedSide }) {
  const listed = useDiff((state) => state.versions[side]);
  const version = useDiff((state) =>
    side === 'old' ? state.compare?.oldVersion : state.compare?.newVersion,
  );
  const { chooseVersion } = useDiffActions();
  const scrolling = useShell((state) => state.scrolling);
  const dateFormat = useShell((state) => state.dateFormat);
  return (
    <div className={`compare-version ${side}`}>
      {listed && (
        <VersionButton
          listed={listed}
          version={version}
          choose={(rev) => chooseVersion(side, rev)}
          dateFormat={dateFormat}
          scrolling={scrolling}
        />
      )}
    </div>
  );
}

export function CompareVersions() {
  const listed = useDiff(
    (state) =>
      state.versions.old !== undefined || state.versions.new !== undefined,
  );
  const sideBySide = useDiff((state) => state.diffLayout === 'sideBySide');
  if (!listed) {
    return null;
  }
  return (
    <div
      className={
        sideBySide ? 'compare-versions side-by-side' : 'compare-versions'
      }
    >
      <SideVersion side="old" />
      {!sideBySide && (
        <span className="compare-arrow">
          <ForwardIcon />
        </span>
      )}
      <SideVersion side="new" />
    </div>
  );
}
