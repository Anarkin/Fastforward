import { useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';
import {
  appGroups,
  keymap,
  shortcutGroupsOf,
  tabGroups,
  type ShortcutGroup,
} from '../shared/keymap';
import type { TabInfo, ToHost, ToWebview } from '../shared/protocol';
import { strings } from '../../shared/strings';
import { tools, type ToolId, type ToWebviewOfTool } from '../shared/tools';
import { AboutPopup } from './aboutPopup';
import { ConfirmPopup } from './confirmPopup';
import { AppMenu } from './appMenu';
import { ContextMenu, type ContextMenuItem } from '../../ui/contextMenu';
import { ToolIcon } from '../../ui/icons';
import { Notices } from './notices';
import { OpenWithPopup } from './openWithPopup';
import { useBinding } from '../../ui/shortcuts';
import { ShortcutsPopup } from './shortcutsPopup';
import { createShellStore, ShellStore, type Confirming } from './store';
import { TabBar } from './tabBar';
import { useWindowTitle, windowTitle } from './titleBar';
import {
  toolShortcuts,
  viewerShortcuts,
  compareShortcuts,
  ToolViews,
  type ToolListeners,
} from './tools';

const newTabTrigger = '.tab-add';

export function emptyState(
  tabs: readonly TabInfo[] | undefined,
): React.ReactNode {
  return tabs?.length === 0 ? (
    <div className="empty-state">{strings.app.noTab}</div>
  ) : null;
}

export function newTabItems(
  items: Partial<Record<ToolId, readonly ContextMenuItem[]>>,
  onNewTab: (tool: ToolId) => void,
): ContextMenuItem[] {
  return tools.map((tool) => {
    const label = strings.tools[tool];
    const icon = <ToolIcon tool={tool} />;
    const submenu = items[tool];
    return submenu === undefined
      ? { label, icon, onClick: () => onNewTab(tool) }
      : { label, icon, submenu };
  });
}

export function confirmation(confirming: Confirming): {
  title: string;
  message: string;
  confirm: string;
} {
  return confirming.kind === 'tab'
    ? {
        title: strings.confirm.closeTitle,
        message: strings.confirm.closeTab(
          strings.tools[confirming.tab.tool],
          strings.tabs.label(confirming.tab.name, confirming.tab.folder),
        ),
        confirm: strings.confirm.close,
      }
    : {
        title: strings.confirm.quitTitle,
        message: strings.confirm.quitApp,
        confirm: strings.confirm.quit,
      };
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

function deliver<K extends ToolId>(
  listeners: ToolListeners,
  tool: K,
  message: ToWebviewOfTool<K>,
): void {
  for (const listener of listeners[tool]) {
    listener(message);
  }
}

interface Props {
  name: string;
  post: (message: ToHost) => void;
  listen: (handler: (message: ToWebview) => void) => () => void;
}

export function App({ name, post, listen }: Props) {
  const [store] = useState(() => createShellStore(post));
  const [listeners] = useState<ToolListeners>(() => ({
    terminal: new Set(),
    commander: new Set(),
    git: new Set(),
  }));
  const tabs = useStore(store, (state) => state.tabs);
  const active = useStore(store, (state) => state.active);
  const notices = useStore(store, (state) => state.notices);
  const update = useStore(store, (state) => state.update);
  const about = useStore(store, (state) => state.about);
  const installsCommand = useStore(store, (state) => state.installsCommand);
  const choosing = useStore(store, (state) => state.choosing);
  const popups = useStore(store, (state) => state.popups);
  const confirming = useStore(store, (state) => state.confirming);
  const openedMenu = useStore(store, (state) => state.menu);
  const toolItems = useStore(store, (state) => state.toolItems);
  const toolTitles = useStore(store, (state) => state.toolTitles);
  const {
    dismissNotice,
    showPopup,
    togglePopup,
    showMenu,
    closeMenu,
    closeTab,
    confirm,
    cancel,
    openWith,
    moveTab,
  } = store.getState();
  const closeShortcuts = useCallback(
    () => showPopup('shortcuts', false),
    [showPopup],
  );
  const closeAbout = useCallback(() => showPopup('about', false), [showPopup]);

  const activeTab = tabs?.find((tab) => tab.id === active);
  const activeTool = activeTab?.tool;

  useEffect(() => {
    const stop = listen((message) => {
      store.getState().receive(message);
      if (message.type === 'tool') {
        deliver(listeners, message.tool, message.message);
      }
    });
    post({ type: 'ready' });
    return stop;
  }, [post, listen, listeners, store]);

  const log = useCallback(
    (message: string) => post({ type: 'log', level: 'info', message }),
    [post],
  );

  const opened = openedMenu?.menu;
  const menu =
    opened?.trigger === newTabTrigger
      ? {
          ...opened,
          items: newTabItems(toolItems, (tool) =>
            post({ type: 'newTab', tool }),
          ),
        }
      : opened;

  const openNewTab = (event: React.MouseEvent) => {
    if (menu?.trigger === newTabTrigger) {
      closeMenu();
      return;
    }
    const button = event.currentTarget.getBoundingClientRect();
    showMenu({
      x: button.left,
      y: button.bottom,
      items: [],
      trigger: newTabTrigger,
    });
  };

  useBinding(keymap.shortcuts, () => togglePopup('shortcuts'));
  useBinding(
    keymap.dismissNotice,
    () => {
      const newest = notices.at(-1);
      if (newest !== undefined) {
        dismissNotice(newest.id);
      }
    },
    notices.length > 0,
  );
  useBinding(keymap.about, () => togglePopup('about'));
  useBinding(keymap.openIn, () => post({ type: 'openIn' }));
  useBinding(keymap.closeTab, () => {
    if (active !== undefined) {
      closeTab(active);
    }
  });

  useWindowTitle(
    windowTitle(
      (activeTool && toolTitles[activeTool]) ?? activeTab?.root,
      name,
    ),
  );

  return (
    <ShellStore value={store}>
      <div className="app">
        <TabBar
          tabs={tabs ?? []}
          active={active}
          onSelect={(tab) => post({ type: 'selectTab', tab })}
          onPreload={(tab) => post({ type: 'preloadTab', tab })}
          onClose={closeTab}
          onMove={moveTab}
          onAdd={openNewTab}
          adding={menu?.trigger === newTabTrigger}
          onLog={log}
          menu={
            <AppMenu
              update={update}
              onOpenSettings={() => post({ type: 'openSettings' })}
              onOpenDefaultSettings={() =>
                post({ type: 'openDefaultSettings' })
              }
              onShowShortcuts={() => showPopup('shortcuts', true)}
              onCheckForUpdates={() => post({ type: 'checkForUpdates' })}
              onInstallUpdate={() => post({ type: 'installUpdate' })}
              onShowAbout={() => showPopup('about', true)}
              onInstallCommand={
                installsCommand
                  ? () => post({ type: 'installTerminalCommand' })
                  : undefined
              }
            />
          }
        />
        {menu && openedMenu && (
          <ContextMenu key={openedMenu.id} menu={menu} onClose={closeMenu} />
        )}
        {popups.map((popup) => {
          switch (popup) {
            case 'shortcuts':
              return (
                <ShortcutsPopup
                  key={popup}
                  groups={shortcutGroupsFor(activeTool, activeTab)}
                  mac={document.documentElement.dataset.platform === 'darwin'}
                  onClose={closeShortcuts}
                />
              );
            case 'about':
              return (
                about && (
                  <AboutPopup
                    key={popup}
                    about={about}
                    onCopy={(text) => post({ type: 'copyText', text })}
                    onClose={closeAbout}
                  />
                )
              );
            case 'openWith':
              return (
                choosing && (
                  <OpenWithPopup
                    key={popup}
                    choice={choosing}
                    onOpen={openWith}
                    onClose={() => openWith(undefined)}
                  />
                )
              );
            default:
              return popup satisfies never;
          }
        })}
        {confirming && (
          <ConfirmPopup
            {...confirmation(confirming)}
            onConfirm={confirm}
            onCancel={cancel}
          />
        )}
        <Notices notices={notices} onDismiss={dismissNotice} />
        {emptyState(tabs)}
        <ToolViews
          active={activeTool}
          comparing={activeTab?.compare === true ? activeTab.id : undefined}
          post={post}
          listeners={listeners}
        />
      </div>
    </ShellStore>
  );
}
