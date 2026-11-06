import { useShellActions } from '../../../shell/page/store';
import type { Bookmark, BookmarkRef } from '../shared/protocol';
import { refOf } from '../shared/refNames';
import { useGitActions } from './store';

export type MenuTarget =
  | { readonly kind: 'ref'; readonly ref: Bookmark }
  | { readonly kind: 'commit'; readonly hash: string };

export const refMenuTarget = (ref: BookmarkRef): MenuTarget => ({
  kind: 'ref',
  ref: refOf(ref),
});

export const commitMenuTarget = (hash: string): MenuTarget => ({
  kind: 'commit',
  hash,
});

export const commitBookmarkTarget = (hash: string): MenuTarget => ({
  kind: 'ref',
  ref: { kind: 'commit', name: hash },
});

export type MenuEvent = Pick<
  React.MouseEvent,
  'stopPropagation' | 'preventDefault' | 'clientX' | 'clientY'
>;

export function useOpenMenu(): (event: MenuEvent, target: MenuTarget) => void {
  const { menuItems } = useGitActions();
  const { showMenu } = useShellActions();
  return (event, target) => {
    event.stopPropagation();
    event.preventDefault();
    showMenu({
      x: event.clientX,
      y: event.clientY,
      items: menuItems(target),
    });
  };
}

export function useContextMenu(target: MenuTarget) {
  const open = useOpenMenu();
  return {
    onContextMenu: (event: React.MouseEvent) => open(event, target),
  };
}
