import { namedFile } from '../../../lib/shared/sentences';
import { labelTip, tip } from '../../../lib/page/tips';
import { joinedPath } from '../../../lib/page/pathLooks';
import { useEffect, useId, useRef } from 'react';
import { strings } from '../../../lib/shared/strings';
import { useDismiss } from '../../../lib/page/dismiss';
import { CloseIcon } from '../../../lib/page/icons';
import { moveBetweenButtons } from '../../../lib/page/dialogButtons';
import { useModalDialog } from '../../../lib/page/modalDialog';
import { useDialogDrag } from '../../../lib/page/dialogDrag';
import { formatDate } from '../../../lib/page/dates';
import { useShell } from '../../../shell/page/store';
import type { ClashSide, TransferView } from '../shared/transfers';
import { useCommander, useCommanderActions } from './store';
import { PathTitle } from '../../../lib/page/pathTitle';
import { NameLines, NamedPath, Words } from '../../../lib/page/name';
import { progressLines, runningLines, shareDone } from './transferProgress';

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

function ClashBody({
  clash,
  move,
  target,
}: {
  clash: Clash;
  move: boolean;
  target: string;
}) {
  const { answerClash, stopTransfer, keepClashAll } = useCommanderActions();
  const all = useCommander(
    ({ clashAll, transfer }) =>
      clashAll !== undefined &&
      clashAll.transfer === transfer?.id &&
      clashAll.asked === clash.asked &&
      clashAll.all,
  );
  const setAll = keepClashAll;
  const id = useId();
  const skip = useRef<HTMLButtonElement>(null);
  useEffect(() => skip.current?.focus(), []);
  const { commander } = strings;
  return (
    <div className="confirm-body transfer-body">
      <span className="transfer-clash">{commander.clashThereAlready}</span>
      <div className="transfer-sides">
        <span />
        <span className="transfer-clash-path">
          <NamedPath path={joinedPath(target, clash.name)} file />
        </span>
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
          {...tip(
            lines.file === undefined ? lines.current : [namedFile(lines.file)],
            { at: 'over', cut: true },
          )}
        >
          {lines.file !== undefined ? (
            <PathTitle path={lines.file} file />
          ) : (
            lines.current !== undefined && <Words>{lines.current}</Words>
          )}
        </span>
      </div>
      <div
        className="progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={done}
      >
        <div className="progress-bar-done" style={{ width: `${done}%` }} />
      </div>
      {progress !== undefined &&
        (transfer.archiveJob === undefined ||
          countedJobs.has(transfer.archiveJob)) && (
          <div className="progress-counts">
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
            {...labelTip(strings.common.close)}
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
            target={transfer.target}
          />
        )}
      </div>
    </div>
  );
}
