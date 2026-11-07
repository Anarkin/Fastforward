import { useCallback } from 'react';
import {
  compareGroups,
  compareKeymap,
  gitGroups,
  gitKeymap,
} from '../../tools/git/shared/keymap';
import type { GitToHost, GitToWebview } from '../../tools/git/shared/protocol';
import { shortcutGroupsOf, type ShortcutGroup } from '../shared/keymap';
import type { ToHost } from '../shared/protocol';
import { strings } from '../../shared/strings';
import type { ToolId, ToWebviewOfTool } from '../shared/tools';
import { CommanderTool } from '../../tools/commander/page/tool';
import {
  commanderGroups,
  viewerGroups,
  viewerKeymap,
  commanderKeymap,
} from '../../tools/commander/shared/keymap';
import type {
  CommanderToHost,
  CommanderToWebview,
} from '../../tools/commander/shared/protocol';
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
import { activeTabOf, useShell } from './store';

export type ToolListeners = {
  readonly [K in ToolId]: Set<(message: ToWebviewOfTool<K>) => void>;
};

export const toolShortcuts: Readonly<Record<ToolId, readonly ShortcutGroup[]>> =
  {
    terminal: shortcutGroupsOf(
      terminalGroups,
      strings.shortcuts.groups,
      terminalKeymap,
    ),
    commander: shortcutGroupsOf(
      commanderGroups,
      strings.shortcuts.groups,
      commanderKeymap,
    ),
    git: shortcutGroupsOf(gitGroups, strings.shortcuts.groups, gitKeymap),
  };

export const compareShortcuts: readonly ShortcutGroup[] = shortcutGroupsOf(
  compareGroups,
  strings.shortcuts.groups,
  compareKeymap,
);

export const viewerShortcuts: readonly ShortcutGroup[] = shortcutGroupsOf(
  viewerGroups,
  strings.shortcuts.groups,
  viewerKeymap,
);

export function ToolViews({
  post,
  listeners,
}: {
  post: (message: ToHost) => void;
  listeners: ToolListeners;
}) {
  const active = useShell((state) => activeTabOf(state)?.tool);
  const comparing = useShell((state) => {
    const tab = activeTabOf(state);
    return tab?.compare === true ? tab.id : undefined;
  });
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
  const postCommander = useCallback(
    (message: CommanderToHost) =>
      post({ type: 'tool', tool: 'commander', message }),
    [post],
  );
  const listenCommander = useCallback(
    (handler: (message: CommanderToWebview) => void) => {
      listeners.commander.add(handler);
      return () => {
        listeners.commander.delete(handler);
      };
    },
    [listeners],
  );
  return (
    <>
      <TerminalTool
        active={active === 'terminal'}
        post={postTerminal}
        listen={listenTerminal}
      />
      <CommanderTool
        active={active === 'commander'}
        post={postCommander}
        listen={listenCommander}
      />
      <GitTool
        active={active === 'git'}
        post={postGit}
        listen={listenGit}
        comparing={comparing}
      />
    </>
  );
}
