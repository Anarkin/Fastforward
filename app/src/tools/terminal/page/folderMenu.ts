import { strings } from '../../../shared/strings';
import type { ContextMenuItem } from '../../../ui/contextMenu';

export interface FolderMenuActions {
  readonly onNew: () => void;
  readonly onBrowse: () => void;
  readonly onOpen: (folder: string) => void;
  readonly onForget: (folder: string) => void;
}

export function folderMenuItems(
  folders: readonly string[],
  { onNew, onBrowse, onOpen, onForget }: FolderMenuActions,
): readonly ContextMenuItem[] {
  return [
    { label: strings.terminal.newTab, onClick: onNew },
    { label: strings.tabs.browse, onClick: onBrowse },
    ...(folders.length > 0 ? [{ separator: true } as const] : []),
    ...folders.map((folder) => ({
      label: folder,
      title: folder,
      onClick: () => onOpen(folder),
      onRemove: () => onForget(folder),
      removeTitle: strings.tabs.removeRecent(folder),
    })),
  ];
}
