import type { TabInfo } from '../shared/protocol';
import { strings } from '../shared/strings';
import type { ContextMenuItem } from './contextMenu';

export function repositoryMenuItems(
  recent: readonly TabInfo[],
  onOpen: (root: string) => void,
  onBrowse: () => void,
): readonly ContextMenuItem[] {
  return [
    ...recent.map((repository) => ({
      label: repository.name,
      title: repository.root,
      onClick: () => onOpen(repository.root),
    })),
    { separator: true },
    { label: strings.tabs.browse, onClick: onBrowse },
  ];
}
