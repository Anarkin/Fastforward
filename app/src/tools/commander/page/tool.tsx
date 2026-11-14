import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { clicked } from '../../../shell/shared/keymap';
import './style.css';
import { commanderKeymap, viewerKeymap } from './keymap';
import {
  sides,
  type CommanderDrop,
  type CommanderToHost,
  type CommanderToWebview,
} from '../shared/protocol';
import { Pane } from './pane';
import { Editor } from './editor';
import { Viewer } from './viewer';
import { columnFocusAttribute } from '../../../ui/columnFocus';
import { followDrag } from '../../../ui/followDrag';
import { useBinding } from '../../../ui/shortcuts';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { PromptPopup } from '../../../shell/page/promptPopup';
import {
  baseNameOf,
  newFileProblem,
  newFolderProblem,
  renamedPart,
  renameProblem,
} from './naming';
import { deleteQuestion } from './deleting';
import { transferQuestion } from './transferring';
import { TransferPopup } from './transferPopup';
import { PackPopup } from './packPopup';
import { strings } from '../../../shared/strings';
import { useShellActions } from '../../../shell/page/store';
import {
  CommanderStore,
  createCommanderStore,
  shownRowsOf,
  useCommander,
  useCommanderActions,
} from './store';
import { keysMatching } from './listing';

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
  const transferring = useCommander((state) => state.transferring);
  const makingFolder = useCommander((state) => state.makingFolder);
  const makingFile = useCommander((state) => state.makingFile);
  const listedForFile = useCommander((state) =>
    state.makingFile === undefined
      ? undefined
      : state.view.panes[state.makingFile.side]?.entries,
  );
  const platform = useCommander((state) => state.view.platform);
  const listed = useCommander((state) =>
    state.makingFolder === undefined
      ? undefined
      : state.view.panes[state.makingFolder.side]?.entries,
  );
  const noAccess = useCommander((state) => state.noAccess);
  const renaming = useCommander((state) => state.renaming);
  const renamedIn = useCommander((state) =>
    state.renaming === undefined
      ? undefined
      : state.view.panes[state.renaming.side]?.entries,
  );
  const goingTo = useCommander((state) => state.goingTo);
  const markingPattern = useCommander((state) => state.markingPattern);
  const patternRows = useCommander((state) =>
    state.markingPattern === undefined
      ? undefined
      : shownRowsOf(state, state.markingPattern.side).rows,
  );
  const askingPassword = useCommander((state) => state.askingPassword);
  const askingUpdate = useCommander((state) => state.askingUpdate);
  const {
    confirmDelete,
    cancelDelete,
    confirmTransfer,
    cancelTransfer,
    makeFolder,
    cancelNewFolder,
    makeFile,
    cancelNewFile,
    closeNoAccess,
    elevate,
    answerPassword,
    answerUpdate,
    rename,
    cancelRename,
    goTo,
    cancelGoTo,
    markPattern,
    cancelMarkPattern,
  } = useCommanderActions();
  const renamed =
    renaming === undefined ? undefined : baseNameOf(renaming.name, platform);
  return (
    <>
      <TransferPopup />
      <PackPopup />
      {askingUpdate !== undefined && (
        <ConfirmPopup
          key={askingUpdate.ask}
          title={strings.commander.updateTitle}
          message={strings.commander.updateAsked}
          lines={strings.commander.updateLines(
            askingUpdate.name,
            askingUpdate.archive,
          )}
          confirm={strings.commander.updateConfirm}
          cancel={strings.commander.updateLater}
          onConfirm={() => answerUpdate(true)}
          onCancel={() => answerUpdate(false)}
        />
      )}
      {askingPassword !== undefined && (
        <PromptPopup
          key={askingPassword.ask}
          title={strings.commander.passwordTitle}
          message={
            askingPassword.wrong
              ? strings.commander.passwordWrong
              : strings.commander.passwordAsked
          }
          lines={strings.commander.archiveLines(askingPassword.name)}
          label={strings.commander.passwordLabel}
          confirm={strings.commander.passwordOpen}
          problemOf={(password) =>
            password === '' ? strings.commander.noPassword : undefined
          }
          secret
          onConfirm={answerPassword}
          onCancel={() => answerPassword(undefined)}
        />
      )}
      {makingFolder !== undefined && (
        <PromptPopup
          title={strings.commander.newFolderTitle}
          lines={strings.commander.newFolderLines(makingFolder.folder)}
          label={strings.commander.newFolderName}
          confirm={strings.commander.makeFolder}
          problemOf={(name) => newFolderProblem(name, listed, platform)}
          onConfirm={makeFolder}
          onCancel={cancelNewFolder}
        />
      )}
      {makingFile !== undefined && (
        <PromptPopup
          title={strings.commander.newFileTitle}
          lines={strings.commander.newFolderLines(makingFile.folder)}
          label={strings.commander.newFolderName}
          confirm={strings.commander.editNewFile}
          problemOf={(name) => newFileProblem(name, listedForFile, platform)}
          onConfirm={makeFile}
          onCancel={cancelNewFile}
        />
      )}
      {renaming !== undefined && renamed !== undefined && (
        <PromptPopup
          title={strings.commander.renameTitle}
          lines={strings.commander.itemLines(renamed)}
          label={strings.commander.newName}
          confirm={strings.commander.renameConfirm}
          initial={renamed}
          selectedUpTo={renamedPart(
            renamed,
            renamedIn?.some(
              (entry) => entry.name === renaming.name && entry.folder,
            ) === true,
          )}
          problemOf={(to) => renameProblem(to, renamed, renamedIn, platform)}
          onConfirm={rename}
          onCancel={cancelRename}
        />
      )}
      {markingPattern !== undefined && (
        <PromptPopup
          title={
            markingPattern.mark
              ? strings.commander.markTitle
              : strings.commander.unmarkTitle
          }
          label={strings.commander.patternField}
          confirm={
            markingPattern.mark
              ? strings.commander.markConfirm
              : strings.commander.unmarkConfirm
          }
          initial={markingPattern.initial}
          selectedUpTo={markingPattern.initial.length}
          problemOf={(pattern) =>
            pattern === '' ? strings.commander.noPattern : undefined
          }
          noteOf={(pattern) =>
            strings.commander.patternMatches(
              keysMatching(patternRows ?? [], pattern, platform).length,
            )
          }
          onConfirm={markPattern}
          onCancel={cancelMarkPattern}
        />
      )}
      {goingTo !== undefined && (
        <PromptPopup
          title={strings.commander.goToTitle}
          label={strings.commander.goToField}
          confirm={strings.commander.goToConfirm}
          initial={goingTo.folder}
          selectedUpTo={goingTo.folder.length}
          problemOf={(to) => (to === '' ? strings.commander.noPath : undefined)}
          onConfirm={goTo}
          onCancel={cancelGoTo}
        />
      )}
      {transferring !== undefined && (
        <ConfirmPopup
          {...transferQuestion(
            transferring.names,
            transferring.move,
            transferring.target,
            transferring.existing?.length,
          )}
          onConfirm={() => confirmTransfer()}
          onCancel={cancelTransfer}
          {...(transferring.existing !== undefined &&
            transferring.existing.length < transferring.names.length && {
              extra: {
                label: strings.commander.skipThem,
                onClick: () => confirmTransfer('skip'),
              },
            })}
        />
      )}
      {deleting !== undefined && (
        <ConfirmPopup
          {...deleteQuestion(
            deleting.names,
            deleting.permanently,
            document.documentElement.dataset.platform,
            deleting.binOff,
            deleting.archive,
          )}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
      {noAccess !== undefined && (
        <ConfirmPopup
          title={strings.commander.noAccessTitle}
          message={strings.commander.noAccess}
          lines={strings.commander.folderLines(noAccess.folder)}
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
  dropFiles,
}: {
  active: boolean;
  post: (message: CommanderToHost) => void;
  listen: (handler: (message: CommanderToWebview) => void) => () => void;
  dropFiles?: (files: readonly File[], message: CommanderDrop) => void;
}) {
  const [store] = useState(() =>
    createCommanderStore(post, {}, undefined, dropFiles),
  );
  const tab = useStore(store, (state) => state.view.tab);
  const viewsFile = useStore(
    store,
    (state) => state.view.viewing !== undefined,
  );
  const editsFile = useStore(
    store,
    (state) => state.view.editing !== undefined,
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
    askGoTo,
    duplicates,
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
  const panesShown = shown && !viewsFile && !editsFile;

  useEffect(() => {
    if (!panesShown) {
      return;
    }
    sideToFocus(
      columns.current?.children[sides.indexOf(activeSide)],
      document.activeElement,
    )?.focus();
  }, [panesShown, activeSide]);

  useBinding(
    commanderKeymap.history,
    (direction) => step(activeSide, direction),
    panesShown,
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
  useBinding(commanderKeymap.reread, reread, panesShown);
  useBinding(
    commanderKeymap.bookmarks,
    () => bookmarkTriggers[activeSide].current?.click(),
    panesShown,
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

  useBinding(commanderKeymap.goTo, () => askGoTo(activeSide), panesShown);
  useBinding(commanderKeymap.showHidden, toggleHidden, panesShown);
  useBinding(commanderKeymap.flatView, () => flat(activeSide), panesShown);
  useBinding(
    commanderKeymap.duplicates,
    () => duplicates(activeSide),
    panesShown,
  );
  useBinding(
    commanderKeymap.groupByColor,
    () => groupByColor(activeSide),
    panesShown && canGroupByColor,
  );
  useBinding(
    commanderKeymap.layout,
    (layout) => chooseLayout(activeSide, layout),
    panesShown,
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
    panesShown && hasDrives,
  );

  if (!active) {
    return null;
  }
  const resizer = <Resizer columns={columns} onShare={setShare} />;

  if (editsFile) {
    return (
      <CommanderStore value={store}>
        <div className="repository commander">
          <div className="columns viewer-columns">
            <Editor key={tab} />
          </div>
        </div>
      </CommanderStore>
    );
  }

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
