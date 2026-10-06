import { Fragment, useRef } from 'react';
import { groups, keyLabels, keymap } from '../shared/keymap';
import { useDismiss } from './contextMenu';
import { CloseIcon } from './icons';

export const shortcutGroups = groups.map((group) => ({
  title: group,
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
  useDismiss(popup, onClose);
  return (
    <div
      className="shortcuts-popup"
      ref={popup}
      role="dialog"
      aria-label="Shortcuts"
    >
      <div className="shortcuts-title">
        <span>Shortcuts</span>
        <button className="nav-button" title="Close" onClick={onClose}>
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
                      <span key={keys} className="shortcut-combo">
                        {keyLabels(keys, mac).map((label, place) => (
                          <Fragment key={place}>
                            {place > 0 && '+'}
                            <kbd>{label}</kbd>
                          </Fragment>
                        ))}
                      </span>
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
  );
}
