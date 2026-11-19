import { namedFolder } from '../../../lib/shared/sentences';
import type { RepositoryInfo } from '../shared/protocol';
import { strings } from '../../../lib/shared/strings';
import type { ContextMenuItem } from '../../../lib/page/contextMenuItem';

export interface RepositoryMenuActions {
  readonly onOpen: (root: string) => void;
  readonly onBrowse: () => void;
  readonly onClone: () => void;
  readonly onInit: () => void;
  readonly onRemove?: (root: string) => void;
}

export function repositoryMenuItems(
  recent: readonly RepositoryInfo[],
  { onOpen, onBrowse, onClone, onInit, onRemove }: RepositoryMenuActions,
): readonly ContextMenuItem[] {
  return [
    { label: strings.tabs.open, onClick: onBrowse },
    { label: strings.tabs.clone, onClick: onClone },
    { label: strings.tabs.init, onClick: onInit },
    ...(recent.length > 0 ? [{ separator: true } as const] : []),
    ...recent.map(({ root }) => ({
      label: root,
      path: true,
      title: [namedFolder(root)],
      onClick: () => onOpen(root),
      ...(onRemove && {
        onRemove: () => onRemove(root),
        removeTitle: strings.tabs.removeRecent(root),
      }),
    })),
  ];
}
