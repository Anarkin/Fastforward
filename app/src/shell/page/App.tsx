import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { DateFormat } from '../../ui/dates';
import {
  appGroups,
  keymap,
  shortcutGroupsOf,
  tabGroups,
  type ShortcutGroup,
} from '../shared/keymap';
import { addNotice } from '../shared/notices';
import type {
  AboutInfo,
  TabInfo,
  ToHost,
  ToWebview,
  ToWebviewOf,
  UpdateStatus,
} from '../shared/protocol';
import { strings } from '../../shared/strings';
import {
  confirmsClose,
  tools,
  type ToolId,
  type ToWebviewOfTool,
} from '../shared/tools';
import { AboutPopup } from './aboutPopup';
import { ConfirmPopup } from './confirmPopup';
import { AppMenu } from './appMenu';
import {
  ContextMenu,
  type ContextMenuItem,
  type OpenMenu,
} from '../../ui/contextMenu';
import { ToolIcon } from '../../ui/icons';
import { Notices, type Notice } from './notices';
import { OpenWithPopup } from './openWithPopup';
import { useBinding } from '../../ui/shortcuts';
import { ShortcutsPopup } from './shortcutsPopup';
import { movedTab, TabBar } from './tabBar';
import { useWindowTitle, windowTitle } from './titleBar';
import { toolShortcuts, ToolViews, type ToolListeners } from './tools';

const newTabTrigger = '.tab-add';

export function emptyState(
  tabs: readonly TabInfo[] | undefined,
): React.ReactNode {
  return tabs?.length === 0 ? (
    <div className="empty-state">{strings.app.noTab}</div>
  ) : null;
}

interface TabMenu {
  readonly tab: string | undefined;
  readonly menu: OpenMenu;
  readonly id: number;
}

export function nextMenu(
  previous: TabMenu | undefined,
  tab: string | undefined,
  menu: OpenMenu,
): TabMenu {
  return { tab, menu, id: (previous?.id ?? 0) + 1 };
}

