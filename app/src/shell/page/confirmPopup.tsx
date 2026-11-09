import { useLayoutEffect, useRef } from 'react';
import { strings, type Line } from '../../shared/strings';
import { useDismiss } from '../../ui/contextMenu';
import { CloseIcon } from '../../ui/icons';
import { moveBetweenButtons } from '../../ui/dialogButtons';
import { useDialogDrag, useModalDialog } from '../../ui/modalDialog';
import { NameLines } from '../../ui/name';

export function ConfirmPopup({
  title,
  message,
  lines = [],
  note,
  confirm,
  onConfirm,
  onCancel,
  cancel = strings.confirm.cancel,
  extra,
}: {
  title: string;
  message?: string;
  lines?: readonly Line[];
  note?: string;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
  cancel?: string | null;
  extra?: { readonly label: string; readonly onClick: () => void };
}) {
  const popup = useRef<HTMLDivElement>(null);
  const confirming = useRef<HTMLButtonElement>(null);
  useDismiss(popup, onCancel, { byKeyOnly: true });
  const dialog = useModalDialog(popup);
  const drag = useDialogDrag(popup);
  useLayoutEffect(() => confirming.current?.focus(), []);
  return (
    <div
      className="backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget && event.preventDefault()
      }
    >
      <div
        className="shortcuts-popup confirm-popup"
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
            onClick={onCancel}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="confirm-body">
          <div className="confirm-question">
            {message !== undefined && <span>{message}</span>}
            {lines.length > 0 && <NameLines lines={lines} />}
            {note !== undefined && <span>{note}</span>}
          </div>
          <div className="confirm-buttons" onKeyDown={moveBetweenButtons}>
            {cancel !== null && (
              <button className="confirm-button" onClick={onCancel}>
                {cancel}
              </button>
            )}
            {extra && (
              <button className="confirm-button" onClick={extra.onClick}>
                {extra.label}
              </button>
            )}
            <button
              className="confirm-button default"
              ref={confirming}
              onClick={onConfirm}
            >
              {confirm}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
