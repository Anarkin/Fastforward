import { strings } from '../../../lib/shared/strings';
import { type Page, type ShellAccess } from '../../../shell/main/shell';
import { sides as bothSides } from '../shared/protocol';
import type { ElevatedFileSystem } from './elevated';
import { type Sides, post } from './sides';
import type { CommanderAccess } from './commanderAccess';
import { Listings } from './listings';

export interface ElevationHost {
  readonly shell: () => ShellAccess;
}

export class Elevation {
  private elevated: ElevatedFileSystem | undefined;
  private elevating: Promise<ElevatedFileSystem | undefined> | undefined;

  constructor(
    private readonly access: CommanderAccess,
    private readonly sides: Sides,
    private readonly listings: Listings,
    private readonly host: ElevationHost,
  ) {}

  get current(): ElevatedFileSystem | undefined {
    return this.elevated;
  }

  close(): void {
    this.elevated?.close();
  }

  async elevate(page: Page, tab: unknown, side: unknown): Promise<void> {
    const shown = this.sides.shownPane(page, tab, side);
    const folder = shown?.pane.denied;
    const { elevate } = this.access;
    if (shown === undefined || folder === undefined || elevate === undefined) {
      return;
    }
    if (this.elevated !== undefined) {
      await this.listings.list(page, shown.tab, shown.side, folder, 'visit');
      return;
    }
    this.elevating ??= elevate().then(
      (elevated) => {
        this.elevating = undefined;
        if (elevated !== undefined) {
          this.elevated = elevated;
          void elevated.closed.then(() => {
            if (this.elevated === elevated) {
              this.elevated = undefined;
              this.helperStopped();
            }
          });
        }
        return elevated;
      },
      () => {
        this.elevating = undefined;
        this.host.shell().notice(page, {
          level: 'error',
          message: strings.commander.helperFailed,
        });
        return undefined;
      },
    );
    if ((await this.elevating) !== undefined) {
      await this.listings.list(page, shown.tab, shown.side, folder, 'visit');
    }
  }

  private helperStopped(): void {
    const page = this.host.shell().page();
    let readAsAdministrator = false;
    for (const [tab, panes] of this.sides.panes) {
      for (const side of bothSides) {
        const pane = panes[side];
        if (pane.elevated !== true) {
          continue;
        }
        readAsAdministrator = true;
        pane.elevated = false;
        pane.entries = undefined;
        pane.denied = pane.folder;
        const shownIn = this.sides.pageShowing(tab);
        if (shownIn !== undefined) {
          this.listings.postListing(shownIn, tab, side, pane, undefined);
          post(shownIn, {
            type: 'noAccess',
            side,
            folder: pane.folder,
            asAdministrator: true,
          });
        }
      }
    }
    if (readAsAdministrator) {
      this.host.shell().notice(page, {
        level: 'error',
        message: strings.commander.helperStopped,
      });
    }
  }
}
