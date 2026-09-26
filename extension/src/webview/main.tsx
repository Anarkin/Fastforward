import { createRoot } from 'react-dom/client';
import type { ToExtension } from '../protocol';
import { App } from './App';
import './style.css';

declare function acquireVsCodeApi(): {
  postMessage(message: ToExtension): void;
};

const vscode = acquireVsCodeApi();
const post = (message: ToExtension) => vscode.postMessage(message);

window.addEventListener('error', (event) =>
  post({
    type: 'log',
    level: 'error',
    message: String(event.error ?? event.message),
  }),
);
window.addEventListener('unhandledrejection', (event) =>
  post({ type: 'log', level: 'error', message: String(event.reason) }),
);

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App post={post} />);
}
