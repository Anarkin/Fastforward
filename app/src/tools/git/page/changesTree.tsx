import { namedFolder } from '../../../lib/shared/sentences';
import type { ChangeArea } from '../shared/protocol';
import { noFilter, type Filter } from '../../../lib/shared/filter';
import { FileRow, FolderRow } from '../../../lib/page/tree';
import { CutPathName } from '../../../lib/page/pathName';
import { wholePath } from '../../../lib/page/pathLooks';
import { areaKey, treeRowKey, type ChangesTreeRow } from './changesRows';

function folderOf(row: ChangesTreeRow, root: string | undefined) {
  const folder = row.path.slice(
    0,
    Math.max(0, row.path.length - row.name.length - 1),
  );
  return folder === '' ? root : wholePath(root, folder);
}

export function ChangesTreeItem({
  row,
  area,
  root,
  showsAll,
  onToggle,
  selected,
  onSelect,
  cursor,
  filter = noFilter,
}: {
  readonly row: ChangesTreeRow;
  area?: ChangeArea;
  root?: string | undefined;
  showsAll: boolean;
  onToggle: (folder: string, changed: boolean) => void;
  selected: string | undefined;
  onSelect: (path: string | undefined) => void;
  cursor: string | undefined;
  filter?: Filter;
}): React.ReactElement {
  const key = areaKey(area, treeRowKey(row));
  const inFolder = folderOf(row, root);
  return row.kind === 'folder' ? (
    <FolderRow
      key={key}
      path={row.path}
      title={[namedFolder(row.path, root)]}
      depth={row.depth}
      open={row.open}
      className={[
        ...(showsAll && !row.changed ? ['dimmed'] : []),
        ...(cursor === key ? ['selected'] : []),
      ].join(' ')}
      onToggle={(folder) => onToggle(folder, row.changed)}
    >
      <CutPathName
        className="path"
        path={row.name}
        {...(inFolder !== undefined && { root: inFolder })}
        filter={filter}
      />
    </FolderRow>
  ) : (
    <FileRow
      key={key}
      path={row.path}
      name={row.name}
      root={inFolder}
      depth={row.depth}
      change={row.change}
      selected={selected}
      marked={cursor === key}
      onSelect={onSelect}
      filter={filter}
    />
  );
}
