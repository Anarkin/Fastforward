import type { RepositoryInfo } from '../shared/protocol';
import { strings } from '../../../shared/strings';
import type { ContextMenuItem } from '../../../ui/contextMenu';

export function repositoryMenuItems(
  recent: readonly RepositoryInfo[],
  onOpen: (root: string) => void,
  onBrowse: () => void,
  onRemove?: (root: string) => void,
): readonly ContextMenuItem[] {
  return [
    { label: strings.tabs.browse, onClick: onBrowse },
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
