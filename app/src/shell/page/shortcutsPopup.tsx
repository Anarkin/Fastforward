import { Fragment, useCallback, useRef } from 'react';
import {
  appGroups,
  keymap,
  shortcutGroupsOf,
  tabGroups,
  type ShortcutGroup,
} from '../shared/keymap';
import type { TabInfo } from '../shared/protocol';
import type { ToolId } from '../shared/tools';
import { KeyCombo } from '../../ui/keyCombo';
import { activeTabOf, useShell, useShellActions } from './store';
import { compareShortcuts, toolShortcuts, viewerShortcuts } from './tools';
import { strings } from '../../shared/strings';
import { useDismiss } from '../../ui/contextMenu';
import { CloseIcon } from '../../ui/icons';
import { useDialogDrag, useModalDialog } from '../../ui/modalDialog';

function Bindings({ bindings }: { bindings: ShortcutGroup['bindings'] }) {
  return (
    <div className="shortcuts-list">
      {bindings.map((binding) => (
        <Fragment key={binding.action}>
          <span className="shortcut-keys">
            {Object.keys(binding.keys).map((keys) => (
              <KeyCombo key={keys} keys={keys} />
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
  halved = false,
}: {
  group: ShortcutGroup;
  halved?: boolean;
}) {
  const half = Math.ceil(group.bindings.length / 2);
  return (
    <section className={halved ? 'shortcuts-group halved' : 'shortcuts-group'}>
      <div className="shortcuts-heading">{group.title}</div>
      {halved ? (
        <div className="shortcuts-halves">
          <Bindings bindings={group.bindings.slice(0, half)} />
          <Bindings bindings={group.bindings.slice(half)} />
        </div>
      ) : (
        <Bindings bindings={group.bindings} />
      )}
    </section>
  );
}

export function shortcutGroupsFor(
  tool: ToolId | undefined,
  kind: Pick<TabInfo, 'view' | 'compare'> = {},
): ShortcutGroup[] {
  return [
    ...[
      ...shortcutGroupsOf(tabGroups, strings.shortcuts.groups, keymap),
      ...shortcutGroupsOf(appGroups, strings.shortcuts.groups, keymap),
    ].map((group) => ({ ...group, pinned: true })),
    ...(tool === undefined
      ? []
      : tool === 'commander' && kind.view === true
        ? viewerShortcuts
        : tool === 'git' && kind.compare === true
          ? compareShortcuts
          : toolShortcuts[tool]),
  ];
}

export function ShortcutsPopup() {
  const tool = useShell((state) => activeTabOf(state)?.tool);
  const view = useShell((state) => activeTabOf(state)?.view);
  const compare = useShell((state) => activeTabOf(state)?.compare);
  const { showPopup } = useShellActions();
  const onClose = useCallback(() => showPopup('shortcuts', false), [showPopup]);
  const groups = shortcutGroupsFor(tool, { view, compare });
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
                <Group key={group.title} group={group} />
              ))}
          </div>
          {unpinned.map((group) => (
            <Group
              key={group.title}
              group={group}

              halved={unpinned.length === 1}
            />
          ))}
        </div>
        <div className="shortcuts-note">{strings.shortcuts.note}</div>
      </div>
    </div>
  );
}
