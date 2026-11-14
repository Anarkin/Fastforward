import type { ReactNode } from 'react';
import { WholeImage } from '../../../lib/page/images';
import { Words } from '../../../lib/page/name';
import type { TextWidths } from '../../../lib/page/textWidths';
import type { ColumnsIn } from '../../../lib/page/wordWrap';
import { strings } from '../../../lib/shared/strings';
import { wholeChangeClass } from './codeMarks';
import type { DiffFile, DiffLine } from './diff';
import {
  DiffSkeleton,
  FileNote,
  HunkDivider,
  splitSideClass,
} from './diffRowParts';
import {
  largeDiffText,
  sideChange,
  type DiffRow,
  type FileHeaderRow,
  type WholeFile,
} from './diffRows';
import { lineKey } from './find';
import { ImageDiff, imagePanes } from './imagePreview';
import { wholeImageUrl, type ImageOrigin } from './images';
import {
  inlineArea,
  markerInset,
  markerWidth,
  numberWidth,
  sideArea,
  type Sideways,
  type TextArea,
} from './overflow';
import type { WrapColumns } from './rowMeasures';
import { sideSnaps } from './textLayout';
import type { WordRanges } from './wordDiff';
import { WrapMarks } from './wrapMarks';

export interface DiffRowParts {
  readonly error: ReactNode;
  readonly files: readonly DiffFile[];
  readonly whole: WholeFile | undefined;
  readonly origin: ImageOrigin | undefined;
  readonly split: boolean;
  readonly words: WordRanges;
  readonly keys: readonly (readonly string[])[];
  readonly wrapping: WrapColumns | undefined;
  readonly lineHeight: number;
  readonly columnsIn: ColumnsIn | undefined;
  readonly widths: TextWidths;
  readonly header: (row: FileHeaderRow) => ReactNode;
  readonly toggle: (path: string, open: boolean) => void;
  readonly code: (
    key: string | undefined,
    text: string,
    kind: DiffLine['kind'] | undefined,
    wrapsAt: number | undefined,
  ) => ReactNode;
  readonly hiddenMarks: (
    key: string | undefined,
    line: DiffLine,
    area: (shown: Sideways) => TextArea,
    place: (edge: 'left' | 'right') => React.CSSProperties,
  ) => ReactNode;
}

