import { type Side } from '../shared/protocol';
import { useCommander, useCommanderActions } from './store';
import { BookmarkIcon } from '../../../lib/page/icons';
import { MenuButton } from '../../../lib/page/menu';
import { strings } from '../../../lib/shared/strings';
import { bookmarkMenu, bookmarkOf } from './bookmarks';

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
