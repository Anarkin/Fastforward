import { useEffect, useState } from 'react';
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
import { newTabTrigger, TabBar } from './tabBar';
import { useWindowTitle, windowTitle } from './titleBar';
import {
  toolShortcuts,
  viewerShortcuts,
  compareShortcuts,
  ToolViews,
  type ToolListeners,
} from './tools';

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
  const about = useStore(store, (state) => state.about);
  const choosing = useStore(store, (state) => state.choosing);
  const popups = useStore(store, (state) => state.popups);
  const confirming = useStore(store, (state) => state.confirming);
  const openedMenu = useStore(store, (state) => state.menu);
  const toolItems = useStore(store, (state) => state.toolItems);
  const toolTitles = useStore(store, (state) => state.toolTitles);
  const {
    dismissNotice,
    togglePopup,
    closeMenu,
    closeTab,
    confirm,
    cancel,
    copyText,
    ready,
    newTab,
    openIn,
  } = store.getState();
  const [closeShortcuts] = useState(
    () => () => store.getState().showPopup('shortcuts', false),
  );
  const [closeAbout] = useState(
    () => () => store.getState().showPopup('about', false),
  );

  const activeTab = tabs?.find((tab) => tab.id === active);
  const activeTool = activeTab?.tool;

  useEffect(() => {
    const stop = listen((message) => {
      store.getState().receive(message);
      if (message.type === 'tool') {
        deliver(listeners, message.tool, message.message);
      }
    });
    ready();
    return stop;
  }, [listen, listeners, store, ready]);

  const opened = openedMenu?.menu;
  const menu =
    opened?.trigger === newTabTrigger
      ? {
          ...opened,
          items: newTabItems(toolItems, newTab),
        }
      : opened;

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
  useBinding(keymap.openIn, openIn);
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
        <TabBar menu={<AppMenu />} />
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
                    onCopy={copyText}
                    onClose={closeAbout}
                  />
                )
              );
            case 'openWith':
              return (
                choosing && <OpenWithPopup key={popup} choice={choosing} />
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
        <Notices />
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
