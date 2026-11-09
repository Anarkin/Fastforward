import { useEffect, useId, useRef, useState } from 'react';
import { strings } from '../../../shared/strings';
import { useDismiss } from '../../../ui/contextMenu';
import { CloseIcon } from '../../../ui/icons';
import { moveBetweenButtons } from '../../../ui/dialogButtons';
import { useDialogDrag, useModalDialog } from '../../../ui/modalDialog';
import { formatDate } from '../../../ui/dates';
import { useShell } from '../../../shell/page/store';
import type { ClashSide, TransferView } from '../shared/transfers';
import { useCommander, useCommanderActions } from './store';
import { shareDone, whatOf } from './transferring';

type Clash = NonNullable<TransferView['clash']>;

function ClashSideRow({ label, side }: { label: string; side: ClashSide }) {
  const dateFormat = useShell((state) => state.dateFormat);
  return (
    <>
      <span>{label}</span>
      <span>
        {strings.commander.clashDetails(
          side.size ?? 0,
          formatDate(side.modified, dateFormat),
        )}
      </span>
    </>
  );
}

function ClashBody({ clash, move }: { clash: Clash; move: boolean }) {
  const { answerClash, stopTransfer } = useCommanderActions();
  const [all, setAll] = useState(false);
  const id = useId();
  const skip = useRef<HTMLButtonElement>(null);
  useEffect(() => skip.current?.focus(), []);
  const { commander } = strings;
  return (
    <div className="confirm-body transfer-body">
      <span className="transfer-clash">
        {commander.clashQuestion(commander.oneItem(clash.name))}
      </span>
      <div className="transfer-sides">
        <ClashSideRow
          label={move ? commander.clashMoving : commander.clashCopying}
          side={clash.source}
        />
        <ClashSideRow label={commander.clashThere} side={clash.target} />
      </div>
      {clash.target.readOnly === true && <span>{commander.clashReadOnly}</span>}
      <label className="transfer-all" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={all}
          onChange={(event) => setAll(event.target.checked)}
        />
        {commander.forTheRest}
      </label>
      <div className="confirm-buttons" onKeyDown={moveBetweenButtons}>
        <button className="confirm-button" onClick={stopTransfer}>
          {commander.stopTransfer}
        </button>
        <button
          className="confirm-button"
          onClick={() => answerClash('overwrite', all)}
        >
          {commander.overwrite}
        </button>
        <button
          className="confirm-button"
          onClick={() => answerClash('keepBoth', all)}
        >
          {commander.keepBoth}
        </button>
        <button
          ref={skip}
          className="confirm-button default"
          onClick={() => answerClash('skip', all)}
        >
          {commander.skip}
        </button>
      </div>
    </div>
  );
}

const archiveJobs = {
  pack: {
    title: strings.commander.packTitle,
    running: strings.commander.packingInto,
  },
  delete: {
    title: strings.commander.deletePermanentlyTitle,
    running: strings.commander.deletingFrom,
  },
  rename: {
    title: strings.commander.renameTitle,
    running: strings.commander.renamingIn,
  },
  folder: {
    title: strings.commander.newFolderTitle,
    running: strings.commander.makingFolderIn,
  },
  copyIn: {
    title: strings.commander.copyTitle,
    running: strings.commander.copying,
  },
  moveIn: {
    title: strings.commander.moveTitle,
    running: strings.commander.moving,
  },
};

const countedJobs: ReadonlySet<string> = new Set(['pack', 'copyIn', 'moveIn']);

function runningSentence(
  transfer: TransferView,
): (what: string, target: string) => string {
  const { commander } = strings;
  if (transfer.archiveJob !== undefined) {
    return archiveJobs[transfer.archiveJob].running;
  }
  return transfer.move ? commander.moving : commander.copying;
}

function titleOf(transfer: TransferView): string {
  if (transfer.archiveJob !== undefined) {
    return archiveJobs[transfer.archiveJob].title;
  }
  return transfer.move
    ? strings.commander.moveTitle
    : strings.commander.copyTitle;
}

function ProgressBody({ transfer }: { transfer: TransferView }) {
  const { stopTransfer } = useCommanderActions();
  const { commander } = strings;
  const { progress } = transfer;
  const done = shareDone(progress);
  const stop = useRef<HTMLButtonElement>(null);
  useEffect(() => stop.current?.focus(), []);
  return (
    <div className="confirm-body transfer-body">
      <div className="transfer-running">
        <span title={transfer.target}>
          {runningSentence(transfer)(
            whatOf(transfer.items, transfer.name),
            transfer.target,
          )}
        </span>
        <span className="transfer-current" title={progress?.current}>
          {progress === undefined ? commander.counting : progress.current}
        </span>
      </div>
      <div
        className="transfer-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={done}
      >
        <div className="transfer-bar-done" style={{ width: `${done}%` }} />
      </div>
      {progress !== undefined &&
        (transfer.archiveJob === undefined ||
          countedJobs.has(transfer.archiveJob)) && (
          <div className="transfer-counts">
            <span>
              {commander.transferredFiles(progress.files, progress.totalFiles)}
            </span>
            <span>
              {commander.transferredBytes(progress.bytes, progress.totalBytes)}
            </span>
          </div>
        )}
      <div className="confirm-buttons" onKeyDown={moveBetweenButtons}>
        <button
          ref={stop}
          className="confirm-button default"
          disabled={transfer.stopping}
          onClick={stopTransfer}
        >
          {transfer.stopping
            ? commander.stoppingTransfer
            : commander.stopTransfer}
        </button>
      </div>
    </div>
  );
}

export function TransferPopup() {
  const transfer = useCommander((state) => state.transfer);
  return transfer === undefined ? null : <TransferDialog transfer={transfer} />;
}

function TransferDialog({ transfer }: { transfer: TransferView }) {
  const { hideTransfer } = useCommanderActions();
  const popup = useRef<HTMLDivElement>(null);
  useDismiss(popup, hideTransfer, { byKeyOnly: true });
  const dialog = useModalDialog(popup);
  const drag = useDialogDrag(popup);
  const title = titleOf(transfer);
  return (
    <div
      className="backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget && event.preventDefault()
      }
    >
      <div
        className="shortcuts-popup confirm-popup transfer-popup"
        ref={popup}
        {...dialog}
        style={drag.style}
        aria-label={title}
      >
        <div className="shortcuts-title" onPointerDown={drag.onPointerDown}>
          <span>{title}</span>
          <button
            className="nav-button"
            title={strings.common.close}
            onClick={hideTransfer}
          >
            <CloseIcon />
          </button>
        </div>
        {transfer.clash === undefined ? (
          <ProgressBody transfer={transfer} />
        ) : (
          <ClashBody
            key={transfer.clash.asked}
            clash={transfer.clash}
            move={transfer.move}
          />
        )}
      </div>
    </div>
  );
}
