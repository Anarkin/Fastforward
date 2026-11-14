import type { DiffLine, NumberedLine } from './diff';
import type { FindRange } from './find';
import { strings, type Sentence } from '../../../shared/strings';
import { Words } from '../../../ui/name';
import { PreviewIcon } from '../../../ui/icons';
import { SkeletonRows } from '../../../ui/skeleton';
import { Twisty } from './tree';
import { renamedPath } from './fileStatus';
import {
  areaColumns,
  hiddenChanges,
  revealChange,
  type Sideways,
  type TextArea,
} from './overflow';
import type { TextWidths } from '../../../ui/textWidths';
import type { DiffRow, Change } from './diffRows';

export function HunkDivider() {
  return (
    <div className="hunk-divider">
      <span className="hunk-dots">{strings.symbols.hunk}</span>
    </div>
  );
}

export function FileHeader({
  path,
  oldPath,
  open,
  whole,
  collapsible,
  onClick,
  onView,
}: {
  path: string;
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
        <span className="path">{path}</span>
      ) : (
        <span className="path" title={strings.common.fromTo(oldPath, path)}>
          {renamedPath(oldPath, path)}
        </span>
      )}
      <span className="file-header-end">
        {whole && <span className="unchanged">{strings.diff.unchanged}</span>}
        {onView && (
          <button
            className="nav-button file-header-button"
            title={strings.diff.viewFile}
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

export function diffRowClass(kind: DiffRow['kind']): string {
  const extra =
    kind === 'split'
      ? 'split-row'
      : kind === 'image'
        ? 'preview-row'
        : kind === 'error'
          ? 'error-row'
          : '';
  return `virtual-row diff-row ${extra}`;
}

export function splitSideClass(
  cell: NumberedLine | undefined,
  change: 'added' | 'removed',
): string {
  if (cell === undefined) {
    return 'filler';
  }
  return cell.line.kind === change ? change : '';
}

export function HiddenChangeMarks({
  text,
  words,
  kind,
  view,
  area,
  widths,
  place,
  onReveal,
}: {
  text: string;
  words: readonly FindRange[];
  kind: DiffLine['kind'];
  view: Sideways;
  area: TextArea;
  widths: TextWidths;
  place: (edge: 'left' | 'right') => React.CSSProperties;
  onReveal: (scrolled: number) => void;
}) {
  const columns = areaColumns(view, area, widths.char);
  if (!columns || words.length === 0 || kind === 'context') {
    return null;
  }
  const hidden = hiddenChanges(text, words, columns, widths);
  return (['left', 'right'] as const).map((edge) => {
    const word = hidden[edge];
    return (
      word && (
        <button
          key={edge}
          className={`hidden-change ${edge} ${kind}`}
          title={strings.diff.showHiddenChange}
          tabIndex={-1}
          style={place(edge)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onReveal(revealChange(view, area, text, word, widths))}
        >
          {edge === 'left'
            ? strings.symbols.hiddenLeft
            : strings.symbols.hiddenRight}
        </button>
      )
    );
  });
}
