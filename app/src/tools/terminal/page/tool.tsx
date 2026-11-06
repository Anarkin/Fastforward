import { useEffect, useEffectEvent, useRef, useState } from 'react';
import '@xterm/xterm/css/xterm.css';
import './style.css';
import { folderMenuItems } from './folderMenu';
import { loadXterm, TerminalView } from './view';
import { useShell, useShellActions } from '../../../shell/page/store';
import type {
  TerminalToHost,
  TerminalToWebview,
  TerminalToWebviewOf,
} from '../shared/protocol';

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
  const [shown, setShown] = useState<string>();
  const [settings, setSettings] =
    useState<Omit<TerminalToWebviewOf<'settings'>, 'type'>>();
  const [folders, setFolders] = useState<readonly string[]>([]);
  const scrolling = useShell((state) => state.scrolling);
  const { copyText: onCopy, setToolItems } = useShellActions();
  const scrollingOf = useEffectEvent(() => scrolling);

  useEffect(
    () =>
      setToolItems(
        'terminal',
        folderMenuItems(folders, {
          onNew: () => post({ type: 'newTab' }),
          onBrowse: () => post({ type: 'browseFolders' }),
          onOpen: (folder) => post({ type: 'openFolder', folder }),
          onForget: (folder) => {
            setFolders((listed) => listed.filter((other) => other !== folder));
            post({ type: 'forgetFolder', folder });
          },
        }),
      ),
    [folders, post, setToolItems],
  );

  useEffect(
    () =>
      listen((message) => {
        switch (message.type) {
          case 'settings':
            setSettings({
              renderer: message.renderer,
              scrollback: message.scrollback,
              minimumContrastRatio: message.minimumContrastRatio,
              windowsPty: message.windowsPty,
            });
            return;
          case 'show':
            setShown(message.tab);
            return;
          case 'hide':
            setShown(undefined);
            return;
          case 'folders':
            setFolders(message.folders);
            return;
          default:
            view.current?.receive(message);
        }
      }),
    [listen],
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
          post,
          onCopy,
          scrolling: scrollingOf,
        });
      }
    });
    return () => {
      disposed = true;
      view.current?.dispose();
      view.current = undefined;
    };
  }, [active, shown, settings, post, onCopy]);

  useEffect(() => {
    view.current?.glide(scrolling.smooth);
  }, [scrolling.smooth]);

  return active ? (
    <div className="repository terminal-panel">
      <div className="terminal-screen" ref={screen} />
    </div>
  ) : null;
}
