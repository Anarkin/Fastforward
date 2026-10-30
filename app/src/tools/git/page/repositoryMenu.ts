import type { RepositoryInfo } from '../shared/protocol';
import { strings } from '../../../shared/strings';
import type { ContextMenuItem } from '../../../ui/contextMenu';

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
    { label: strings.tabs.browse, onClick: onBrowse },
    { label: strings.tabs.clone, onClick: onClone },
    { label: strings.tabs.init, onClick: onInit },
    ...(recent.length > 0 ? [{ separator: true } as const] : []),
    ...recent.map((repository) => {
      const label = strings.tabs.label(repository.name, repository.folder);
      return {
        label,
        title: repository.root,
        onClick: () => onOpen(repository.root),
        ...(onRemove && {
          onRemove: () => onRemove(repository.root),
          removeTitle: strings.tabs.removeRecent(label),
        }),
      };
    }),
  ];
}
