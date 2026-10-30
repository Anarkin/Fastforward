import { useCallback } from 'react';
import { gitGroups, gitKeymap } from '../../tools/git/shared/keymap';
import type { GitToHost, GitToWebview } from '../../tools/git/shared/protocol';
import { shortcutGroupsOf, type ShortcutGroup } from '../shared/keymap';
import type { ToHost } from '../shared/protocol';
import { strings } from '../../shared/strings';
import type { ToolId, ToWebviewOfTool } from '../shared/tools';
import type { ContextMenuItem, OpenMenu } from '../../ui/contextMenu';
import { FilesTool } from '../../tools/files/page/tool';
import { TerminalTool } from '../../tools/terminal/page/tool';
import {
  terminalGroups,
  terminalKeymap,
} from '../../tools/terminal/shared/keymap';
import type {
  TerminalToHost,
  TerminalToWebview,
} from '../../tools/terminal/shared/protocol';
import { GitTool } from '../../tools/git/page/tool';

export type ToolListeners = {
  readonly [K in ToolId]: Set<(message: ToWebviewOfTool<K>) => void>;
};

export const toolShortcuts: Readonly<Record<ToolId, readonly ShortcutGroup[]>> =
  {
    git: shortcutGroupsOf(gitGroups, strings.shortcuts.groups, gitKeymap),
    files: [],
    terminal: shortcutGroupsOf(
      terminalGroups,
      strings.shortcuts.groups,
      terminalKeymap,
    ),
  };

export function ToolViews({
  active,
  post,
  listeners,
  showMenu,
  closeMenu,
  onNewTabItems,
  onTitle,
}: {
  active: ToolId | undefined;
  post: (message: ToHost) => void;
  listeners: ToolListeners;
  showMenu: (menu: OpenMenu) => void;
  closeMenu: () => void;
  onNewTabItems: (tool: ToolId, items: readonly ContextMenuItem[]) => void;
  onTitle: (tool: ToolId, title: string | undefined) => void;
}) {
  const postGit = useCallback(
    (message: GitToHost) => post({ type: 'tool', tool: 'git', message }),
    [post],
  );
  const listenGit = useCallback(
    (handler: (message: GitToWebview) => void) => {
      listeners.git.add(handler);
      return () => {
        listeners.git.delete(handler);
      };
    },
    [listeners],
  );
  const gitItems = useCallback(
    (items: readonly ContextMenuItem[]) => onNewTabItems('git', items),
    [onNewTabItems],
  );
  const gitTitle = useCallback(
    (title: string | undefined) => onTitle('git', title),
    [onTitle],
  );
  const postTerminal = useCallback(
    (message: TerminalToHost) =>
      post({ type: 'tool', tool: 'terminal', message }),
    [post],
  );
  const listenTerminal = useCallback(
    (handler: (message: TerminalToWebview) => void) => {
      listeners.terminal.add(handler);
      return () => {
        listeners.terminal.delete(handler);
      };
    },
    [listeners],
  );
  const copyText = useCallback(
    (text: string) => post({ type: 'copyText', text }),
    [post],
  );
  const terminalItems = useCallback(
    (items: readonly ContextMenuItem[]) => onNewTabItems('terminal', items),
    [onNewTabItems],
  );
  return (
    <>
      <GitTool
        active={active === 'git'}
        post={postGit}
        listen={listenGit}
        showMenu={showMenu}
        closeMenu={closeMenu}
        onNewTabItems={gitItems}
        onTitle={gitTitle}
      />
      <FilesTool active={active === 'files'} />
      <TerminalTool
        active={active === 'terminal'}
        post={postTerminal}
        listen={listenTerminal}
        onCopy={copyText}
        onNewTabItems={terminalItems}
      />
    </>
  );
}
