import { labelTip, tip } from '../../../lib/page/tips';
import { useSyncExternalStore } from 'react';
import type { DiffLine } from './diff';
import type { SidewaysShown } from './sidewaysShown';
import type { FindRange } from './find';
import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';
import { Words } from '../../../lib/page/name';
import { PathName } from '../../../lib/page/pathName';
import { PreviewIcon } from '../../../lib/page/icons';
import { SkeletonRows } from '../../../lib/page/skeleton';
import { Twisty } from '../../../lib/page/tree';
import { renamedPath } from '../../../lib/page/fileStatus';
import {
  areaColumns,
  hiddenChanges,
  revealChange,
  type Sideways,
  type TextArea,
} from './overflow';
import type { TextWidths } from '../../../lib/page/textWidths';
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
  whole,
  collapsible,
  onClick,
  onView,
}: {
  path: string;
  root?: string | undefined;
  oldPath?: string;
  open: boolean;
  whole: boolean;
  collapsible: boolean;
  onClick: () => void;
  onView?: () => void;
}) {
  return (
    <div className="file-header" onClick={onClick}>
      {collapsible && <Twisty open={open} />}
      {oldPath === undefined ? (
        <span className="path">
          <PathName path={path} file root={root} />
        </span>
      ) : (
        <span
          className="path"
          {...tip(strings.common.fileFromTo(oldPath, path, root))}
        >
          <Words boxed={false}>{renamedPath(oldPath, path, root)}</Words>
        </span>
      )}
      <span className="file-header-end">
        {whole && <span className="unchanged">{strings.diff.unchanged}</span>}
        {onView && (
          <button
            className="nav-button file-header-button"
            {...labelTip(strings.diff.viewFile)}
            onClick={(event) => {
              event.stopPropagation();
              onView();
            }}
          >
            <PreviewIcon />
          </button>
        )}
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
  change: Change | undefined;
  split: boolean;
}) {
  if (!split) {
    return (
      <div className={`file-note ${change ?? ''}`}>
        <Words>{text}</Words>
      </div>
    );
  }
  return (
    <div className="split-line note-line">
      {(['removed', 'added'] as const).map((side) =>
        change === undefined || change === side ? (
          <div key={side} className={`file-note split-side ${change ?? ''}`}>
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

const edges = ['left', 'right'] as const;

export function HiddenChangeMarks({
  text,
  words,
  kind,
  shown,
  area,
  widths,
  place,
  onReveal,
}: {
  text: string;
  words: readonly FindRange[];
  kind: DiffLine['kind'];
  shown: SidewaysShown;
  area: (view: Sideways) => TextArea;
  widths: TextWidths;
  place: (edge: 'left' | 'right') => React.CSSProperties;
  onReveal: (scrolled: number) => void;
}) {
  const hiddenNow = () => {
    const view = shown.read();
    const columns =
      view && words.length > 0 && kind !== 'context'
        ? areaColumns(view, area(view), widths.char)
        : undefined;
    const hidden = columns && hiddenChanges(text, words, columns, widths);
    return edges
      .map((edge) => (hidden?.[edge] ? words.indexOf(hidden[edge]) : -1))
      .join(' ');
  };
  const hidden = useSyncExternalStore(shown.subscribe, hiddenNow, hiddenNow)
    .split(' ')
    .map((index) => words[Number(index)]);
  return edges.map((edge, side) => {
    const word = hidden[side];
    return (
      word && (
        <button
          key={edge}
          className={`hidden-change ${edge} ${kind}`}
          {...labelTip(strings.diff.showHiddenChange)}
          tabIndex={-1}
          style={place(edge)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const view = shown.read();
            if (view) {
              onReveal(revealChange(view, area(view), text, word, widths));
            }
          }}
        >
          {edge === 'left'
            ? strings.symbols.hiddenLeft
            : strings.symbols.hiddenRight}
        </button>
      )
    );
  });
}
