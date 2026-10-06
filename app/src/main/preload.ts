import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { Bridge } from '../shared/bridge';
import type { ToWebview } from '../shared/protocol';
import { brand } from '../shared/strings';
import { appNameSwitch } from '../shared/titleBar';

contextBridge.exposeInMainWorld('fastforward', {
  platform: process.platform,
  name:
    process.argv
      .find((arg) => arg.startsWith(appNameSwitch))
      ?.slice(appNameSwitch.length) ?? brand,
  post: (message) => ipcRenderer.send('message', message),
  listen: (handler) => {
    const listener = (_event: IpcRendererEvent, message: ToWebview) =>
      handler(message);
    ipcRenderer.on('message', listener);
    return () => ipcRenderer.off('message', listener);
  },
  setWindowButtonColor: (color) => ipcRenderer.send('windowButtonColor', color),
} satisfies Bridge);