export function DiffRowShown({
  row,
  index,
  parts: {
    error,
    files,
    whole,
    origin,
    split,
    words,
    keys,
    wrapping,
    lineHeight,
    columnsIn,
    widths,
    header,
    toggle,
    code,
    hiddenMarks,
  },
}: {
  readonly row: DiffRow;
  readonly index: number;
  readonly parts: DiffRowParts;
}): ReactNode {
  switch (row.kind) {
    case 'error':
      return error;
    case 'file':
      return header(row);
    case 'large':
      return (
        <div className="large-diff">
          {largeDiffText(row.lines)}
          <button onClick={() => toggle(row.path, false)}>
            {strings.diff.show}
          </button>
        </div>
      );
    case 'binary':
      return whole ? (
        <div className="file-note">{strings.diff.binaryOrLarge}</div>
      ) : (
        <FileNote
          text={strings.diff.binary}
          change={row.change ?? sideChange(files[row.file])}
          split={split}
        />
      );
    case 'empty':
      return (
        <FileNote
          text={strings.diff.emptyFile}
          change={row.change ?? sideChange(files[row.file])}
          split={split}
        />
      );
    case 'sameContent':
      return (
        <FileNote
          text={
            files[row.file].copied
              ? strings.diff.copiedWithoutChanges
              : strings.diff.renamedWithoutChanges
          }
          change={undefined}
          split={split}
        />
      );
    case 'link': {
      const text = strings.diff.symbolicLink(
        (whole ? whole.content : files[row.file].link?.[row.side]) ?? '',
      );
      return whole ? (
        <div className="file-note">
          <Words>{text}</Words>
        </div>
      ) : (
        <FileNote
          text={text}
          change={row.side === 'old' ? 'removed' : 'added'}
          split={split}
        />
      );
    }
    case 'mode': {
      const modes = files[row.file].modeChange;
      return (
        modes && (
          <FileNote
            text={strings.diff.modeChanged(modes.old, modes.new)}
            change={undefined}
            split={split}
          />
        )
      );
    }
    case 'whitespace':
      return (
        <FileNote
          text={strings.diff.onlyWhitespace}
          change={undefined}
          split={split}
        />
      );
    case 'noNewline':
      return (
        <FileNote
          text={strings.diff.noNewlineAtEnd}
          change={
            files[row.file].noNewlineAtEnd === 'old' ? 'removed' : 'added'
          }
          split={split}
        />
      );
    case 'image': {
      if (!origin) {
        return null;
      }
      if (whole) {
        const url = wholeImageUrl(origin, whole);
        return url && <WholeImage url={url} />;
      }
      return <ImageDiff panes={imagePanes(origin, files[row.file], split)} />;
    }
    case 'skeleton':
      return (
        <div className="diff-skeleton">
          <div className="file-header">
            <span className="bar" style={{ width: '40%' }} />
          </div>
          <DiffSkeleton split={split} rows={9} />
        </div>
      );
    case 'skeletonLines':
      return <DiffSkeleton split={split} rows={4} />;
    case 'hunk':
      return <HunkDivider />;
    case 'line':
      return (
        <div
          className={`diff-line text-line ${row.line.kind} ${wholeChangeClass(words, keys[index].at(0))}`}
        >
          <span className="number">{row.line.oldNumber}</span>
          <span className="number">{row.line.newNumber}</span>
          {code(
            keys[index].at(0),
            row.line.text,
            row.line.kind,
            wrapping?.left,
          )}
          <WrapMarks
            text={row.line.text}
            columns={wrapping?.left}
            numbers={2}
            lineHeight={lineHeight}
            columnsIn={columnsIn}
            widths={widths}
          />
          {hiddenMarks(
            keys[index].at(0),
            row.line,
            (shown) => inlineArea(shown, 2),
            (edge) =>
              edge === 'left'
                ? { left: `calc(var(--visible-left) + ${markerInset}px)` }
                : {
                    left: `calc(var(--visible-right) - ${markerInset + markerWidth}px)`,
                  },
          )}
        </div>
      );
    case 'split':
      return (
        <div className="split-line">
          {[row.left, row.right].map((cell, side) => (
            <div
              key={side}
              className={`diff-line text-line split-side ${splitSideClass(cell, side === 0 ? 'removed' : 'added')} ${cell ? wholeChangeClass(words, lineKey(row.file, cell.index)) : ''}`}
              style={sideSnaps[side]}
            >
              <span className="number">
                {side === 0 ? cell?.line.oldNumber : cell?.line.newNumber}
              </span>
              <span className="split-code">
                {cell &&
                  code(
                    lineKey(row.file, cell.index),
                    cell.line.text,
                    cell.line.kind,
                    side === 0 ? wrapping?.left : wrapping?.right,
                  )}
              </span>
              {cell && (
                <WrapMarks
                  text={cell.line.text}
                  columns={side === 0 ? wrapping?.left : wrapping?.right}
                  numbers={1}
                  lineHeight={lineHeight}
                  columnsIn={columnsIn}
                  widths={widths}
                />
              )}
              {cell &&
                hiddenMarks(
                  lineKey(row.file, cell.index),
                  cell.line,
                  (shown) => sideArea(shown, side === 1),
                  (edge) =>
                    edge === 'left'
                      ? { left: numberWidth + markerInset }
                      : {
                          right:
                            side === 1
                              ? `calc(var(--minimap-width) + ${markerInset}px)`
                              : markerInset,
                        },
                )}
            </div>
          ))}
        </div>
      );
    case 'wholeLine':
      return (
        <div className="diff-line text-line">
          <span className="number">{row.number}</span>
          {code(keys[index].at(0), row.text, undefined, wrapping?.left)}
          <WrapMarks
            text={row.text}
            columns={wrapping?.left}
            numbers={1}
            lineHeight={lineHeight}
            columnsIn={columnsIn}
            widths={widths}
          />
        </div>
      );
    default:
      return row satisfies never;
  }
}
