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

function Bindings({
  bindings,
  mac,
}: {
  bindings: ShortcutGroup['bindings'];
  mac: boolean;
}) {
  return (
    <div className="shortcuts-list">
      {bindings.map((binding) => (
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
  );
}

function Group({
  group,
  mac,
  halved = false,
}: {
  group: ShortcutGroup;
  mac: boolean;
  halved?: boolean;
}) {
  const half = Math.ceil(group.bindings.length / 2);
  return (
    <section className={halved ? 'shortcuts-group halved' : 'shortcuts-group'}>
      <div className="shortcuts-heading">{group.title}</div>
      {halved ? (
        <div className="shortcuts-halves">
          <Bindings bindings={group.bindings.slice(0, half)} mac={mac} />
          <Bindings bindings={group.bindings.slice(half)} mac={mac} />
        </div>
      ) : (
        <Bindings bindings={group.bindings} mac={mac} />
      )}
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
  const unpinned = groups.filter((group) => !group.pinned);
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
          {unpinned.map((group) => (
            <Group
              key={group.title}
              group={group}
              mac={mac}
              halved={unpinned.length === 1}
            />
          ))}
        </div>
        <div className="shortcuts-note">{strings.shortcuts.note}</div>
      </div>
    </div>
  );
}
