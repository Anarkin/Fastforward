import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('fastforward', {
  platform: process.platform,
  post: (message: unknown) => ipcRenderer.send('message', message),
  listen: (handler: (message: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, message: unknown) =>
      handler(message);
    ipcRenderer.on('message', listener);
    return () => ipcRenderer.off('message', listener);
  },
  setWindowButtonColor: (color: string) =>
    ipcRenderer.send('windowButtonColor', color),
});
