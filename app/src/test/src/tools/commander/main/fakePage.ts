import type { Page } from '../../../../../shell/main/toolContract';
import type { ToWebview } from '../../../../../shell/shared/protocol';
import type { CommanderToWebview } from '../../../../../tools/commander/shared/protocol';
import type { Side } from '../../../../../tools/commander/shared/sides';

export class CommanderPage implements Page {
  readonly messages: CommanderToWebview[] = [];
  disposed = false;

  post(message: ToWebview): void {
    if (message.type === 'tool' && message.tool === 'commander') {
      this.messages.push(message.message);
    }
  }

  of<T extends CommanderToWebview['type']>(
    type: T,
  ): Extract<CommanderToWebview, { readonly type: T }>[] {
    return this.messages.filter(
      (message): message is Extract<CommanderToWebview, { readonly type: T }> =>
        message.type === type,
    );
  }

  listings(): string[] {
    return this.of('listing').map(
      (listing) =>
        `${listing.side} ${listing.folder}${listing.parent ? ' ↑' : ''}: ${listing.entries.map((entry) => entry.name).join(' ')}${listing.selected === undefined ? '' : ` [${listing.selected}]`}`,
    );
  }
}

export const lastFolder = (page: CommanderPage, id: string, side: Side) =>
  page
    .of('listing')
    .findLast((listing) => listing.tab === id && listing.side === side)?.folder;
