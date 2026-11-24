import { useEffect, useEffectEvent, useRef, useState } from 'react';
import '@xterm/xterm/css/xterm.css';
import './style.css';
import { folderMenuItems } from './folderMenu';
import { loadXterm, TerminalView } from './view';
import { useShell, useShellActions } from '../../../shell/page/store';
import { useStore } from 'zustand';
import type { TerminalToHost, TerminalToWebview } from '../shared/protocol';
import { createTerminalStore } from './store';
import { pageCursorLook } from '../../../lib/page/cursor';
import { Toolbar } from '../../../lib/page/toolbar';
import { SearchButton } from '../../../lib/page/search';
import { PathTitle } from '../../../lib/page/pathTitle';
import { strings } from '../../../lib/shared/strings';

export function TerminalTool({
  active,
  post,
  listen,
}: {
  active: boolean;
  post: (message: TerminalToHost) => void;
  listen: (handler: (message: TerminalToWebview) => void) => () => void;
}) {
  const screen = useRef<HTMLDivElement>(null);
  const view = useRef<TerminalView>(undefined);
  const [store] = useState(() => createTerminalStore(post));
  const shown = useStore(store, (state) => state.shown);
  const settings = useStore(store, (state) => state.settings);
  const folders = useStore(store, (state) => state.folders);
  const {
    receive,
    listenScreen,
    send,
    newTab,
    browseFolders,
    openFolder,
    forgetFolder,
  } = store.getState();
  const scrolling = useShell((state) => state.scrolling);
  const folder = useShell(
    (state) => state.tabs?.find((tab) => tab.id === state.active)?.root,
  );
  const { copyText: onCopy, setToolItems } = useShellActions();
  const scrollingOf = useEffectEvent(() => scrolling);

  useEffect(
    () =>
      setToolItems(
        'terminal',
        folderMenuItems(folders, {
          onNew: newTab,
          onBrowse: browseFolders,
          onOpen: openFolder,
          onForget: forgetFolder,
        }),
      ),
    [folders, newTab, browseFolders, openFolder, forgetFolder, setToolItems],
  );

  useEffect(() => listen(receive), [listen, receive]);
  useEffect(
    () => listenScreen((message) => view.current?.receive(message)),
    [listenScreen],
  );

  useEffect(() => {
    const element = screen.current;
    if (!active || shown === undefined || settings === undefined || !element) {
      return undefined;
    }
    let disposed = false;
    void loadXterm().then((xterm) => {
      if (!disposed) {
        view.current = new TerminalView(xterm, element, {
          tab: shown,
          ...settings,
          post: send,
          onCopy,
          scrolling: scrollingOf,
          cursor: pageCursorLook(),
        });
      }
    });
    return () => {
      disposed = true;
      view.current?.dispose();
      view.current = undefined;
    };
  }, [active, shown, settings, send, onCopy]);

  useEffect(() => {
    view.current?.glide(scrolling.smooth);
  }, [scrolling.smooth]);

  return active ? (
    <div className="repository">
      <div className="columns bars-outside terminal-columns">
        <section className="column terminal">
          <header className="column-title">
            <Toolbar className="column-actions">
              <SearchButton
                title={strings.terminal.find}
                onClick={noop}
                disabled
              />
            </Toolbar>
          </header>
          <div className="path-row terminal-path">
            {folder !== undefined && <PathTitle path={folder} />}
          </div>
          <div className="column-body terminal-panel">
            <div className="terminal-screen" ref={screen} />
          </div>
        </section>
      </div>
    </div>
  ) : null;
}

const noop = () => {};
