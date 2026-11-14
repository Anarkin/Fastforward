import { type Side } from '../shared/protocol';
import { layouts, type Layout } from '../shared/settings';
import { useCommander, useCommanderActions } from './store';
import { BookmarkIcon } from '../../../lib/page/icons';
import { MenuButton } from '../../../lib/page/menu';
import type { ContextMenuItem } from '../../../lib/page/menuControls';
import { strings } from '../../../lib/shared/strings';
import { fileColorOf, type FileColors } from './fileColors';
import { nameOf } from './pathTitle';
import { pathParts } from '../shared/paths';
import { bookmarkMenu, bookmarkOf } from './bookmarks';

export function layoutMenu({
  layout,
  groupByColor,
  canGroupByColor,
  onLayout,
  onGroupByColor,
}: {
  readonly layout: Layout;
  readonly groupByColor: boolean;
  readonly canGroupByColor: boolean;
  readonly onLayout: (layout: Layout) => void;
  readonly onGroupByColor: () => void;
}): ContextMenuItem[] {
  return [
    ...layouts.map((each) => ({
      label: strings.commander.layouts[each],
      checked: each === layout,
      onClick: () => onLayout(each),
    })),
    { separator: true },
    {
      label: strings.commander.groupByColor,
      checked: groupByColor && canGroupByColor,
      disabled: !canGroupByColor,
      onClick: onGroupByColor,
    },
  ];
}

export function BookmarkButton({
  side,
  trigger,
  onChosen,
}: {
  side: Side;
  trigger: React.Ref<HTMLButtonElement>;
  onChosen: () => void;
}) {
  const bookmarks = useCommander((state) => state.view.bookmarks);
  const bookmark = useCommander((state) =>
    bookmarkOf(
      state.view.bookmarks,
      state.view.panes[side]?.folder,
      state.view.platform,
    ),
  );
  const { addBookmark, removeBookmark, goToBookmark } = useCommanderActions();
  return (
    <MenuButton
      title={strings.commander.bookmarks}
      icon={<BookmarkIcon filled={bookmark !== undefined} />}
      arrow
      trigger={trigger}
      onChosen={onChosen}
      items={bookmarkMenu({
        bookmarks,
        bookmark,
        onAdd: () => addBookmark(side),
        onRemove: removeBookmark,
        onGo: (folder) => goToBookmark(side, folder),
      })}
    />
  );
}

export function archivePart(
  archive: string,
  fileColors: FileColors,
): { readonly color?: string; readonly coloredPart: number } {
  const color = fileColorOf(
    {
      name: nameOf(archive),
      folder: false,
      link: false,
      hidden: false,
      size: undefined,
      modified: undefined,
    },
    fileColors,
  );
  return {
    ...(color !== undefined && { color }),
    coloredPart: pathParts(archive).length - 1,
  };
}
