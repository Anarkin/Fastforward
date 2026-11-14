import { useEffect, useState } from 'react';
import { shellKeymap } from '../shared/keymap';
import type { ToHost, ToWebview } from '../shared/protocol';
import { strings } from '../../lib/shared/strings';
import { type ToolId } from '../shared/tools';
import { AboutPopup } from './aboutPopup';
import { ConfirmPopup } from './confirmPopup';
import { AppMenu } from './appMenu';
import { ContextMenu } from '../../lib/page/contextMenu';
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
import { newTabTrigger } from './tabStrip';
import { TabBar } from './tabBar';
import { useWindowTitle, windowTitle } from './windowTitle';
import { ToolViews } from './tools';
import { confirmation, newTabItems } from './appItems';

export function EmptyStateView({ noTab }: { readonly noTab: boolean }) {
  return noTab ? <div className="empty-state">{strings.app.noTab}</div> : null;
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
  return <EmptyStateView noTab={noTab} />;
}

function NoticeKey() {
  const newest = useShell((state) => state.notices.at(-1)?.id);
  const { dismissNotice } = useShellActions();
  useBinding(
    shellKeymap.dismissNotice,
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

  useBinding(shellKeymap.shortcuts, () => togglePopup('shortcuts'));
  useBinding(shellKeymap.about, () => togglePopup('about'));
  useBinding(shellKeymap.openIn, openIn);
  useBinding(shellKeymap.newWindow, newWindow);
  useBinding(shellKeymap.closeTab, () => {
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
