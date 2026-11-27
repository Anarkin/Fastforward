import { net } from 'electron';
import { fs } from '../lib/main/files';
import { readTitle } from '../tools/canvas/main/pageTitles';
import { CanvasTool } from '../tools/canvas/main/tool';
import { ReadOnlyFile, saveFile } from '../lib/main/fileSaving';
import { watchFolder } from '../lib/main/watch';

export function canvasToolOf(): CanvasTool {
  return new CanvasTool({
    sizeOf: async (file) => (await fs.promises.stat(file)).size,
    readFile: (file) => fs.promises.readFile(file),
    saveFile: async (file, bytes) =>
      saveFile(
        file,
        bytes,
        process.platform === 'win32'
          ? {
              replaceFile: (
                await import('./windowsReplaceFile.js')
              ).windowsReplaceFile(),
            }
          : {},
      ),
    readOnly: (error) => error instanceof ReadOnlyFile,
    watch: (file, onChange) => watchFolder(file, onChange),
    titleOf: (url) => readTitle(url, (target, init) => net.fetch(target, init)),
  });
}
