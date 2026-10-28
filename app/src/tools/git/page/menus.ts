import { createContext, useContext } from 'react';
import type { Bookmark, BookmarkRef } from '../shared/protocol';
import { refOf } from '../shared/refNames';

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

export const OpenContextMenu = createContext<
  (event: MenuEvent, target: MenuTarget) => void
>(() => {});

export function useContextMenu(target: MenuTarget) {
  const open = useContext(OpenContextMenu);
  return {
    onContextMenu: (event: React.MouseEvent) => open(event, target),
  };
}
