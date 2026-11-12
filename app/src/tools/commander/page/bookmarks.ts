import { strings } from '../../../shared/strings';
import type { ContextMenuItem } from '../../../ui/contextMenu';
import { folderKey } from '../shared/paths';

const keys = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function bookmarkKey(index: number): string | undefined {
  return keys.charAt(index) || undefined;
}

export function bookmarkOf(
  bookmarks: readonly string[],
  folder: string | undefined,
  platform: string | undefined,
): string | undefined {
  if (folder === undefined) {
    return undefined;
  }
  const key = folderKey(folder, platform);
  return bookmarks.find((bookmark) => folderKey(bookmark, platform) === key);
}

export function bookmarkMenu({
  bookmarks,
  bookmark,
  onAdd,
  onRemove,
  onGo,
}: {
  bookmarks: readonly string[];
  bookmark: string | undefined;
  onAdd: () => void;
  onRemove: (folder: string) => void;
  onGo: (folder: string) => void;
}): ContextMenuItem[] {
  return [
    bookmark === undefined
      ? { label: strings.commander.addBookmark, onClick: onAdd }
      : {
          label: strings.commander.removeBookmark,
          onClick: () => onRemove(bookmark),
        },
    ...(bookmarks.length > 0 ? [{ separator: true } as const] : []),
    ...bookmarks.map((folder, index) => ({
      label: folder,
      name: true,
      title: folder,
      accessKey: bookmarkKey(index),
      showAccessKey: true,
      checked: folder === bookmark,
      onClick: () => onGo(folder),
      onRemove: () => onRemove(folder),
      removeTitle: strings.commander.removeBookmarkOf(folder),
    })),
  ];
}
