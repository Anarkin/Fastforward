import { MenuButton } from '../../../lib/page/menu';
import type { ScrollSettings } from '../../../lib/page/scrollSettings';
import { strings } from '../../../lib/shared/strings';
import type { ListedVersions } from '../shared/versions';
import { showsCommit, versionLabel, versionMenu } from './versionMenu';
import './style.css';

export function VersionButton({
  listed,
  version,
  choose,
  dateFormat,
  scrolling,
  trigger,
  keys,
  onChosen,
}: {
  readonly listed: ListedVersions;
  readonly version: string | undefined;
  readonly choose: (rev: string | undefined) => void;
  readonly dateFormat: string;
  readonly scrolling: ScrollSettings;
  readonly trigger?: React.Ref<HTMLButtonElement>;
  readonly keys?: string | undefined;
  readonly onChosen?: () => void;
}) {
  return (
    <div
      className={
        showsCommit(version, listed)
          ? 'version-button version-hash'
          : 'version-button'
      }
    >
      <MenuButton
        scrolling={scrolling}
        title={strings.versions.version}
        keys={keys}
        trigger={trigger}
        label={versionLabel(version, listed)}
        onChosen={onChosen}
        filter={strings.versions.find}
        items={versionMenu(listed, version, dateFormat, choose)}
      />
    </div>
  );
}
