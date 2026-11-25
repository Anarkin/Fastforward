import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import '@xterm/xterm/css/xterm.css';
import './style.css';
import { folderMenuItems } from './folderMenu';
import { loadXterm, TerminalView } from './view';
import { useShell, useShellActions } from '../../../shell/page/store';
import { useStore } from 'zustand';
import type { TerminalToHost, TerminalToWebview } from '../shared/protocol';
import { createTerminalStore } from './store';
import { pageCursorLook } from '../../../lib/page/cursor';
import { FloatingSearch } from '../../../lib/page/floatingSearch';
import { SearchBar } from '../../../lib/page/searchBar';
import { keyPressed } from '../../../lib/page/shortcuts';
import { terminalKeymap } from './keymap';

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
  const find = useStore(store, (state) =>
    state.shown === undefined ? undefined : state.finds.get(state.shown),
  );
  const findInput = useRef<HTMLInputElement>(null);
  const asked = find?.asked;
  const answered = useRef(asked);
  useLayoutEffect(() => {
    if (asked !== undefined && asked !== answered.current) {
      findInput.current?.focus();
      findInput.current?.select();
    }
    answered.current = asked;
  }, [asked]);
  const {
    receive,
    listenScreen,
    send,
    newTab,
    browseFolders,
    openFolder,
    forgetFolder,
    openFind,
    findFor,
    foundFor,
    closeFind,
  } = store.getState();
  const scrolling = useShell((state) => state.scrolling);
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
          onFind: (selected) => openFind(shown, selected),
          onFound: (found) => foundFor(shown, found),
        });
        const kept = store.getState().finds.get(shown);
        if (kept !== undefined) {
          view.current.find(kept.query, kept.options, 0);
        }
      }
    });
    return () => {
      disposed = true;
      view.current?.dispose();
      view.current = undefined;
    };
  }, [active, shown, settings, send, onCopy, openFind, foundFor, store]);

  const query = find?.query;
  const options = find?.options;
  useEffect(() => {
    if (query !== undefined && options !== undefined) {
      view.current?.find(query, options, 0);
    }
  }, [query, options]);

  const stopFinding = () => {
    if (shown !== undefined) {
      closeFind(shown);
    }
    view.current?.stopFinding();
    view.current?.focus();
  };

  useEffect(() => {
    view.current?.glide(scrolling.smooth);
  }, [scrolling.smooth]);

  return active ? (
    <div className="repository">
      <div className="columns terminal-columns">
        <section className="column terminal search-scope">
          <div className="column-body terminal-panel search-area">
            <div className="terminal-screen" ref={screen} />
          </div>
          {find !== undefined && shown !== undefined && (
            <FloatingSearch>
              <SearchBar
                font="monospace"
                query={find.query}
                options={find.options}
                found={find.found}
                input={findInput}
                onQuery={(next) => findFor(shown, next, find.options)}
                onOptions={(next) => findFor(shown, find.query, next)}
                onStep={(step) =>
                  view.current?.find(find.query, find.options, step)
                }
                onClose={stopFinding}
                onKeyDown={(event) => {
                  const step = keyPressed(terminalKeymap.match, event);
                  if (step !== undefined) {
                    event.preventDefault();
                    view.current?.find(find.query, find.options, step);
                  } else if (
                    keyPressed(terminalKeymap.stopFinding, event) !== undefined
                  ) {
                    event.preventDefault();
                    stopFinding();
                  }
                }}
              />
            </FloatingSearch>
          )}
        </section>
      </div>
    </div>
  ) : null;
}
