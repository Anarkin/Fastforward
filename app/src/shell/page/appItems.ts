import { strings, type Line } from '../../lib/shared/strings';
import { type Confirming } from './store';

export function confirmation(confirming: Confirming): {
  title: string;
  message: string;
  lines?: readonly Line[];
  note?: string;
  confirm: string;
  dontSave?: true;
} {
  switch (confirming.kind) {
    case 'unsavedTab':
      return {
        title: strings.confirm.saveTitle,
        message: strings.confirm.saveFile,
        lines: strings.confirm.filesLines([confirming.tab.name]),
        confirm: strings.confirm.save,
        dontSave: true,
      };
    case 'tab':
      return {
        title: strings.confirm.closeTitle,
        message: strings.confirm.closeTab(strings.tools[confirming.tab.tool]),
        lines: strings.confirm.closeTabLines(
          strings.tabs.label(confirming.tab.name, confirming.tab.folder),
        ),
        confirm: strings.confirm.close,
      };
    case 'window':
      return confirming.unsaved === undefined
        ? {
            title: strings.confirm.closeWindowTitle,
            message: strings.confirm.closeWindow,
            confirm: strings.confirm.close,
          }
        : {
            title: strings.confirm.closeWindowTitle,
            message: strings.confirm.saveWindowFiles,
            lines: strings.confirm.filesLines(confirming.unsaved),
            confirm: strings.confirm.saveAll,
            dontSave: true,
          };
    case 'quit':
      return {
        title: strings.confirm.quitTitle,
        message:
          confirming.unsaved === undefined
            ? strings.confirm.quitApp
            : strings.confirm.saveQuitFiles,
        ...(confirming.unsaved !== undefined && {
          lines: strings.confirm.filesLines(confirming.unsaved),
        }),
        ...(confirming.note !== undefined && { note: confirming.note }),
        confirm:
          confirming.unsaved === undefined
            ? strings.confirm.quit
            : strings.confirm.saveAll,
        ...(confirming.unsaved !== undefined && { dontSave: true as const }),
      };
    default:
      return confirming satisfies never;
  }
}
