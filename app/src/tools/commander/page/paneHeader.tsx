import { type Side } from '../shared/sides';
import { type Layout } from '../shared/settings';
import { useCommander, useCommanderActions } from './store';
import {
  BackIcon,
  BookmarkIcon,
  FlatViewIcon,
  ForwardIcon,
} from '../../../lib/page/icons';
import { MenuButton } from '../../../lib/page/menu';
import { SearchButton } from '../../../lib/page/search';
import { strings } from '../../../lib/shared/strings';
import { bookmarkMenu, bookmarkOf } from './bookmarks';
import { driveMenu, driveOf } from './driveMenu';
import { layoutMenu } from './paneLayoutMenu';

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

function FlatButton({ side }: { side: Side }) {
  const flat = useCommander(
    (state) => state.view.panes[side]?.flat !== undefined,
  );
  const reading = useCommander(
    (state) => state.view.panes[side]?.flat?.progress.reading === true,
  );
  const { flat: onFlat } = useCommanderActions();
  return (
    <button
      className={`nav-button toggle${flat ? ' active' : ''}${reading ? ' running' : ''}`}
      title={strings.commander.flatView}
      aria-pressed={flat}
      onClick={() => onFlat(side)}
    >
      <span className="spin-icon">
        <FlatViewIcon />
      </span>
    </button>
  );
}

export function PaneTitle({
  side,
  driveTrigger,
  bookmarkTrigger,
  onChosen,
  onFilter,
}: {
  side: Side;
  driveTrigger: React.Ref<HTMLButtonElement>;
  bookmarkTrigger: React.Ref<HTMLButtonElement>;
  onChosen: () => void;
  onFilter: () => void;
}) {
  const back = useCommander((state) => state.view.panes[side]?.back);
  const forward = useCommander((state) => state.view.panes[side]?.forward);
  const groupByColor = useCommander(
    (state) => state.view.panes[side]?.sort.groupByColor,
  );
  const layout = useCommander((state) => state.view.layouts[side]);
  const canGroupByColor = useCommander(
    (state) => state.view.fileColors.colors.length > 0,
  );
  const drives = useCommander((state) => state.drives);
  const current = useCommander((state) => {
    const pane = state.view.panes[side];
    return pane && driveOf(pane.folder, state.drives);
  });
  const actions = useCommanderActions();
  const onLayout = (chosen: Layout) => actions.chooseLayout(side, chosen);
  const onGroupByColor = () => actions.groupByColor(side);
  const onDrive = (drive: string) => actions.drive(side, drive);
  const onDrivesOpening = actions.listDrives;
  const onStep = (step: -1 | 1) => actions.step(side, step);
  return (
    <header className="column-title">
      <div className="column-start nav-buttons">
        <button
          className="nav-button"
          title={strings.commander.back}
          disabled={back !== true}
          onClick={() => onStep(-1)}
        >
          <BackIcon />
        </button>
        <button
          className="nav-button"
          title={strings.commander.forward}
          disabled={forward !== true}
          onClick={() => onStep(1)}
        >
          <ForwardIcon />
        </button>
        {drives.length > 0 && (
          <div className="drive-menu" onClickCapture={onDrivesOpening}>
            <MenuButton
              title={strings.commander.chooseDrive}
              label={(current ?? '').replace(/\\$/, '')}
              named
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
      <div className="column-actions">
        <div className="commander-layout">
          <MenuButton
            title={strings.commander.layout}
            label={strings.commander.layouts[layout]}
            onChosen={onChosen}
            items={layoutMenu({
              layout,
              groupByColor: groupByColor ?? false,
              canGroupByColor,
              onLayout,
              onGroupByColor,
            })}
          />
        </div>
        <FlatButton side={side} />
        <SearchButton
          title={strings.commander.filterFolder}
          onClick={onFilter}
        />
      </div>
    </header>
  );
}
