import { useEffect, useState } from 'react';
import { keymap } from '../shared/keymap';
import type { ToHost, ToWebview } from '../shared/protocol';
import { strings, type Line } from '../../lib/shared/strings';
import { tools, type ToolId } from '../shared/tools';
import { AboutPopup } from './aboutPopup';
import { ConfirmPopup } from './confirmPopup';
import { AppMenu } from './appMenu';
import { ContextMenu, type ContextMenuItem } from '../../lib/page/contextMenu';
import { ToolIcon } from '../../lib/page/icons';
import { Notices } from './notices';
import { OpenWithPopup } from './openWithPopup';
import { useBinding } from '../../lib/page/shortcuts';
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
  lines?: readonly Line[];
  note?: string;
  confirm: string;
  dontSave?: true;
} {
  switch (confirming.kind) {
    case 'unsavedTab':
      return {
        title: strings.confirm.saveTitle,
        message: strings.confirm.saveFile,
        lines: strings.confirm.filesLines([confirming.tab.name]),
        confirm: strings.confirm.save,
        dontSave: true,
      };
    case 'tab':
      return {
        title: strings.confirm.closeTitle,
        message: strings.confirm.closeTab(strings.tools[confirming.tab.tool]),
        lines: strings.confirm.closeTabLines(
          strings.tabs.label(confirming.tab.name, confirming.tab.folder),
        ),
        confirm: strings.confirm.close,
      };
    case 'window':
      return confirming.unsaved === undefined
        ? {
            title: strings.confirm.closeWindowTitle,
            message: strings.confirm.closeWindow,
            confirm: strings.confirm.close,
          }
        : {
            title: strings.confirm.closeWindowTitle,
            message: strings.confirm.saveWindowFiles,
            lines: strings.confirm.filesLines(confirming.unsaved),
            confirm: strings.confirm.saveAll,
            dontSave: true,
          };
    case 'quit':
      return {
        title: strings.confirm.quitTitle,
        message:
          confirming.unsaved === undefined
            ? strings.confirm.quitApp
            : strings.confirm.saveQuitFiles,
        ...(confirming.unsaved !== undefined && {
          lines: strings.confirm.filesLines(confirming.unsaved),
        }),
        ...(confirming.note !== undefined && { note: confirming.note }),
        confirm:
          confirming.unsaved === undefined
            ? strings.confirm.quit
            : strings.confirm.saveAll,
        ...(confirming.unsaved !== undefined && { dontSave: true as const }),
      };
    default:
      return confirming satisfies never;
  }
}

function ShellConfirm({
  confirming,
  onConfirm,
  onDontSave,
  onCancel,
}: {
  readonly confirming: Confirming;
  readonly onConfirm: () => void;
  readonly onDontSave: () => void;
  readonly onCancel: () => void;
}) {
  const { dontSave, ...asked } = confirmation(confirming);
  return (
    <ConfirmPopup
      {...asked}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...(dontSave === true && {
        extra: { label: strings.confirm.dontSave, onClick: onDontSave },
      })}
    />
  );
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
  dropFiles?: (files: readonly File[], tool: ToolId, message: unknown) => void;
}

function WindowTitle({ name }: { name: string }) {
  const title = useShell((state) => {
    const tab = activeTabOf(state);
    return windowTitle((tab && state.toolTitles[tab.tool]) ?? tab?.root, name);
  });
  useWindowTitle(title);
  return null;
}

function Popups() {
  const aboutKnown = useShell((state) => state.about !== undefined);
  const popups = useShell((state) => state.popups);
  const confirming = useShell((state) => state.confirming);
  const { confirm, dontSave, cancel } = useShellActions();
  return (
    <>
      {popups.map((popup) => {
        switch (popup) {
          case 'shortcuts':
            return <ShortcutsPopup key={popup} />;
          case 'about':
            return aboutKnown && <AboutPopup key={popup} />;
          case 'openWith':
            return <OpenWithPopup key={popup} />;
          case 'confirm':
            return (
              confirming && (
                <ShellConfirm
                  key={popup}
                  confirming={confirming}
                  onConfirm={confirm}
                  onDontSave={dontSave}
                  onCancel={cancel}
                />
              )
            );
          default:
            return popup satisfies never;
        }
      })}
    </>
  );
}

function EmptyState() {
  const noTab = useShell((state) => state.tabs?.length === 0);
  return emptyState(noTab);
}

function NoticeKey() {
  const newest = useShell((state) => state.notices.at(-1)?.id);
  const { dismissNotice } = useShellActions();
  useBinding(
    keymap.dismissNotice,
    () => {
      if (newest !== undefined) {
        dismissNotice(newest);
      }
    },
    newest !== undefined,
  );
  return null;
}

export function App({ name, post, listen, dropFiles }: Props) {
  const [store] = useState(() => createShellStore(post, {}, dropFiles));
  const { togglePopup, closeTab, ready, openIn, newWindow } = store.getState();

  useEffect(() => {
    const stop = listen(store.getState().receive);
    ready();
    return stop;
  }, [listen, store, ready]);

  useBinding(keymap.shortcuts, () => togglePopup('shortcuts'));
  useBinding(keymap.about, () => togglePopup('about'));
  useBinding(keymap.openIn, openIn);
  useBinding(keymap.newWindow, newWindow);
  useBinding(keymap.closeTab, () => {
    const { active } = store.getState();
    if (active !== undefined) {
      closeTab(active);
    }
  });

  return (
    <ShellStore value={store}>
      <div className="app">
        <WindowTitle name={name} />
        <TabBar menu={<AppMenu />} />
        <ShellMenu />
        <Popups />
        <Notices />
        <EmptyState />
        <ToolViews />
        <NoticeKey />
      </div>
    </ShellStore>
  );
}
