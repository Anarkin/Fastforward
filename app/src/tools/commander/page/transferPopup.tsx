import { useEffect, useId, useRef, useState } from 'react';
import { plainOf, strings } from '../../../lib/shared/strings';
import { useDismiss } from '../../../lib/page/menuControls';
import { CloseIcon } from '../../../lib/page/icons';
import { moveBetweenButtons } from '../../../lib/page/dialogButtons';
import { useDialogDrag, useModalDialog } from '../../../lib/page/modalDialog';
import { formatDate } from '../../../lib/page/dates';
import { useShell } from '../../../shell/page/store';
import type { ClashSide, TransferView } from '../shared/transfers';
import { useCommander, useCommanderActions } from './store';
import { NameLines, Words } from '../../../lib/page/name';
import { progressLines, runningLines, shareDone } from './transferring';

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
        <Words>{commander.clashQuestion(commander.oneItem(clash.name))}</Words>
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

const archiveJobTitles = {
  pack: strings.commander.packTitle,
  delete: strings.commander.deletePermanentlyTitle,
  rename: strings.commander.renameTitle,
  folder: strings.commander.newFolderTitle,
  copyIn: strings.commander.copyTitle,
  moveIn: strings.commander.moveTitle,
  test: strings.commander.testTitle,
  update: strings.commander.updateTitle,
};

const countedJobs: ReadonlySet<string> = new Set([
  'pack',
  'copyIn',
  'moveIn',
  'update',
]);

function titleOf(transfer: TransferView): string {
  if (transfer.archiveJob !== undefined) {
    return archiveJobTitles[transfer.archiveJob];
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
  const lines = progressLines(transfer);
  return (
    <div className="confirm-body transfer-body">
      <div className="transfer-running">
        <NameLines lines={runningLines(transfer)} />
        <span
          className="transfer-current"
          title={
            lines.current === undefined ? undefined : plainOf(lines.current)
          }
        >
          {lines.current !== undefined && <Words>{lines.current}</Words>}
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
            <span>{lines.files}</span>
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
