import { app } from 'electron';
import { watchFolder } from '../lib/main/watch';
import { systemCodePage } from '../components/encodings/main/codePages';
import type { CommanderTool } from '../tools/commander/main/tool';
import type { EditorTool } from '../tools/editor/main/tool';
import type { PdfPlaces } from '../tools/viewer/main/pdfPlaces';
import { ViewerTool } from '../tools/viewer/main/tool';
import type { GitTool } from '../tools/git/main/tool';

export interface ViewerHostDeps {
  readonly pdfPlaces: PdfPlaces;
  readonly commanderTool: CommanderTool;
  readonly editorTool: EditorTool;
  readonly gitTool: Pick<GitTool, 'versionCopy' | 'fileHistory'>;
}

export function viewerToolOf({
  pdfPlaces,
  commanderTool,
  editorTool,
  gitTool,
}: ViewerHostDeps): ViewerTool {
  return new ViewerTool({
    codePage: () => systemCodePage(process.platform),
    watch: watchFolder,
    pdfPlaces,
    hiddenParts: (file) => commanderTool.hiddenParts(file),
    fileIcon: async (file) =>
      (await app.getFileIcon(file, { size: 'normal' })).toPNG(),
    editViewed: (page, tab, file, at) =>
      editorTool.editViewed(page, tab, file, at),
    closed: (file) => commanderTool.viewClosed(file),
    versionCopy: (file, rev) => gitTool.versionCopy(file, rev),
    fileHistory: (file) => gitTool.fileHistory(file),
  });
}
