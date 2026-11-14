import {
  contextBridge,
  ipcRenderer,
  webUtils,
  type IpcRendererEvent,
} from 'electron';
import type { Bridge } from '../shell/shared/bridge';
import type { ToWebview } from '../shell/shared/protocol';
import { brand } from '../lib/shared/strings';
import { appNameSwitch } from '../shell/shared/titleBar';

contextBridge.exposeInMainWorld('fastforward', {
  platform: process.platform,
  name:
    process.argv
      .find((arg) => arg.startsWith(appNameSwitch))
      ?.slice(appNameSwitch.length) ?? brand,
  post: (message) => ipcRenderer.send('message', message),
  dropFiles: (files, tool, message) =>
    ipcRenderer.send(
      'dropFiles',
      files
        .map((file) => webUtils.getPathForFile(file))
        .filter((file) => file !== ''),
      tool,
      message,
    ),
  listen: (handler) => {
    const listener = (_event: IpcRendererEvent, message: ToWebview) =>
      handler(message);
    ipcRenderer.on('message', listener);
    return () => ipcRenderer.off('message', listener);
  },
  setWindowButtonColor: (color) => ipcRenderer.send('windowButtonColor', color),
  listenMaximized: (handler) => {
    const listener = (_event: IpcRendererEvent, maximized: boolean) =>
      handler(maximized);
    ipcRenderer.on('maximized', listener);
    return () => ipcRenderer.off('maximized', listener);
  },
} satisfies Bridge);
