import type { ContextMenuItem } from '../../../lib/page/contextMenuItem';
import { formatDate } from '../../../lib/page/dates';
import { shortHash } from '../../../lib/shared/hashes';
import { strings } from '../../../lib/shared/strings';
import type { ListedVersions } from '../shared/versions';

const indexRev = 'index';

function onDiskAs({
  versions,
  changed,
  onDisk,
}: ListedVersions): string | undefined {
  const [newest] = versions;
  return onDisk && !changed && newest !== undefined && !newest.gone
    ? newest.rev
    : undefined;
}

export function showsCommit(
  rev: string | undefined,
  listed: ListedVersions,
): boolean {
  const shown = rev ?? onDiskAs(listed);
  return shown !== undefined && shown !== indexRev;
}

export function versionLabel(
  rev: string | undefined,
  listed: ListedVersions,
): string {
  const shown = rev ?? onDiskAs(listed);
  if (shown === undefined) {
    return strings.commits.uncommitted;
  }
  return shown === indexRev ? strings.versions.staged : shortHash(shown);
}

export function versionMenu(
  listed: ListedVersions,
  shown: string | undefined,
  dateFormat: string,
  choose: (rev: string | undefined) => void,
): ContextMenuItem[] {
  const { versions, staged, changed, onDisk } = listed;
  const diskRev = onDiskAs(listed);
  const blank = [
    ' '.repeat(shortHash('0'.repeat(40)).length),
    ' '.repeat(formatDate(0, dateFormat).length),
  ];
  const local: ContextMenuItem[] = [
    ...(onDisk && changed
      ? [
          {
            label: strings.commits.uncommitted,
            details: blank,
            checked: shown === undefined,
            onClick: () => choose(undefined),
          },
        ]
      : []),
    ...(staged
      ? [
          {
            label: strings.versions.staged,
            details: blank,
            checked: shown === indexRev,
            onClick: () => choose(indexRev),
          },
        ]
      : []),
  ];
  const commits = versions.map(
    ({ rev, date, subject, gone }): ContextMenuItem => ({
      label: subject,
      details: [shortHash(rev), formatDate(date, dateFormat)],
      keywords: rev,
      checked: shown === rev || (rev === diskRev && shown === undefined),
      ...(gone
        ? { disabled: true, title: strings.versions.deletedHere }
        : { onClick: () => choose(rev === diskRev ? undefined : rev) }),
    }),
  );
  return local.length === 0
    ? commits
    : [...local, { separator: true }, ...commits];
}
