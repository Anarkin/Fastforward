import './style.css';
import { createRoot } from 'react-dom/client';
import type { Bridge } from '../shared/bridge';
import { setKeyPlatform } from '../../lib/shared/keymap';
import type { ToHost, ToWebview } from '../shared/protocol';
import { App } from './App';
import { ErrorBoundary } from './errorBoundary';
import { windowButtonColor } from './windowTitle';
import { errorText } from '../../lib/page/errors';
import { installOverlayScrollbars } from '../../lib/page/overlayScrollbars';
import { watchDevicePixels } from '../../lib/page/devicePixels';
import { installTextCursors } from './textCursor';

declare global {
  interface Window {
    readonly fastforward: Bridge;
  }
}

const { fastforward } = window;
document.documentElement.dataset.platform = fastforward.platform;
setKeyPlatform(fastforward.platform);
fastforward.listenMaximized((maximized) =>
  document.documentElement.toggleAttribute('data-maximized', maximized),
);

const followTheme = () =>
  fastforward.setWindowButtonColor(
    windowButtonColor(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-foreground')
        .trim(),
    ),
  );
followTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener(
  'change',
  followTheme,
);
const post = (message: ToHost) => fastforward.post(message);
const listen = (handler: (message: ToWebview) => void) =>
  fastforward.listen(handler);

window.addEventListener('error', (event) =>
  post({
    type: 'log',
    level: 'error',
    message: errorText(event.error ?? event.message),
  }),
);
window.addEventListener('unhandledrejection', (event) =>
  post({ type: 'log', level: 'error', message: errorText(event.reason) }),
);

installOverlayScrollbars();
watchDevicePixels(() => undefined);
installTextCursors();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <ErrorBoundary
      title={fastforward.name}
      onError={(message) => post({ type: 'log', level: 'error', message })}
      listen={listen}
      onQuit={() => post({ type: 'quit' })}
    >
      <App
        name={fastforward.name}
        post={post}
        listen={listen}
        dropFiles={(files, tool, message) =>
          fastforward.dropFiles(files, tool, message)
        }
      />
    </ErrorBoundary>,
  );
}
