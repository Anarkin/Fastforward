import { useEffect, useRef } from 'react';
import { strings } from '../../shared/strings';
import { useDismiss } from '../../ui/contextMenu';
import { CloseIcon } from '../../ui/icons';
import { useDialogDrag, useModalDialog } from '../../ui/modalDialog';

export function ConfirmPopup({
  title,
  message,
  confirm,
  onConfirm,
  onCancel,
  cancel = strings.confirm.cancel,
}: {
  title: string;
  message: string;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
  cancel?: string | null;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const confirming = useRef<HTMLButtonElement>(null);
  useDismiss(popup, onCancel, { byKeyOnly: true });
  const dialog = useModalDialog(popup);
  const drag = useDialogDrag(popup);
  useEffect(() => confirming.current?.focus(), []);
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
          <span>{message}</span>
          <div className="confirm-buttons">
            {cancel !== null && (
              <button className="confirm-button" onClick={onCancel}>
                {cancel}
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
