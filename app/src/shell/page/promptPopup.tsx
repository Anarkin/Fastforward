import { useEffectEvent, useLayoutEffect, useRef } from 'react';
import { strings } from '../../lib/shared/strings';
import type { Line, Sentence } from '../../lib/shared/sentences';
import { useDismiss } from '../../lib/page/dismiss';
import { CloseIcon } from '../../lib/page/icons';
import { moveBetweenButtons } from '../../lib/page/dialogButtons';
import { useModalDialog } from '../../lib/page/modalDialog';
import { useDialogDrag } from '../../lib/page/dialogDrag';
import { NameLines, Words } from '../../lib/page/name';
import type { KeptTyped } from '../../lib/page/keptFocus';

const typedIn = (field: HTMLInputElement): KeptTyped =>
  field.selectionStart === null || field.selectionEnd === null
    ? { value: field.value }
    : {
        value: field.value,
        selection: [
          field.selectionStart,
          field.selectionEnd,
          field.selectionDirection ?? 'none',
        ],
      };

export function PromptPopup({
  title,
  message,
  lines = [],
  label,
  confirm,
  problemOf,
  noteOf,
  secret = false,
  initial = '',
  selectedUpTo,
  typed: kept,
  onTyped,
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: string;
  lines?: readonly Line[];
  label: string;
  confirm: string;
  problemOf: (value: string) => Sentence | undefined;
  noteOf?: (value: string) => string | undefined;
  secret?: boolean;
  initial?: string;
  selectedUpTo?: number;
  typed: KeptTyped | undefined;
  onTyped: (typed: KeptTyped) => void;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const value = kept?.value ?? initial;
  useDismiss(popup, onCancel, { byKeyOnly: true });
  const dialog = useModalDialog(popup);
  const drag = useDialogDrag(popup);
  const placeCaret = useEffectEvent(() => {
    field.current?.focus();
    if (kept?.selection !== undefined) {
      field.current?.setSelectionRange(...kept.selection);
    } else if (selectedUpTo !== undefined) {
      field.current?.setSelectionRange(0, selectedUpTo);
    }
  });
  useLayoutEffect(() => placeCaret(), []);
  const typed = secret ? value : value.trim();
  const problem = problemOf(typed);
  const note = noteOf?.(typed);
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
          {message !== undefined && (
            <span className="prompt-message" title={message}>
              {message}
            </span>
          )}
          {lines.length > 0 && <NameLines lines={lines} />}
          <input
            ref={field}
            className="prompt-input"
            type={secret ? 'password' : 'text'}
            aria-label={label}
            value={value}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => onTyped(typedIn(event.target))}
            onSelect={(event) => onTyped(typedIn(event.currentTarget))}
          />
          {typed !== '' && problem !== undefined && (
            <div className="prompt-problem" role="alert">
              <Words>{problem}</Words>
            </div>
          )}
          {problem === undefined && note !== undefined && (
            <div className="prompt-note">{note}</div>
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
