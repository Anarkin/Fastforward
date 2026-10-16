import { Fragment, useRef } from 'react';
import { groups, keyLabels, keymap } from '../shared/keymap';
import { strings } from '../shared/strings';
import { useDismiss } from './contextMenu';
import { CloseIcon } from './icons';
import { useDialogDrag, useModalDialog } from './modalDialog';

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

export const shortcutGroups = groups.map((group) => ({
  title: strings.shortcuts.groups[group],
  bindings: Object.values(keymap).filter((binding) => binding.group === group),
}));

export function ShortcutsPopup({
  mac,
  onClose,
}: {
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
          {shortcutGroups.map((group) => (
            <section key={group.title} className="shortcuts-group">
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
          ))}
        </div>
      </div>
    </div>
  );
}
