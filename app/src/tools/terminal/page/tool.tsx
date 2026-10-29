import { useEffect, useRef, useState } from 'react';
import '@xterm/xterm/css/xterm.css';
import { loadXterm, TerminalView } from './view';
import type {
  TerminalToHost,
  TerminalToWebview,
  TerminalToWebviewOf,
} from '../shared/protocol';

export function TerminalTool({
  active,
  post,
  listen,
  onCopy,
}: {
  active: boolean;
  post: (message: TerminalToHost) => void;
  listen: (handler: (message: TerminalToWebview) => void) => () => void;
  onCopy: (text: string) => void;
}) {
  const screen = useRef<HTMLDivElement>(null);
  const view = useRef<TerminalView>(undefined);
  const [shown, setShown] = useState<string>();
  const [settings, setSettings] =
    useState<Omit<TerminalToWebviewOf<'settings'>, 'type'>>();

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
