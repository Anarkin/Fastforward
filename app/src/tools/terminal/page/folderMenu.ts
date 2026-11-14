import { strings } from '../../../lib/shared/strings';
import type { ContextMenuItem } from '../../../lib/page/contextMenu';

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
    { label: strings.tabs.open, onClick: onBrowse },
    ...(folders.length > 0 ? [{ separator: true } as const] : []),
    ...folders.map((folder) => ({
      label: folder,
      name: true,
      title: folder,
      onClick: () => onOpen(folder),
      onRemove: () => onForget(folder),
      removeTitle: strings.tabs.removeRecent(folder),
    })),
  ];
}
