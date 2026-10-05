import { createRoot } from 'react-dom/client';
import type { Bridge } from '../shared/bridge';
import type { ToHost, ToWebview } from '../shared/protocol';
import { App } from './App';
import { ErrorBoundary } from './errorBoundary';
import { errorText } from './errors';
import { installOverlayScrollbars } from './overlayScrollbars';
import './style.css';

declare global {
  interface Window {
    readonly fastforward: Bridge;
  }
}

const { fastforward } = window;
document.documentElement.dataset.platform = fastforward.platform;

const followTheme = () =>
  fastforward.setWindowButtonColor(
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-foreground')
      .trim(),
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

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <ErrorBoundary
      title={fastforward.name}
      onError={(message) => post({ type: 'log', level: 'error', message })}
    >
      <App name={fastforward.name} post={post} listen={listen} />
    </ErrorBoundary>,
  );
}
