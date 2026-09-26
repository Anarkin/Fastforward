import { createRoot } from 'react-dom/client';
import type { ToExtension } from '../protocol';
import { App } from './App';
import './style.css';

declare function acquireVsCodeApi(): {
  postMessage(message: ToExtension): void;
};

const vscode = acquireVsCodeApi();
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <App post={(message) => vscode.postMessage(message)} />,
  );
}
