import { useEffect, useId, useRef, useState } from 'react';
import { iconUrl, type IconSource } from '../shared/icons';
import { imageType, vectorType } from '../../../lib/shared/images';
import { ThumbnailImage } from './thumbnails';
import { type Entry } from '../shared/protocol';
import { formatSize } from './format';
import { cutClass } from './cellFit';
import { whenStayed } from './iconAsks';
import { type Row } from './listing';
import { HighlightWords } from '../../../lib/page/highlight';
import type { Filter } from '../../../lib/shared/filter';
import {
  CheckBoxIcon,
  FileIcon,
  FolderIcon,
  ToolIcon,
} from '../../../lib/page/icons';
import { strings } from '../../../lib/shared/strings';
import { tileThumbnailUrl } from './paneTiles';
import type { CommanderActions } from './state';

type IconTickets = Pick<CommanderActions, 'iconTicketOf' | 'iconCame'>;

function SystemIcon({
  source,
  generic,
  onDropIcon,
  onFailed,
  tickets,
}: {
  source: IconSource;
  generic: React.ReactNode;
  onDropIcon: (ticket: string) => void;
  onFailed: () => void;
  tickets: IconTickets | undefined;
}) {
  const id = useId();
  const url = iconUrl(source);
  const [ticket] = useState(() => tickets?.iconTicketOf(url) ?? id);
  const came = useRef(ticket !== id);
  const [shown, setShown] = useState(ticket !== id);
  const [asked, setAsked] = useState(ticket !== id);
  useEffect(() => {
    if (asked) {
      return undefined;
    }
    return whenStayed(() => setAsked(true));
  }, [asked]);
  useEffect(
    () => () => {
      if (asked && !came.current) {
        onDropIcon(ticket);
      }
    },
    [asked, ticket, onDropIcon],
  );
  if (!asked) {
    return generic;
  }
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
          tickets?.iconCame(url, ticket);
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
  tickets,
}: {
  row: Row;
  source: IconSource | undefined;
  onDropIcon: (ticket: string) => void;
  tickets?: IconTickets;
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
        tickets={tickets}
      />
    );
  }
  return generic;
}

export function ExtensionCell({
  row,
  filter,
  columns,
  onOpenRepository,
}: {
  row: Row;
  filter: Filter;
  columns: number;
  onOpenRepository: ((name: string) => void) | undefined;
}) {
  const open = row.repository ? onOpenRepository : undefined;
  return (
    <span
      className={`commander-extension${open === undefined ? cutClass(row.extension, columns) : ' cut'}`}
    >
      {open !== undefined ? (
        <button
          className="commander-mark"
          title={strings.commander.openRepository}
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            open(row.key);
          }}
        >
          <ToolIcon tool="git" />
        </button>
      ) : (
        <HighlightWords text={row.extension} filter={filter} />
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

export function NameCell({ row, filter }: { row: Row; filter: Filter }) {
  return (
    <span className="commander-name">
      <HighlightWords text={row.base} filter={filter} />
    </span>
  );
}

export function SizeCell({
  entry,
  columns,
  tile = false,
}: {
  entry: Entry | undefined;
  columns?: number;
  tile?: boolean;
}) {
  const size = formatSize(entry?.size);
  const className = `${tile ? 'commander-tile-size' : 'commander-size'}${entry?.counting === true ? ' counting' : ''}${columns === undefined ? '' : cutClass(size, columns)}`;
  const title =
    entry?.unreadFolders === undefined
      ? undefined
      : strings.commander.unreadUnder(entry.unreadFolders);
  const Cell = tile ? 'div' : 'span';
  return (
    <Cell className={className} title={title}>
      {size}
    </Cell>
  );
}

export function TileImage({
  row,
  source,
  box,
  onMade,
  onDropIcon,
  tickets,
}: {
  row: Row;
  source: IconSource | undefined;
  box: number;
  onMade: (made: Blob, pixelRatio: number) => void;
  onDropIcon: (ticket: string) => void;
  tickets?: IconTickets;
}) {
  const icon = (
    <span className="commander-icon">
      <RowIcon
        row={row}
        source={source}
        onDropIcon={onDropIcon}
        tickets={tickets}
      />
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
