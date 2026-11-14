import { useEffect, useId, useRef, useState } from 'react';
import { iconUrl, type IconSource } from '../shared/icons';
import { imageType, vectorType } from '../../../lib/shared/images';
import { ThumbnailImage } from './thumbnails';
import { type Entry } from '../shared/protocol';
import { formatSize } from './format';
import { type Row } from './listing';
import { HighlightWords } from '../../../lib/page/highlight';
import {
  CheckBoxIcon,
  FileIcon,
  FolderIcon,
  ToolIcon,
} from '../../../lib/page/icons';
import { strings } from '../../../lib/shared/strings';
import { tileThumbnailUrl } from './paneTiles';

function SystemIcon({
  source,
  generic,
  onDropIcon,
  onFailed,
}: {
  source: IconSource;
  generic: React.ReactNode;
  onDropIcon: (ticket: string) => void;
  onFailed: () => void;
}) {
  const ticket = useId();
  const came = useRef(false);
  const [shown, setShown] = useState(false);
  useEffect(
    () => () => {
      if (!came.current) {
        onDropIcon(ticket);
      }
    },
    [ticket, onDropIcon],
  );
  return (
    <>
      {!shown && generic}
      <img
        className={`system-icon${shown ? '' : ' loading'}`}
        src={iconUrl(source, ticket)}
        alt=""
        draggable={false}
        onLoad={() => {
          came.current = true;
          setShown(true);
        }}
        onError={() => {
          came.current = true;
          onFailed();
        }}
      />
    </>
  );
}

export function RowIcon({
  row,
  source,
  onDropIcon,
}: {
  row: Row;
  source: IconSource | undefined;
  onDropIcon: (ticket: string) => void;
}) {
  const [failed, setFailed] = useState<string>();
  const generic =
    row.entry === undefined || row.entry.folder ? <FolderIcon /> : <FileIcon />;
  const url = source === undefined ? undefined : iconUrl(source);
  if (source !== undefined && url !== failed) {
    return (
      <SystemIcon
        key={url}
        source={source}
        generic={generic}
        onDropIcon={onDropIcon}
        onFailed={() => setFailed(url)}
      />
    );
  }
  return generic;
}

export function ExtensionCell({
  row,
  words,
  onOpenRepository,
}: {
  row: Row;
  words: readonly string[];
  onOpenRepository: (name: string) => void;
}) {
  return (
    <span className="commander-extension">
      {row.repository ? (
        <button
          className="commander-mark"
          title={strings.commander.openRepository}
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            onOpenRepository(row.key);
          }}
        >
          <ToolIcon tool="git" />
        </button>
      ) : (
        <HighlightWords text={row.extension} words={words} />
      )}
    </span>
  );
}

export function MarkBox({ onToggle }: { onToggle: () => void }) {
  return (
    <span
      className="commander-check"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <CheckBoxIcon />
    </span>
  );
}

export function NameCell({
  row,
  words,
}: {
  row: Row;
  words: readonly string[];
}) {
  return (
    <span className="commander-name">
      <HighlightWords text={row.base} words={words} />
    </span>
  );
}

export function SizeCell({
  entry,
  tile = false,
}: {
  entry: Entry | undefined;
  tile?: boolean;
}) {
  const className = `${tile ? 'commander-tile-size' : 'commander-size'}${entry?.counting === true ? ' counting' : ''}`;
  const title =
    entry?.unreadFolders === undefined
      ? undefined
      : strings.commander.unreadUnder(entry.unreadFolders);
  const Cell = tile ? 'div' : 'span';
  return (
    <Cell className={className} title={title}>
      {formatSize(entry?.size)}
    </Cell>
  );
}

export function TileImage({
  row,
  source,
  box,
  onMade,
  onDropIcon,
}: {
  row: Row;
  source: IconSource | undefined;
  box: number;
  onMade: (made: Blob, pixelRatio: number) => void;
  onDropIcon: (ticket: string) => void;
}) {
  const icon = (
    <span className="commander-icon">
      <RowIcon row={row} source={source} onDropIcon={onDropIcon} />
    </span>
  );
  const type = imageType(row.key);
  if (source === undefined || row.entry === undefined || type === undefined) {
    return icon;
  }
  return (
    <ThumbnailImage
      url={tileThumbnailUrl(source, row.entry)}
      box={box}
      vector={type === vectorType}
      fallback={icon}
      onMade={onMade}
    />
  );
}
