import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { clicked } from '../../../shell/shared/keymap';
import './style.css';
import { commanderKeymap, viewerKeymap } from '../shared/keymap';
import {
  sides,
  type CommanderToHost,
  type CommanderToWebview,
} from '../shared/protocol';
import { Pane } from './pane';
import { Viewer } from './viewer';
import { columnFocusAttribute } from '../../../ui/columnFocus';
import { followDrag } from '../../../ui/followDrag';
import { useBinding } from '../../../ui/shortcuts';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { deleteQuestion } from './deleting';
import { strings } from '../../../shared/strings';
import { useShellActions } from '../../../shell/page/store';
import {
  CommanderStore,
  createCommanderStore,
  useCommander,
  useCommanderActions,
} from './store';

const minimumShare = 0.15;

export function shareOf(left: number, width: number): number {
  return width <= 0
    ? 0.5
    : Math.min(1 - minimumShare, Math.max(minimumShare, left / width));
}

export function sideToFocus(
  column: Element | undefined,
  focused: Element | null,
): HTMLElement | undefined {
  return column === undefined || column.contains(focused)
    ? undefined
    : (column.querySelector<HTMLElement>(`[${columnFocusAttribute}]`) ??
        undefined);
}

function CommanderPopups() {
  const tab = useCommander((state) => state.view.tab);
  const canElevate = useCommander((state) => state.view.canElevate);
  const deleting = useCommander((state) => state.deleting);
  const noAccess = useCommander((state) => state.noAccess);
  const { confirmDelete, cancelDelete, closeNoAccess, elevate } =
    useCommanderActions();
  return (
    <>
      {deleting !== undefined && (
        <ConfirmPopup
          {...deleteQuestion(
            deleting.names,
            deleting.permanently,
            document.documentElement.dataset.platform,
          )}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
      {noAccess !== undefined && (
        <ConfirmPopup
          title={strings.commander.noAccessTitle}
          message={strings.commander.noAccess(noAccess.folder)}
          confirm={strings.confirm.ok}
          cancel={null}
          onConfirm={closeNoAccess}
          onCancel={closeNoAccess}
          extra={
            canElevate && noAccess.asAdministrator && tab !== undefined
              ? {
                  label: strings.commander.asAdministrator,
                  onClick: elevate,
                }
              : undefined
          }
        />
      )}
    </>
  );
}

export function CommanderTool({
  active,
  post,
  listen,
}: {
  active: boolean;
  post: (message: CommanderToHost) => void;
  listen: (handler: (message: CommanderToWebview) => void) => () => void;
}) {
  const [store] = useState(() => createCommanderStore(post));
  const tab = useStore(store, (state) => state.view.tab);
  const viewsFile = useStore(
    store,
    (state) => state.view.viewing !== undefined,
  );
  const activeSide = useStore(store, (state) => state.view.active);
  const canGroupByColor = useStore(
    store,
    (state) => state.view.fileColors.colors.length > 0,
  );
  const hasDrives = useStore(store, (state) => state.drives.length > 0);
  const {
    activate,
    chooseLayout,
    groupByColor,
    step,
    reread,
    toggleHidden,
    flat,
  } = store.getState();
  const { closeTab: onClose } = useShellActions();
  const [share, setShare] = useState(0.5);
  const columns = useRef<HTMLDivElement>(null);
  const triggers = {
    left: useRef<HTMLButtonElement>(null),
    right: useRef<HTMLButtonElement>(null),
  };
  const bookmarkTriggers = {
    left: useRef<HTMLButtonElement>(null),
    right: useRef<HTMLButtonElement>(null),
  };

  useEffect(() => listen(store.getState().receive), [listen, store]);

  const shown = active && tab !== undefined;
  const viewing = shown && viewsFile;

  useEffect(() => {
    if (!shown || viewing) {
      return;
    }
    sideToFocus(
      columns.current?.children[sides.indexOf(activeSide)],
      document.activeElement,
    )?.focus();
  }, [shown, viewing, activeSide]);

  useBinding(
    commanderKeymap.history,
    (direction) => step(activeSide, direction),
    shown && !viewing,
  );
  useBinding(
    viewerKeymap.closeViewer,
    () => {
      if (tab !== undefined) {
        onClose(tab);
      }
    },
    viewing,
  );
  useBinding(commanderKeymap.reread, reread, shown && !viewing);
  useBinding(
    commanderKeymap.bookmarks,
    () => bookmarkTriggers[activeSide].current?.click(),
    shown && !viewing,
  );
  useEffect(() => {
    if (!shown) {
      return undefined;
    }
    const side = activeSide;
    const onMouseUp = (event: MouseEvent) => {
      const direction = clicked(commanderKeymap.history, event);
      if (direction !== undefined) {
        event.preventDefault();
        step(side, direction);
      }
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [shown, activeSide, step]);

  useBinding(commanderKeymap.showHidden, toggleHidden, shown && !viewing);
  useBinding(
    commanderKeymap.flatView,
    () => flat(activeSide),
    shown && !viewing,
  );
  useBinding(
    commanderKeymap.groupByColor,
    () => groupByColor(activeSide),
    shown && !viewing && canGroupByColor,
  );
  useBinding(
    commanderKeymap.layout,
    (layout) => chooseLayout(activeSide, layout),
    shown && !viewing,
  );
  useBinding(
    commanderKeymap.drive,
    (side) => {
      activate(side);
      sideToFocus(
        columns.current?.children[sides.indexOf(side)],
        document.activeElement,
      )?.focus();
      triggers[side].current?.click();
    },
    shown && !viewing && hasDrives,
  );

  if (!active) {
    return null;
  }
  const resizer = <Resizer columns={columns} onShare={setShare} />;

  if (viewsFile) {
    return (
      <CommanderStore value={store}>
        <div className="repository commander">
          <div className="columns viewer-columns">
            <Viewer key={tab} />
          </div>
        </div>
      </CommanderStore>
    );
  }

  return (
    <CommanderStore value={store}>
      <div className="repository commander">
        <div
          className="columns commander-columns"
          ref={columns}
          data-active-side={activeSide}
          style={{
            gridTemplateColumns: `minmax(0, ${share}fr) minmax(0, ${1 - share}fr)`,
          }}
        >
          {sides.map((side) => (
            <Pane
              key={side}
              side={side}
              driveTrigger={triggers[side]}
              bookmarkTrigger={bookmarkTriggers[side]}
              resizer={side === 'left' && resizer}
            />
          ))}
        </div>
        <CommanderPopups />
      </div>
    </CommanderStore>
  );
}

function Resizer({
  columns,
  onShare,
}: {
  columns: React.RefObject<HTMLDivElement | null>;
  onShare: (share: number) => void;
}) {
  return (
    <div
      className="resizer"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const box = columns.current?.getBoundingClientRect();
        if (box === undefined) {
          return;
        }
        followDrag(
          window,
          (move: PointerEvent) =>
            onShare(shareOf(move.clientX - box.left, box.width)),
          () => document.body.classList.remove('resizing'),
        );
        document.body.classList.add('resizing');
      }}
      onDoubleClick={() => onShare(0.5)}
    />
  );
}
