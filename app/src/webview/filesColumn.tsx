import { useMemo } from 'react';
import {
  type ChangesView,
  type FileChange,
  type FilesMode,
} from '../shared/protocol';
import { changesTreeElements, changesTreeRows } from './changesTree';
import { Column } from './column';
import { FileTree } from './fileTree';
import { MenuButton } from './menu';
import { SkeletonRows, useSkeleton } from './skeleton';
import { FileRow, fileRowKey } from './tree';
import { VirtualRows } from './virtualRows';

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
  closedFolders: ReadonlySet<string>;
  onToggleClosedFolder: (folder: string) => void;
  files: readonly FileChange[];
  loading: boolean;
  treeLoading: boolean;
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
  const title = mode === 'changes' ? 'Changes' : 'Files';
  const modeSwitch = (
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
      <Column title={title} index={1} footer={modeSwitch}>
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
      <span className="path">All Changes</span>
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
          <FileRow
            key={fileRowKey(file.path)}
            path={file.path}
            name={file.path}
            change={file}
            inChanges
            selected={selected}
            onSelect={onSelect}
          />
        ));
  return (
    <Column title={title} index={1} actions={settings} footer={modeSwitch}>
      {skeleton && <SkeletonRows count={6} />}
      <VirtualRows
        rows={files.length > 0 ? [header, ...fileRows] : []}
        selectedKey={selected === undefined ? undefined : fileRowKey(selected)}
      />
    </Column>
  );
}
