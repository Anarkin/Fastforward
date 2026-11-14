import type { RefKind } from '../shared/protocol';
import { useOpenMenu, refMenuTarget } from './menus';
import { FolderRow } from './tree';
import { strings } from '../../../lib/shared/strings';
import type { TreeNode } from './refIndex';
import { refKey, folderKey } from './locationResults';
import { RefLabel } from './locationsSearch';
import {
  folderOpen,
  type Rows,
  rowProps,
  activeClass,
  shownChildren,
  stuckRowTop,
  leafIndent,
} from './locationRows';

export function RefTree({
  kind,
  tree,
  rows,
  onSelect,
}: {
  kind: RefKind;
  tree: TreeNode;
  rows: Rows;
  onSelect: (commit: string) => void;
}) {
  if (tree.children.length === 0) {
    return <div className="locations-empty">{strings.search.none}</div>;
  }
  return (
    <TreeChildren
      kind={kind}
      node={tree}
      depth={0}
      prefix=""
      rows={rows}
      onSelect={onSelect}
    />
  );
}

function TreeChildren({
  kind,
  node,
  depth,
  prefix,
  rows,
  onSelect,
}: {
  kind: RefKind;
  node: TreeNode;
  depth: number;
  prefix: string;
  rows: Rows;
  onSelect: (commit: string) => void;
}) {
  const openMenu = useOpenMenu();
  const { children } = node;
  const withFolders = children.some((child) => child.children.length > 0);
  const { shown, more } = shownChildren(children);
  return (
    <>
      {shown.map((child) =>
        child.children.length > 0 ? (
          <TreeFolder
            key={child.name}
            kind={kind}
            node={child}
            depth={depth}
            path={`${prefix}${child.name}`}
            siblings={children.length}
            rows={rows}
            onSelect={onSelect}
          />
        ) : (
          <div
            key={child.name}
            {...(child.ref && rowProps(rows, refKey(child.ref), depth + 1))}
            className={`row tree-row leaf ${activeClass(rows, child.ref && refKey(child.ref))}`}
            style={{ paddingLeft: leafIndent(depth, withFolders) }}
            title={child.ref?.name}
            onClick={() => child.ref && onSelect(child.ref.commit)}
            onContextMenu={(event) =>
              child.ref && openMenu(event, refMenuTarget(child.ref))
            }
          >
            {child.ref ? (
              <RefLabel info={child.ref}>{child.name}</RefLabel>
            ) : (
              child.name
            )}
          </div>
        ),
      )}
      {more > 0 && (
        <div
          className="locations-empty"
          style={{ paddingLeft: leafIndent(depth, withFolders) }}
        >
          {strings.search.moreInFolder(more)}
        </div>
      )}
    </>
  );
}

function TreeFolder({
  kind,
  node,
  depth,
  path,
  siblings,
  rows,
  onSelect,
}: {
  kind: RefKind;
  node: TreeNode;
  depth: number;
  path: string;
  siblings: number;
  rows: Rows;
  onSelect: (commit: string) => void;
}) {
  const key = folderKey(kind, path);
  const open = folderOpen(rows.toggled, key, depth, siblings);
  return (
    <div className="tree-group">
      <FolderRow
        path={node.name}
        depth={depth}
        open={open}
        className={`sticky ${activeClass(rows, key)}`}
        style={{ top: stuckRowTop(depth), zIndex: 100 - depth }}
        onToggle={() => rows.onToggle(key)}
        itemProps={{
          ...rowProps(rows, key, depth + 1),
          'aria-expanded': open,
        }}
      >
        {node.name}
      </FolderRow>
      {open && (
        <TreeChildren
          kind={kind}
          node={node}
          depth={depth + 1}
          prefix={`${path}/`}
          rows={rows}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}
