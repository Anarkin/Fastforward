import type { FileHistoryListed } from '../../../components/versions/shared/versions';
import type { Compared, FileVersion } from '../../../shell/main/savedTabs';
import type { ComparedSide } from '../shared/protocol';

export interface SideListed extends FileHistoryListed {
  readonly file: string;
  readonly onDisk: boolean;
}

interface Picked {
  readonly path: string;
  readonly version?: FileVersion;
}

const indexRev = 'index';

function commitAt(listed: SideListed, at: number): Picked | undefined {
  const found = listed.versions.slice(at).find((each) => !each.gone);
  return (
    found && {
      path: found.path,
      version: { rev: found.rev, file: listed.file },
    }
  );
}

function picked(
  listed: SideListed,
  rev: string | undefined,
): Picked | undefined {
  if (rev === undefined) {
    return listed.onDisk ? { path: listed.file } : undefined;
  }
  if (rev === indexRev) {
    return listed.staged
      ? { path: listed.file, version: { rev, file: listed.file } }
      : undefined;
  }
  const at = listed.versions.findIndex(
    (each) => each.rev === rev && !each.gone,
  );
  return at === -1 ? undefined : commitAt(listed, at);
}

function before(
  listed: SideListed,
  rev: string | undefined,
): Picked | undefined {
  if (rev === undefined && listed.staged) {
    return picked(listed, indexRev);
  }
  if (rev === undefined || rev === indexRev) {
    return commitAt(listed, rev === undefined && !listed.changed ? 1 : 0);
  }
  const at = listed.versions.findIndex((each) => each.rev === rev);
  return commitAt(listed, at + 1);
}

function anchorOf(compared: Compared, side: ComparedSide): string {
  return side === 'old'
    ? (compared.oldVersion?.file ?? compared.old)
    : (compared.newVersion?.file ?? compared.new);
}

function withSide(
  compared: Compared,
  side: ComparedSide,
  { path, version }: Picked,
): Compared {
  const { [side === 'old' ? 'oldVersion' : 'newVersion']: _was, ...kept } =
    compared;
  return {
    ...kept,
    [side]: path,
    ...(version !== undefined && {
      [side === 'old' ? 'oldVersion' : 'newVersion']: version,
    }),
  };
}

export function withChosen(
  compared: Compared,
  side: ComparedSide,
  rev: string | undefined,
  listed: Partial<Record<ComparedSide, SideListed>>,
): Compared | undefined {
  const on = listed[side];
  const chosen = on && picked(on, rev);
  if (on === undefined || chosen === undefined) {
    return undefined;
  }
  const changed = withSide(compared, side, chosen);
  const older =
    side === 'new' && anchorOf(compared, 'old') === anchorOf(compared, 'new')
      ? before(on, rev)
      : undefined;
  return older === undefined ? changed : withSide(changed, 'old', older);
}
