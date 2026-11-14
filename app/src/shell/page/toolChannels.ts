import type { ToHost } from '../shared/protocol';
import type { ToHostOf, ToolId, ToWebviewOfTool } from '../shared/tools';

interface ToolChannel<K extends ToolId> {
  readonly post: (message: ToHostOf<K>) => void;
  readonly dropFiles: (files: readonly File[], message: unknown) => void;
  readonly listen: (
    handler: (message: ToWebviewOfTool<K>) => void,
  ) => () => void;
}

export type ToolChannels = { readonly [K in ToolId]: ToolChannel<K> };

type ToolListeners = {
  readonly [K in ToolId]: Set<(message: ToWebviewOfTool<K>) => void>;
};

function listening<M>(
  listeners: Set<(message: M) => void>,
  handler: (message: M) => void,
): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
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

export function toolChannels(
  post: (message: ToHost) => void,
  dropFiles: (files: readonly File[], tool: ToolId, message: unknown) => void,
): {
  readonly channels: ToolChannels;
  readonly deliver: <K extends ToolId>(
    tool: K,
    message: ToWebviewOfTool<K>,
  ) => void;
} {
  const listeners: ToolListeners = {
    terminal: new Set(),
    commander: new Set(),
    git: new Set(),
  };
  const channels: ToolChannels = {
    terminal: {
      post: (message) => post({ type: 'tool', tool: 'terminal', message }),
      dropFiles: (files, message) => dropFiles(files, 'terminal', message),
      listen: (handler) => listening(listeners.terminal, handler),
    },
    commander: {
      post: (message) => post({ type: 'tool', tool: 'commander', message }),
      dropFiles: (files, message) => dropFiles(files, 'commander', message),
      listen: (handler) => listening(listeners.commander, handler),
    },
    git: {
      post: (message) => post({ type: 'tool', tool: 'git', message }),
      dropFiles: (files, message) => dropFiles(files, 'git', message),
      listen: (handler) => listening(listeners.git, handler),
    },
  };
  return {
    channels,
    deliver: (tool, message) => deliver(listeners, tool, message),
  };
}
