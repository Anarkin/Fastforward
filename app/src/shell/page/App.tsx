import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { keymap } from '../shared/keymap';
import type { ToHost, ToWebview } from '../shared/protocol';
import { strings } from '../../shared/strings';
import { tools, type ToolId } from '../shared/tools';
import { AboutPopup } from './aboutPopup';
import { ConfirmPopup } from './confirmPopup';
import { AppMenu } from './appMenu';
import { ContextMenu, type ContextMenuItem } from '../../ui/contextMenu';
import { ToolIcon } from '../../ui/icons';
import { Notices } from './notices';
import { OpenWithPopup } from './openWithPopup';
import { useBinding } from '../../ui/shortcuts';
import { ShortcutsPopup } from './shortcutsPopup';
import {
  activeTabOf,
  createShellStore,
  ShellStore,
  useShell,
  useShellActions,
  type Confirming,
} from './store';
import { newTabTrigger, TabBar } from './tabBar';
import { useWindowTitle, windowTitle } from './titleBar';
import { ToolViews } from './tools';

export function emptyState(noTab: boolean): React.ReactNode {
  return noTab ? <div className="empty-state">{strings.app.noTab}</div> : null;
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

function ShellMenu() {
  const opened = useShell((state) => state.menu);
  const toolItems = useShell((state) => state.toolItems);
  const { closeMenu, newTab } = useShellActions();
  if (opened === undefined) {
    return null;
  }
  const { menu } = opened;
  return (
    <ContextMenu
      key={opened.id}
      menu={
        menu.trigger === newTabTrigger
          ? { ...menu, items: newTabItems(toolItems, newTab) }
          : menu
      }
      onClose={closeMenu}
    />
  );
}

interface Props {
  name: string;
  post: (message: ToHost) => void;
  listen: (handler: (message: ToWebview) => void) => () => void;
}

export function App({ name, post, listen }: Props) {
  const [store] = useState(() => createShellStore(post));
  const noTab = useStore(store, (state) => state.tabs?.length === 0);
  const title = useStore(store, (state) => {
    const tab = activeTabOf(state);
    return windowTitle((tab && state.toolTitles[tab.tool]) ?? tab?.root, name);
  });
  const newestNotice = useStore(store, (state) => state.notices.at(-1)?.id);
  const aboutKnown = useStore(store, (state) => state.about !== undefined);
  const popups = useStore(store, (state) => state.popups);
  const confirming = useStore(store, (state) => state.confirming);
  const {
    togglePopup,
    dismissNotice,
    closeTab,
    confirm,
    cancel,
    ready,
    openIn,
  } = store.getState();

  useEffect(() => {
    const stop = listen(store.getState().receive);
    ready();
    return stop;
  }, [listen, store, ready]);

  useBinding(keymap.shortcuts, () => togglePopup('shortcuts'));
  useBinding(
    keymap.dismissNotice,
    () => {
      if (newestNotice !== undefined) {
        dismissNotice(newestNotice);
      }
    },
    newestNotice !== undefined,
  );
  useBinding(keymap.about, () => togglePopup('about'));
  useBinding(keymap.openIn, openIn);
  useBinding(keymap.closeTab, () => {
    const { active } = store.getState();
    if (active !== undefined) {
      closeTab(active);
    }
  });

  useWindowTitle(title);

  return (
    <ShellStore value={store}>
      <div className="app">
        <TabBar menu={<AppMenu />} />
        <ShellMenu />
        {popups.map((popup) => {
          switch (popup) {
            case 'shortcuts':
              return <ShortcutsPopup key={popup} />;
            case 'about':
              return aboutKnown && <AboutPopup key={popup} />;
            case 'openWith':
              return <OpenWithPopup key={popup} />;
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
        {emptyState(noTab)}
        <ToolViews />
      </div>
    </ShellStore>
  );
}
