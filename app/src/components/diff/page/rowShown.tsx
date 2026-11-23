import type { ReactNode } from 'react';
import { WholeImage } from '../../../lib/page/images';
import { Words } from '../../../lib/page/name';
import { strings } from '../../../lib/shared/strings';
import type { DiffFile } from './diff';
import { DiffSkeleton, FileNote, HunkDivider } from './rowParts';
import {
  largeDiffText,
  type DiffRow,
  type FileHeaderRow,
  type WholeFile,
} from './rows';
import { imagePanes } from './imagePanes';
import { ImageDiff } from './imagePreview';
import { wholeImageUrl, type ImageOrigin } from './images';

export interface DiffRowParts {
  readonly error: ReactNode;
  readonly files: readonly DiffFile[];
  readonly whole: WholeFile | undefined;
  readonly origin: ImageOrigin | undefined;
  readonly split: boolean;
  readonly header: (row: FileHeaderRow) => ReactNode;
  readonly toggle: (path: string, open: boolean) => void;
}

export function DiffRowShown({
  row,
  top,
  parts: { error, files, whole, origin, split, header, toggle },
}: {
  readonly row: DiffRow;
  readonly top: number;
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
      return (
        <FileNote
          text={strings.diff.binary}
          change={row.change}
          split={split}
        />
      );
    case 'empty':
      return (
        <FileNote
          text={strings.diff.emptyFile}
          change={row.change}
          split={split}
        />
      );
    case 'link': {
      const text = strings.diff.symbolicLink(
        (whole ? whole.content : files[row.file].link?.[row.side]) ?? '',
      );
      return whole ? (
        <div className="file-note whole-note">
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
      return (
        <ImageDiff panes={imagePanes(origin, files[row.file])} top={top} />
      );
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
    case 'split':
    case 'wholeLine':
      return null;
    default:
      return row satisfies never;
  }
}
