import type { Page } from '../../../shell/main/toolContract';
import type { CommanderToHost } from '../shared/protocol';
import { maxDroppedIcons } from '../shared/icons';
import type { Sides } from './sides';
import type { FileCommands } from './fileCommands';
import type { Navigation } from './navigation';
import type { SystemCommands } from './systemCommands';
import type { ItemChanges } from './itemChanges';
import type { TransferCommands } from './transferCommands';
import type { PackCommands } from './packCommands';
import type { Transfers } from './transfers';
import type { Listings } from './listings';
import type { SideFlat } from './sideFlat';
import type { SideSizes } from './sideSizes';
import type { ArchiveListing } from './archiveListing';
import type { ArchivePasswords } from './archivePasswords';
import type { ArchiveCopies } from './archiveCopies';
import type { Elevation } from './elevation';
import type { SettingsCommands } from './settingsCommands';
import type { ThumbnailServing } from './thumbnailServing';
import type { Icons } from './icons';
import type { SideDuplicates } from './sideDuplicates';

export class CommanderMessages {
  constructor(
    private readonly sides: Sides,
    private readonly fileCommands: FileCommands,
    private readonly navigation: Navigation,
    private readonly systemCommands: SystemCommands,
    private readonly itemChanges: ItemChanges,
    private readonly transferCommands: TransferCommands,
    private readonly packCommands: PackCommands,
    private readonly transfers: Transfers,
    private readonly listings: Listings,
    private readonly flat: SideFlat,
    private readonly sizes: SideSizes,
    private readonly archiveListing: ArchiveListing,
    private readonly passwords: ArchivePasswords,
    private readonly copies: ArchiveCopies,
    private readonly elevation: Elevation,
    private readonly settings: SettingsCommands,
    private readonly thumbnailServing: ThumbnailServing,
    private readonly icons: Icons,
    private readonly duplicates: SideDuplicates,
    private readonly postDrives: (page: Page) => Promise<void>,
  ) {}

  async receive(page: Page, message: CommanderToHost): Promise<void> {
    switch (message.type) {
      case 'editFile':
        return this.fileCommands.editFile(
          page,
          this.sides.namingPane(
            page,
            message.tab,
            message.side,
            message.folder,
          ),
          message.name,
        );
      case 'open':
        return this.fileCommands.openEntry(
          page,
          this.sides.namingPane(
            page,
            message.tab,
            message.side,
            message.folder,
          ),
          message.name,
        );
      case 'drive':
        return this.navigation.drive(
          page,
          message.tab,
          message.side,
          message.drive,
        );
      case 'listDrives':
        return this.postDrives(page);
      case 'step':
        return this.navigation.step(
          page,
          message.tab,
          message.side,
          message.step,
        );
      case 'view':
        return this.fileCommands.view(
          page,
          this.sides.namingPane(
            page,
            message.tab,
            message.side,
            message.folder,
          ),
          message.name,
        );
      case 'shellMenu':
        return this.systemCommands.shellMenu(page, message);
      case 'delete':
        return this.itemChanges.delete(page, message);
      case 'transfer':
        return this.transferCommands.transfer(page, message);
      case 'newFolder':
        return this.itemChanges.newFolder(page, message);
      case 'newFile':
        return this.fileCommands.newFile(page, message);
      case 'rename':
        return this.itemChanges.rename(page, message);
      case 'pack':
        return this.packCommands.pack(page, message);
      case 'testArchives':
        this.packCommands.testArchives(page, message);
        return undefined;
      case 'copyToClipboard':
        return this.systemCommands.copyToClipboard(page, message);
      case 'drag':
        return this.systemCommands.drag(page, message);
      case 'paste':
        return this.transferCommands.paste(page, message);
      case 'answerClash':
        this.transfers.answer(
          message.transfer,
          message.asked,
          message.answer,
          message.all,
        );
        return undefined;
      case 'stopTransfer':
        this.transfers.stop(message.transfer);
        return undefined;
      case 'hideTransfer':
        this.transfers.hide(message.transfer);
        return undefined;
      case 'compare':
        return this.fileCommands.compare(page, message.tab, message.files);
      case 'reread':
        return this.listings.reread(page, message);
      case 'flat':
        return this.flat.turnFlat(page, message);
      case 'stopReading':
        this.listings.stopReading(page, message);
        return undefined;
      case 'countSizes':
        this.sizes.countSizes(page, message);
        return undefined;
      case 'openOnSide':
        return this.archiveListing.openOnSide(page, message);
      case 'enterArchive':
        return this.archiveListing.enterArchive(page, message);
      case 'password':
        this.passwords.answerPassword(message.ask, message.password);
        return undefined;
      case 'updateArchive':
        this.copies.answerUpdate(message.ask, message.update);
        return undefined;
      case 'openRepository':
        return this.fileCommands.openRepository(page, message);
      case 'folderCommand':
        return this.fileCommands.folderCommand(page, message);
      case 'elevate':
        return this.elevation.elevate(page, message.tab, message.side);
      case 'activate': {
        const shown = this.sides.shownPane(page, message.tab, message.side);
        const panes = shown && this.sides.panes.get(shown.tab);
        if (shown !== undefined && panes !== undefined) {
          panes.active = shown.side;
        }
        return undefined;
      }
      case 'columns':
        return this.settings.columns(page, message);
      case 'sort':
        return this.settings.sort(page, message);
      case 'saveThumbnail':
        return this.thumbnailServing.saveThumbnail(message);
      case 'dropIcons':
        if (
          Array.isArray(message.tickets) &&
          message.tickets.length <= maxDroppedIcons &&
          message.tickets.every((ticket) => typeof ticket === 'string')
        ) {
          this.icons.drop(message.tickets);
        }
        return undefined;
      case 'showHidden':
        return this.settings.showHidden(page, message);
      case 'addBookmark':
        return this.settings.addBookmark(page, message);
      case 'removeBookmark':
        return this.settings.removeBookmark(page, message);
      case 'goToBookmark':
        return this.navigation.goToBookmark(page, message);
      case 'goTo':
        return this.navigation.goTo(page, message);
      case 'duplicates':
        this.duplicates.turnDuplicates(page, message);
        return undefined;
      default:
        return message satisfies never;
    }
  }
}
