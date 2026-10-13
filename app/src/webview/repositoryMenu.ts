import type { TabInfo } from '../shared/protocol';
import { strings } from '../shared/strings';
import type { ContextMenuItem } from './contextMenu';

export const repositoryMenuTrigger = '.tab-add';

export function repositoryMenuItems(
  recent: readonly TabInfo[],
  onOpen: (root: string) => void,
  onBrowse: () => void,
  onRemove?: (root: string) => void,
): readonly ContextMenuItem[] {
  return [
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
    ...(recent.length > 0 ? [{ separator: true } as const] : []),
    { label: strings.tabs.browse, onClick: onBrowse },
  ];
}