export function menuIn(
  opened: TabMenu | undefined,
  tab: string | undefined,
): OpenMenu | undefined {
  return opened !== undefined && opened.tab === tab ? opened.menu : undefined;
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

type Popup = 'shortcuts' | 'about' | 'openWith';

type Confirming =
  { readonly kind: 'tab'; readonly tab: TabInfo } | { readonly kind: 'quit' };

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

export function withPopup(
  shown: readonly Popup[],
  popup: Popup,
  open: boolean,
): readonly Popup[] {
  if (shown.includes(popup) === open) {
    return shown;
  }
  return open ? [...shown, popup] : shown.filter((other) => other !== popup);
}

export function shortcutGroupsFor(tool: ToolId | undefined): ShortcutGroup[] {
  return [
    ...[
      ...shortcutGroupsOf(tabGroups, strings.shortcuts.groups, keymap),
      ...shortcutGroupsOf(appGroups, strings.shortcuts.groups, keymap),
    ].map((group) => ({ ...group, pinned: true })),
    ...(tool === undefined ? [] : toolShortcuts[tool]),
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
  const [tabs, setTabs] = useState<readonly TabInfo[]>();
  const [active, setActive] = useState<string>();
  const [notices, setNotices] = useState<readonly Notice[]>([]);
  const noticeCount = useRef(0);
  const dismissNotice = useCallback(
    (id: number) =>
      setNotices((shown) => shown.filter((notice) => notice.id !== id)),
    [],
  );
  const [update, setUpdate] = useState<UpdateStatus>({ kind: 'idle' });
  const [about, setAbout] = useState<AboutInfo>();
  const [installsCommand, setInstallsCommand] = useState(false);
  const [autoSortTabs, setAutoSortTabs] = useState(false);
  const [dateFormat, setDateFormat] = useState(useContext(DateFormat));
  const [choosing, setChoosing] = useState<ToWebviewOf<'chooseTool'>>();
  const [toolItems, setToolItems] = useState<
    Partial<Record<ToolId, readonly ContextMenuItem[]>>
  >({});
  const [toolTitles, setToolTitles] = useState<Partial<Record<ToolId, string>>>(
    {},
  );
  const [openedMenu, setMenu] = useState<TabMenu>();
  const [popups, setPopups] = useState<readonly Popup[]>([]);
  const [confirming, setConfirming] = useState<Confirming>();
  const showPopup = useCallback(
    (popup: Popup, open: boolean) =>
      setPopups((shown) => withPopup(shown, popup, open)),
    [],
  );
  const togglePopup = (popup: Popup) =>
    setPopups((shown) => withPopup(shown, popup, !shown.includes(popup)));
  const closeShortcuts = useCallback(
    () => showPopup('shortcuts', false),
    [showPopup],
  );
  const closeAbout = useCallback(() => showPopup('about', false), [showPopup]);
  const [listeners] = useState<ToolListeners>(() => ({
    terminal: new Set(),
    commander: new Set(),
    git: new Set(),
  }));

  const activeTab = tabs?.find((tab) => tab.id === active);
  const activeTool = activeTab?.tool;

  useEffect(() => {
    const onMessage = (message: ToWebview) => {
      switch (message.type) {
        case 'tabs':
          setTabs(message.tabs);
          setActive(message.active);
          break;
        case 'autoSortTabs':
          setAutoSortTabs(message.on);
          break;
        case 'dateFormat':
          setDateFormat(message.format);
          break;
        case 'notice': {
          const id = ++noticeCount.current;
          setNotices((shown) =>
            addNotice(shown, {
              id,
              level: message.level,
              message: message.message,
              shownAt: performance.now(),
            }),
          );
          break;
        }
        case 'update':
          setUpdate(message.status);
          break;
        case 'about':
          setAbout(message);
          break;
        case 'terminalCommand':
          setInstallsCommand(message.installable);
          break;
        case 'confirmQuit':
          setConfirming({ kind: 'quit' });
          break;
        case 'chooseTool':
          setChoosing(message);
          setPopups((shown) => withPopup(shown, 'openWith', true));
          break;
        case 'tool':
          deliver(listeners, message.tool, message.message);
          break;
      }
    };
    const stop = listen(onMessage);
    post({ type: 'ready' });
    return stop;
  }, [post, listen, listeners]);

  const log = useCallback(
    (message: string) => post({ type: 'log', level: 'info', message }),
    [post],
  );

  const onNewTabItems = useCallback(
    (tool: ToolId, items: readonly ContextMenuItem[]) =>
      setToolItems((all) => ({ ...all, [tool]: items })),
    [],
  );
  const onTitle = useCallback(
    (tool: ToolId, title: string | undefined) =>
      setToolTitles((all) => ({ ...all, [tool]: title })),
    [],
  );

  const openedIn = menuIn(openedMenu, active);
  const menu =
    openedIn?.trigger === newTabTrigger
      ? {
          ...openedIn,
          items: newTabItems(toolItems, (tool) =>
            post({ type: 'newTab', tool }),
          ),
        }
      : openedIn;
  if (openedMenu && !menu) {
    setMenu(undefined);
  }
  const closeMenu = useCallback(() => setMenu(undefined), []);
  const showMenu = useCallback(
    (opened: OpenMenu) =>
      setMenu((previous) => nextMenu(previous, active, opened)),
    [active],
  );

  const openNewTab = (event: React.MouseEvent) => {
    if (menu?.trigger === newTabTrigger) {
      setMenu(undefined);
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
  useBinding(keymap.about, () => togglePopup('about'));
  useBinding(keymap.openIn, () => post({ type: 'openIn' }));
  const closeTab = (id: string) => {
    const tab = tabs?.find((each) => each.id === id);
    if (tab !== undefined && confirmsClose[tab.tool]) {
      setConfirming({ kind: 'tab', tab });
    } else {
      post({ type: 'closeTab', tab: id });
    }
  };
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
    <div className="app">
      <TabBar
        tabs={tabs ?? []}
        active={active}
        onSelect={(tab) => post({ type: 'selectTab', tab })}
        onPreload={(tab) => post({ type: 'preloadTab', tab })}
        onClose={closeTab}
        onMove={
          autoSortTabs
            ? undefined
            : (tab, index) => {
                setTabs((shown) => shown && movedTab(shown, tab, index));
                post({ type: 'moveTab', tab, index });
              }
        }
        onAdd={openNewTab}
        adding={menu?.trigger === newTabTrigger}
        onLog={log}
        menu={
          <AppMenu
            update={update}
            autoSortTabs={autoSortTabs}
            onAutoSortTabs={(on) => {
              setAutoSortTabs(on);
              post({ type: 'setAutoSortTabs', on });
            }}
            onSort={() => post({ type: 'sortTabs' })}
            onOpenSettings={() => post({ type: 'openSettings' })}
            onOpenDefaultSettings={() => post({ type: 'openDefaultSettings' })}
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
                groups={shortcutGroupsFor(activeTool)}
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
                  onOpen={(tool) => {
                    setChoosing(undefined);
                    showPopup('openWith', false);
                    post({ type: 'openWith', tool });
                  }}
                  onClose={() => {
                    setChoosing(undefined);
                    showPopup('openWith', false);
                    post({ type: 'openWith', tool: undefined });
                  }}
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
          onConfirm={() => {
            setConfirming(undefined);
            post(
              confirming.kind === 'tab'
                ? { type: 'closeTab', tab: confirming.tab.id }
                : { type: 'quit' },
            );
          }}
          onCancel={() => setConfirming(undefined)}
        />
      )}
      <Notices notices={notices} onDismiss={dismissNotice} />
      {emptyState(tabs)}
      <DateFormat value={dateFormat}>
        <ToolViews
          active={activeTool}
          post={post}
          listeners={listeners}
          showMenu={showMenu}
          closeMenu={closeMenu}
          onNewTabItems={onNewTabItems}
          onTitle={onTitle}
        />
      </DateFormat>
    </div>
  );
}
