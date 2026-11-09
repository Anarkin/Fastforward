import { useLayoutEffect, useRef, useState } from 'react';
import { strings } from '../../shared/strings';
import { useDismiss } from '../../ui/contextMenu';
import { CloseIcon } from '../../ui/icons';
import { moveBetweenButtons } from '../../ui/dialogButtons';
import { useDialogDrag, useModalDialog } from '../../ui/modalDialog';

export function PromptPopup({
  title,
  message,
  label,
  confirm,
  problemOf,
  secret = false,
  initial = '',
  selectedUpTo,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  label: string;
  confirm: string;
  problemOf: (value: string) => string | undefined;
  secret?: boolean;
  initial?: string;
  selectedUpTo?: number;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  useDismiss(popup, onCancel, { byKeyOnly: true });
  const dialog = useModalDialog(popup);
  const drag = useDialogDrag(popup);
  useLayoutEffect(() => {
    field.current?.focus();
    if (selectedUpTo !== undefined) {
      field.current?.setSelectionRange(0, selectedUpTo);
    }
  }, [selectedUpTo]);
  const typed = secret ? value : value.trim();
  const problem = problemOf(typed);
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
        <form
          className="confirm-body"
          onSubmit={(event) => {
            event.preventDefault();
            if (problem === undefined) {
              onConfirm(typed);
            }
          }}
        >
          <span className="prompt-message" title={message}>
            {message}
          </span>
          <input
            ref={field}
            className="prompt-input"
            type={secret ? 'password' : 'text'}
            aria-label={label}
            value={value}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setValue(event.target.value)}
          />
          {typed !== '' && problem !== undefined && (
            <div className="prompt-problem" role="alert">
              {problem}
            </div>
          )}
          <div className="confirm-buttons" onKeyDown={moveBetweenButtons}>
            <button type="button" className="confirm-button" onClick={onCancel}>
              {strings.confirm.cancel}
            </button>
            <button
              type="submit"
              className="confirm-button default"
              disabled={problem !== undefined}
            >
              {confirm}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
