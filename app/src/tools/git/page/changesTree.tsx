import type { ChangeArea } from '../shared/protocol';
import { HighlightWords } from '../../../lib/page/highlight';
import { FileRow, FolderRow } from './tree';
import { areaKey, treeRowKey, type ChangesTreeRow } from './changesRows';

export function ChangesTreeItem({
  row,
  area,
  showsAll,
  onToggle,
  selected,
  onSelect,
  cursor,
  words = [],
}: {
  readonly row: ChangesTreeRow;
  area?: ChangeArea;
  showsAll: boolean;
  onToggle: (folder: string, changed: boolean) => void;
  selected: string | undefined;
  onSelect: (path: string | undefined) => void;
  cursor: string | undefined;
  words?: readonly string[];
}): React.ReactElement {
  const key = areaKey(area, treeRowKey(row));
  return row.kind === 'folder' ? (
    <FolderRow
      key={key}
      path={row.path}
      title={row.path}
      depth={row.depth}
      open={row.open}
      className={[
        ...(showsAll && row.changed ? [] : ['dimmed']),
        ...(cursor === key ? ['selected'] : []),
      ].join(' ')}
      onToggle={(folder) => onToggle(folder, row.changed)}
    >
      <span className="path">
        <HighlightWords text={row.name} words={words} />
      </span>
    </FolderRow>
  ) : (
    <FileRow
      key={key}
      path={row.path}
      name={row.name}
      depth={row.depth}
      change={row.change}
      selected={selected}
      marked={cursor === key}
      onSelect={onSelect}
      words={words}
    />
  );
}
