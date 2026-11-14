import { strings } from '../../lib/shared/strings';
import type { Line } from '../../lib/shared/sentences';
import type { TabInfo, ToHost } from '../shared/protocol';

export type Confirming =
  | { readonly kind: 'tab'; readonly tab: TabInfo }
  | { readonly kind: 'unsavedTab'; readonly tab: TabInfo }
  | { readonly kind: 'window'; readonly unsaved?: readonly string[] }
  | {
      readonly kind: 'quit';
      readonly note?: string;
      readonly unsaved?: readonly string[];
    };

export function closingOf(confirming: Confirming, save: boolean): ToHost {
  switch (confirming.kind) {
    case 'tab':
      return { type: 'closeTab', tab: confirming.tab.id };
    case 'unsavedTab':
      return {
        type: 'closeTab',
        tab: confirming.tab.id,
        ...(save && { save: true }),
      };
    case 'window':
      return {
        type: 'closeWindow',
        ...(save && confirming.unsaved !== undefined && { save: true }),
      };
    case 'quit':
      return {
        type: 'quit',
        ...(save && confirming.unsaved !== undefined && { save: true }),
      };
    default:
      return confirming satisfies never;
  }
}

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
