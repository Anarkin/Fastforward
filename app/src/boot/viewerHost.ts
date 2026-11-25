import { fs } from '../lib/main/files';
import { editorConfigOf, fileTabSizeOf } from '../lib/main/editorConfig';
import { clipboard } from 'electron';
import { watchFolder } from '../lib/main/watch';
import { systemCodePage } from '../components/encodings/main/codePages';
import type { CommanderTool } from '../tools/commander/main/tool';
import type { EditorTool } from '../tools/editor/main/tool';
import type { PdfPlaces } from '../tools/viewer/main/pdfPlaces';
import { ViewerTool } from '../tools/viewer/main/tool';
import type { GitTool } from '../tools/git/main/tool';
import type { DiffTool } from '../tools/diff/main/tool';

export interface ViewerHostDeps {
  readonly pdfPlaces: PdfPlaces;
  readonly commanderTool: CommanderTool;
  readonly editorTool: EditorTool;
  readonly gitTool: Pick<GitTool, 'versionCopy' | 'fileHistory'>;
  readonly diffTool: Pick<DiffTool, 'openHistory'>;
}

export function viewerToolOf({
  pdfPlaces,
  commanderTool,
  editorTool,
  gitTool,
  diffTool,
}: ViewerHostDeps): ViewerTool {
  return new ViewerTool({
    copy: (text) => {
      void clipboard.writeText(text);
    },
    codePage: () => systemCodePage(process.platform),
    fileTabSize: (file) =>
      editorConfigOf(file, (config) =>
        fs.promises.readFile(config, 'utf8').catch(() => undefined),
      ).then(fileTabSizeOf),
    watch: watchFolder,
    pdfPlaces,
    hiddenParts: (file) => commanderTool.hiddenParts(file),
    editViewed: (page, file, at) => editorTool.editViewed(page, file, at),
    closed: (file) => commanderTool.viewClosed(file),
    versionCopy: (file, rev) => gitTool.versionCopy(file, rev),
    fileHistory: (file) => gitTool.fileHistory(file),
    compareHistory: (page, file, rev) => diffTool.openHistory(page, file, rev),
  });
}
