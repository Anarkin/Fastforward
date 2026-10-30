import { useEffect, useRef, useState } from 'react';
import '@xterm/xterm/css/xterm.css';
import { folderMenuItems } from './folderMenu';
import { loadXterm, TerminalView } from './view';
import type {
  TerminalToHost,
  TerminalToWebview,
  TerminalToWebviewOf,
} from '../shared/protocol';
import type { ContextMenuItem } from '../../../ui/contextMenu';

export function TerminalTool({
  active,
  post,
  listen,
  onCopy,
  onNewTabItems,
}: {
  active: boolean;
  post: (message: TerminalToHost) => void;
  listen: (handler: (message: TerminalToWebview) => void) => () => void;
  onCopy: (text: string) => void;
  onNewTabItems: (items: readonly ContextMenuItem[]) => void;
}) {
  const screen = useRef<HTMLDivElement>(null);
  const view = useRef<TerminalView>(undefined);
  const [shown, setShown] = useState<string>();
  const [settings, setSettings] =
    useState<Omit<TerminalToWebviewOf<'settings'>, 'type'>>();
  const [folders, setFolders] = useState<readonly string[]>([]);

  useEffect(
    () =>
      onNewTabItems(
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
    [folders, post, onNewTabItems],
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
    if (!active) {
      setShown(undefined);
    }
  }, [active]);

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
        });
      }
    });
    return () => {
      disposed = true;
      view.current?.dispose();
      view.current = undefined;
    };
  }, [active, shown, settings, post, onCopy]);

  return active ? (
    <div className="repository terminal-panel">
      <div className="terminal-screen" ref={screen} />
    </div>
  ) : null;
}
