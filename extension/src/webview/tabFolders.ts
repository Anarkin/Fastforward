export interface TabFolders {
  readonly open: ReadonlySet<string>;
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
