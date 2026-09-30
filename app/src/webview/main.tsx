import { createRoot } from 'react-dom/client';
import type { ToHost, ToWebview } from '../shared/protocol';
import { App } from './App';
import { errorText } from './errors';
import { installOverlayScrollbars } from './overlayScrollbars';
import './theme.css';
import './style.css';

declare global {
  interface Window {
    readonly fastforward: {
      readonly platform: string;
      post(message: ToHost): void;
      setWindowButtonColor(color: string): void;
      listen(handler: (message: ToWebview) => void): () => void;
    };
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
  createRoot(root).render(<App post={post} listen={listen} />);
}
