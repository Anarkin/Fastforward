export interface Folders {
  readonly open: ReadonlySet<string>;
  readonly closed: ReadonlySet<string>;
}

export interface ViewFolders extends Folders {
  readonly view: string | undefined;
}

export const noFolders: ViewFolders = {
  view: undefined,
  open: new Set(),
  closed: new Set(),
};

export function shownFolders(state: ViewFolders, view: string): Folders {
  return state.view === view ? state : noFolders;
}

export function toggleFolder(
  state: ViewFolders,
  view: string,
  kind: keyof Folders,
  folder: string,
): ViewFolders {
  const folders = shownFolders(state, view);
  const next = new Set(folders[kind]);
  if (!next.delete(folder)) {
    next.add(folder);
  }
  return { ...folders, view, [kind]: next };
}

export function openFolders(
  state: ViewFolders,
  view: string,
  folders: readonly string[],
): ViewFolders {
  const current = shownFolders(state, view);
  if (
    state.view === view &&
    folders.every((folder) => current.open.has(folder))
  ) {
    return state;
  }
  return { ...current, view, open: new Set([...current.open, ...folders]) };
}
