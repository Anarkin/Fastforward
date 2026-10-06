import { Fragment, useRef } from 'react';
import { useDismiss } from './contextMenu';
import { CloseIcon } from './icons';

interface ShortcutEntry {
  readonly keys: readonly (readonly string[])[];
  readonly action: string;
}

interface ShortcutGroup {
  readonly title: string;
  readonly entries: readonly ShortcutEntry[];
}

// Mod is Cmd on macOS, while Ctrl stays Ctrl there
export const shortcutGroups: readonly ShortcutGroup[] = [
  {
    title: 'Tabs',
    entries: [
      { keys: [['Mod', 'T']], action: 'Open a repository' },
      {
        keys: [
          ['Ctrl', 'Tab'],
          ['Ctrl', 'Shift', 'Tab'],
        ],
        action: 'Next or previous repository',
      },
      {
        keys: [
          ['Ctrl', 'PgDn'],
          ['Ctrl', 'PgUp'],
        ],
        action: 'Next or previous worktree',
      },
      { keys: [['Middle-click']], action: 'Close a repository' },
    ],
  },
  {
    title: 'History',
    entries: [
      { keys: [['H']], action: 'Select the checked-out commit' },
      { keys: [['U']], action: 'Select the upstream of its branch' },
      { keys: [['S']], action: 'Search branches, remotes, tags and commits' },
      { keys: [['C']], action: 'Show or hide the commit list' },
      { keys: [['↑'], ['↓']], action: 'Move in a list' },
      {
        keys: [['PgUp'], ['PgDn'], ['Home'], ['End']],
        action: 'Move a page, or to either end',
      },
      { keys: [['Mod', 'Click']], action: 'Compare with the commit selected' },
      {
        keys: [['Mouse Back'], ['Mouse Forward']],
        action: 'Back or forward',
      },
    ],
  },
  {
    title: 'Columns',
    entries: [
      {
        keys: [['Tab'], ['Shift', 'Tab'], ['→'], ['←']],
        action: 'Next or previous column',
      },
    ],
  },
  {
    title: 'Files',
    entries: [{ keys: [['Space']], action: 'Open or close a folder' }],
  },
  {
    title: 'Diff',
    entries: [
      { keys: [['J'], ['K']], action: 'Next or previous change' },
      { keys: [['W']], action: 'Wrap long lines' },
      { keys: [['Mod', 'F']], action: 'Find' },
      {
        keys: [['Enter'], ['Shift', 'Enter']],
        action: 'Next or previous match',
      },
      { keys: [['Esc']], action: 'Stop finding' },
    ],
  },
  {
    title: 'App',
    entries: [
      { keys: [['F1'], ['?']], action: 'Show these shortcuts' },
      { keys: [['Mod', 'Shift', 'I']], action: 'Developer tools' },
    ],
  },
];

export function keyLabel(key: string, mac: boolean): string {
  if (key !== 'Mod') {
    return key;
  }
  return mac ? '⌘' : 'Ctrl';
}

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
        <button className="nav-button" title="Close (Esc)" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="shortcuts-groups">
        {shortcutGroups.map((group) => (
          <section key={group.title} className="shortcuts-group">
            <div className="shortcuts-heading">{group.title}</div>
            <div className="shortcuts-list">
              {group.entries.map((entry) => (
                <Fragment key={entry.action}>
                  <span className="shortcut-keys">
                    {entry.keys.map((combo, index) => (
                      <span key={index} className="shortcut-combo">
                        {combo.map((key, place) => (
                          <Fragment key={place}>
                            {place > 0 && '+'}
                            <kbd>{keyLabel(key, mac)}</kbd>
                          </Fragment>
                        ))}
                      </span>
                    ))}
                  </span>
                  <span>{entry.action}</span>
                </Fragment>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
