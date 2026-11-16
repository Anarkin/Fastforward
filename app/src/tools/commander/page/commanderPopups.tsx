import { joinedPath } from '../../../lib/page/pathLooks';
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
import { strings } from '../../../lib/shared/strings';
import { shownRowsOf } from './shownRows';
import { useCommander, useCommanderActions } from './store';
import { keysMatching } from './markPattern';

export function CommanderPopups() {
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
          lines={strings.commander.itemLines(
            joinedPath(renaming.folder, renamed),
          )}
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
            deleting.folder,
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
