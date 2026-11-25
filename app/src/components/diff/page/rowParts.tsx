import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';
import { Words } from '../../../lib/page/name';
import { CutPathName } from '../../../lib/page/pathName';
import { SkeletonRows } from '../../../lib/page/skeleton';
import { Twisty } from '../../../lib/page/tree';
import { renamedPath } from '../../../lib/page/fileStatus';
import type { Change } from './rows';

export function HunkDivider() {
  return (
    <div className="hunk-divider">
      <span className="hunk-dots">{strings.symbols.hunk}</span>
    </div>
  );
}

export function FileHeader({
  path,
  root,
  oldPath,
  open,
  notes,
  collapsible,
  onClick,
}: {
  path: string;
  root?: string | undefined;
  oldPath?: string;
  open: boolean;
  notes: readonly Sentence[];
  collapsible: boolean;
  onClick: () => void;
}) {
  return (
    <div className="file-header" onClick={onClick}>
      {collapsible && <Twisty open={open} />}
      {oldPath === undefined ? (
        <CutPathName
          className="path"
          path={path}
          file
          {...(root !== undefined && { root })}
        />
      ) : (
        <span className="path">
          <Words boxed={false}>{renamedPath(oldPath, path, root)}</Words>
        </span>
      )}
      <span className="file-header-end">
        {notes.map((note, at) => (
          <span key={at} className="file-header-note">
            <Words>{note}</Words>
          </span>
        ))}
      </span>
    </div>
  );
}

export function FileNote({
  text,
  change,
  split,
}: {
  text: Sentence;
  change: Change;
  split: boolean;
}) {
  if (!split) {
    return (
      <div className={`file-note side-note ${change}`}>
        <Words>{text}</Words>
      </div>
    );
  }
  return (
    <div className="split-line note-line">
      {(['removed', 'added'] as const).map((side) =>
        change === side ? (
          <div key={side} className={`file-note split-side ${change}`}>
            <Words>{text}</Words>
          </div>
        ) : (
          <div key={side} className="file-note split-side filler" />
        ),
      )}
    </div>
  );
}

const otherSideOffset = 3;

export function DiffSkeleton({
  split,
  rows,
}: {
  split: boolean;
  rows: number;
}) {
  if (!split) {
    return <SkeletonRows count={rows} className="diff-line" />;
  }
  return (
    <div className="split-line">
      {[0, otherSideOffset].map((offset) => (
        <div key={offset} className="split-side">
          <SkeletonRows count={rows} className="diff-line" offset={offset} />
        </div>
      ))}
    </div>
  );
}
