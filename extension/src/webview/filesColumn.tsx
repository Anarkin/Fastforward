import { useMemo } from 'react';
import { type ChangesView, type FileChange, type FilesMode } from '../protocol';
import { changesTreeElements, changesTreeRows } from './changesTree';
import { Column } from './column';
import { changeTitle, statusClass } from './fileStatus';
import { FileTree } from './fileTree';
import { LineCounts } from './lineCounts';
import { MenuButton } from './menu';
import { SkeletonRows, useSkeleton } from './skeleton';
import { VirtualRows } from './virtualRows';

// The selected commit's changes, or every file of the repository at it
export function Files({
  mode,
  onMode,
  changesView,
  onChangesView,
  closedFolders,
  onToggleClosedFolder,
  files,
  loading,
  treeLoading,
  tree,
  openFolders,
  onToggleFolder,
  selected,
  onSelect,
}: {
  mode: FilesMode;
  onMode: (mode: FilesMode) => void;
  changesView: ChangesView;
  onChangesView: (view: ChangesView) => void;
  // Of the Changes tree
  closedFolders: ReadonlySet<string>;
  onToggleClosedFolder: (folder: string) => void;
  files: readonly FileChange[];
  // The selected commit's files are on the way
  loading: boolean;
  // Every file of the repository at the selected commit is on the way
  treeLoading: boolean;
  // Undefined while it loads
  tree: readonly string[] | undefined;
  openFolders: ReadonlySet<string>;
  onToggleFolder: (folder: string) => void;
  selected: string | undefined;
  onSelect: (path: string | undefined) => void;
}) {
  const skeleton = useSkeleton(mode === 'files' ? treeLoading : loading);
  const treeRows = useMemo(
    () => changesTreeRows(files, closedFolders),
    [files, closedFolders],
  );
  const changes = useMemo(
    () => new Map(files.map((file) => [file.path, file])),
    [files],
  );
  const title = (
    <div className="switch" role="tablist">
      {(['changes', 'files'] as const).map((option) => (
        <button
          key={option}
          role="tab"
          aria-selected={mode === option}
          className={`switch-option ${mode === option ? 'active' : ''}`}
          onClick={() => onMode(option)}
        >
          {option === 'changes' ? 'Changes' : 'Files'}
        </button>
      ))}
    </div>
  );
  if (mode === 'files') {
    return (
      <Column title={title} index={1}>
        {skeleton && <SkeletonRows count={12} indent />}
        {tree && (
          <FileTree
            paths={tree}
            changes={changes}
            selected={selected}
            expanded={openFolders}
            onToggle={onToggleFolder}
            onSelect={onSelect}
          />
        )}
      </Column>
    );
  }
  // The Files tab has no settings, so it has no button
  const settings = (
    <MenuButton
      title="Changes settings"
      items={(['list', 'tree'] as const).map((view) => ({
        label: view === 'list' ? 'View as List' : 'View as Tree',
        checked: changesView === view,
        radio: true,
        onClick: () => onChangesView(view),
      }))}
    />
  );
  const header = (
    <div
      key="changes"
      className={`row group counted ${selected === undefined ? 'selected' : ''}`}
      onClick={() => onSelect(undefined)}
    >
      <span className="path">CHANGES ({files.length})</span>
    </div>
  );
  const fileRows =
    changesView === 'tree'
      ? changesTreeElements({
          rows: treeRows,
          onToggle: onToggleClosedFolder,
          selected,
          onSelect,
        })
      : files.map((file) => (
          <div
            key={`file:${file.path}`}
            className={`row file ${file.path === selected ? 'selected' : ''}`}
            title={changeTitle(file)}
            onClick={() =>
              onSelect(file.path === selected ? undefined : file.path)
            }
          >
            <span className={statusClass(file)}>{file.path}</span>
            <LineCounts
              deletions={file.deletions}
              insertions={file.insertions}
            />
          </div>
        ));
  return (
    <Column title={title} index={1} actions={settings}>
      {loading && skeleton && <SkeletonRows count={6} />}
      <VirtualRows
        rows={files.length > 0 ? [header, ...fileRows] : []}
        selectedKey={selected === undefined ? undefined : `file:${selected}`}
      />
    </Column>
  );
}
