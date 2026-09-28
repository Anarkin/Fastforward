// The folders a tab has open in the Files view and closed in the Changes tree,
// kept per tab, so another repository doesn't open or close the same paths

export interface TabFolders {
  // Open folders of the Files view, which start closed
  readonly open: ReadonlySet<string>;
  // Closed folders of the Changes tree, which start open
  readonly closed: ReadonlySet<string>;
}

export type FoldersByTab = ReadonlyMap<string, TabFolders>;

const noFolders: TabFolders = { open: new Set(), closed: new Set() };

export function foldersOfTab(
  all: FoldersByTab,
  tab: string | undefined,
): TabFolders {
  return (tab !== undefined && all.get(tab)) || noFolders;
}

// Opens a folder that is closed, or closes one that is open
export function toggleFolder(
  all: FoldersByTab,
  tab: string | undefined,
  kind: keyof TabFolders,
  folder: string,
): FoldersByTab {
  if (tab === undefined) {
    return all;
  }
  const folders = foldersOfTab(all, tab);
  const next = new Set(folders[kind]);
  if (!next.delete(folder)) {
    next.add(folder);
  }
  return new Map(all).set(tab, { ...folders, [kind]: next });
}

// Opens these folders in the Files view, like the ones a selected file is in;
// the same map when they are open already, so nothing re-renders
export function openFolders(
  all: FoldersByTab,
  tab: string | undefined,
  folders: readonly string[],
): FoldersByTab {
  const current = foldersOfTab(all, tab);
  if (
    tab === undefined ||
    folders.every((folder) => current.open.has(folder))
  ) {
    return all;
  }
  return new Map(all).set(tab, {
    ...current,
    open: new Set([...current.open, ...folders]),
  });
}
