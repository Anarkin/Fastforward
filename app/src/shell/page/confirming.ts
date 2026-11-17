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
  message?: string;
  lines?: readonly Line[];
  note?: string;
  confirm: string;
  dontSave?: true;
} {
  switch (confirming.kind) {
    case 'unsavedTab':
      return {
        title: strings.confirm.saveTitle,
        lines: strings.confirm.filesLines([
          confirming.tab.root ?? confirming.tab.name,
        ]),
        confirm: strings.confirm.save,
        dontSave: true,
      };
    case 'tab':
      return {
        title: strings.confirm.closeTitle,
        lines: strings.confirm.closeTabLines(
          strings.tabs.label(confirming.tab.name, confirming.tab.folder),
          confirming.tab.root,
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
            lines: strings.confirm.filesLines(confirming.unsaved),
            confirm: strings.confirm.saveAll,
            dontSave: true,
          };
    case 'quit':
      return {
        title: strings.confirm.quitTitle,
        ...(confirming.unsaved === undefined && {
          message: strings.confirm.quitApp,
        }),
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
