import { type Side } from '../shared/sides';
import { useCommander, useCommanderActions } from './store';
import { useShell } from '../../../shell/page/store';
import { BookmarkIcon } from '../../../lib/page/icons';
import { MenuButton } from '../../../lib/page/menu';
import { strings } from '../../../lib/shared/strings';
import { bookmarkMenu, bookmarkOf } from './bookmarks';
import { driveMenu, driveOf } from './driveMenu';

function BookmarkButton({
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
  const scrolling = useShell((state) => state.scrolling);
  return (
    <MenuButton
      scrolling={scrolling}
      title={strings.commander.bookmarks}
      tipped={false}
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

export function PaneMenus({
  side,
  driveTrigger,
  bookmarkTrigger,
  onChosen,
}: {
  side: Side;
  driveTrigger: React.Ref<HTMLButtonElement>;
  bookmarkTrigger: React.Ref<HTMLButtonElement>;
  onChosen: () => void;
}) {
  const scrolling = useShell((state) => state.scrolling);
  const drives = useCommander((state) => state.drives);
  const current = useCommander((state) => {
    const pane = state.view.panes[side];
    return pane && driveOf(pane.folder, state.drives);
  });
  const actions = useCommanderActions();
  const onDrive = (drive: string) => actions.drive(side, drive);
  return (
    <div className="commander-path-menus">
      {drives.length > 0 && (
        <div className="drive-menu" onClickCapture={actions.listDrives}>
          <MenuButton
            scrolling={scrolling}
            title={strings.commander.chooseDrive}
            tipped={false}
            trigger={driveTrigger}
            onChosen={onChosen}
            items={driveMenu(drives, current, onDrive)}
          />
        </div>
      )}
      <BookmarkButton
        side={side}
        trigger={bookmarkTrigger}
        onChosen={onChosen}
      />
    </div>
  );
}
