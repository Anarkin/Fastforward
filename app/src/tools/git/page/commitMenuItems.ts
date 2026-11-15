import { strings } from '../../../lib/shared/strings';
import type { ContextMenuItem } from '../../../lib/page/contextMenuItem';
import type { Bookmark, CheckoutTarget, RefInfo } from '../shared/protocol';
import { hasRef } from '../shared/refNames';
import { bookmarkOptions } from './bookmarks';
import { checkoutCommit, checkoutOptions, checkoutRef } from './checkout';
import type { MenuTarget } from './menus';

export function menuItemsOf(
  target: MenuTarget,
  refs: readonly RefInfo[],
  head: string | undefined,
  detached: string | undefined,
  bookmarks: readonly Bookmark[],
  checkout: (target: CheckoutTarget) => void,
  toggleBookmark: (bookmark: Bookmark) => void,
): ContextMenuItem[] {
  const marked = (bookmark: Bookmark) => hasRef(bookmarks, bookmark);
  if (target.kind === 'commit') {
    return [
      {
        label: strings.commits.checkout,
        submenu: checkoutOptions(target.hash, refs, head, detached).map(
          (option) => ({
            label: option.label,
            disabled: option.disabled,
            onClick: () => checkout(option.target),
          }),
        ),
      },
      { separator: true },
      {
        label: strings.commits.bookmark,
        submenu: bookmarkOptions(target.hash, refs).map((option) => ({
          label: option.label,
          checked: marked(option.bookmark),
          onClick: () => toggleBookmark(option.bookmark),
        })),
      },
    ];
  }
  const { ref } = target;
  const option =
    ref.kind === 'commit'
      ? checkoutCommit(ref.name, detached)
      : checkoutRef(ref, refs, head, detached);
  return [
    {
      label: strings.commits.checkout,
      disabled: option.disabled,
      onClick: () => checkout(option.target),
    },
    { separator: true },
    {
      label: marked(ref)
        ? strings.commits.removeBookmark
        : strings.commits.addBookmark,
      onClick: () => toggleBookmark(ref),
    },
  ];
}
