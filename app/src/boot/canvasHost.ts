import { fs } from '../lib/main/files';
import { CanvasTool } from '../tools/canvas/main/tool';
import { ReadOnlyFile, saveFile } from '../tools/editor/main/fileSaving';

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
                await import('../tools/editor/main/windowsReplaceFile.js')
              ).windowsReplaceFile(),
            }
          : {},
      ),
    readOnly: (error) => error instanceof ReadOnlyFile,
  });
}
