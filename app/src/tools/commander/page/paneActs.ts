import type { Side } from '../shared/protocol';
import type { CommanderActions } from './commanderState';
import type { Copied } from './copiedText';
import type { PaneAct } from './paneKeys';

export interface PaneHost {
  readonly query: string;
  readonly copyItems: (copied: Copied, names: readonly string[]) => void;
  readonly openMenu: (key: string | undefined) => void;
  readonly openFilter: () => void;
  readonly focusFilter: () => void;
}

export function actOnPane(
  action: PaneAct,
  side: Side,
  actions: CommanderActions,
  host: PaneHost,
): void {
  switch (action.kind) {
    case 'newFolder':
      actions.askNewFolder(side);
      return;
    case 'newFile':
      actions.askNewFile(side);
      return;
    case 'rename':
      actions.askRename(side, action.name);
      return;
    case 'pack':
      actions.askPack(side, action.names);
      return;
    case 'test':
      actions.testArchives(side, action.names);
      return;
    case 'enterArchive':
      actions.enterArchive(side, action.name);
      return;
    case 'copyToClipboard':
      actions.copyToClipboard(side, action.names);
      return;
    case 'paste':
      actions.paste(side);
      return;
    case 'copyText':
      host.copyItems(action.copied, action.names);
      return;
    case 'transfer':
      actions.askTransfer(side, action.names, action.move);
      return;
    case 'delete':
      actions.askDelete(side, action.names, action.permanently);
      return;
    case 'menu':
      host.openMenu(action.key);
      return;
    case 'filterLetter':
      actions.filterSide(side, host.query + action.letter);
      host.focusFilter();
      return;
    case 'openFilter':
      host.openFilter();
      return;
    case 'stopFiltering':
      actions.filterSide(side, undefined);
      return;
    case 'stopReading':
      actions.stopReading(side);
      return;
    case 'switchSide':
      actions.switchSide();
      return;
    case 'compare':
      actions.compare();
      return;
    case 'view':
      actions.viewFile(side, action.name);
      return;
    case 'edit':
      actions.editFile(side, action.name);
      return;
    case 'openOnSide':
      actions.openOnSide(side, action.side, action.name);
      return;
    case 'open':
      actions.open(side, action.name);
      return;
    case 'mark':
      actions.mark(side, action.keys, action.marked);
      actions.select(side, action.select);
      if (action.count !== undefined) {
        actions.countSizes(side, action.count);
      }
      return;
    case 'countSizes':
      actions.countSizes(side, action.names);
      return;
    case 'markPattern':
      actions.askMarkPattern(side, action.mark, action.suggested);
      return;
    case 'invertMarks':
      actions.mark(side, action.marking, true);
      actions.mark(side, action.unmarking, false);
      return;
    case 'select':
      actions.select(side, action.key);
  }
}
