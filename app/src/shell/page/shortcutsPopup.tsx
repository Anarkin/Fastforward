import { Fragment, useRef } from 'react';
import { keyLabels, type ShortcutGroup } from '../shared/keymap';
import { strings } from '../../shared/strings';
import { useDismiss } from '../../ui/contextMenu';
import { CloseIcon } from '../../ui/icons';
import { useDialogDrag, useModalDialog } from '../../ui/modalDialog';

export function KeyCombo({ keys, mac }: { keys: string; mac?: boolean }) {
  return (
    <span className="shortcut-combo">
      {keyLabels(keys, mac).map((label, place) => (
        <Fragment key={place}>
          {place > 0 && strings.shortcuts.joiner}
          <kbd>{label}</kbd>
        </Fragment>
      ))}
    </span>
  );
}

function Group({ group, mac }: { group: ShortcutGroup; mac: boolean }) {
  return (
    <section className="shortcuts-group">
      <div className="shortcuts-heading">{group.title}</div>
      <div className="shortcuts-list">
        {group.bindings.map((binding) => (
          <Fragment key={binding.action}>
            <span className="shortcut-keys">
              {Object.keys(binding.keys).map((keys) => (
                <KeyCombo key={keys} keys={keys} mac={mac} />
              ))}
            </span>
            <span>{binding.action}</span>
          </Fragment>
        ))}
      </div>
    </section>
  );
}

export function ShortcutsPopup({
  groups,
  mac,
  onClose,
}: {
  groups: readonly ShortcutGroup[];
  mac: boolean;
  onClose: () => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  useDismiss(popup, onClose, { byKeyOnly: true });
  const dialog = useModalDialog(popup);
  const drag = useDialogDrag(popup);
  return (
    <div
      className="backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget && event.preventDefault()
      }
    >
      <div
        className="shortcuts-popup"
        ref={popup}
        {...dialog}
        style={drag.style}
        aria-label={strings.shortcuts.title}
      >
        <div className="shortcuts-title" onPointerDown={drag.onPointerDown}>
          <span>{strings.shortcuts.title}</span>
          <button
            className="nav-button"
            title={strings.common.close}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="shortcuts-groups">
          <div
            className={
              groups.some((group) => !group.pinned)
                ? 'shortcuts-pinned divided'
                : 'shortcuts-pinned'
            }
          >
            {groups
              .filter((group) => group.pinned)
              .map((group) => (
                <Group key={group.title} group={group} mac={mac} />
              ))}
          </div>
          {groups
            .filter((group) => !group.pinned)
            .map((group) => (
              <Group key={group.title} group={group} mac={mac} />
            ))}
        </div>
        <div className="shortcuts-note">{strings.shortcuts.note}</div>
      </div>
    </div>
  );
}
