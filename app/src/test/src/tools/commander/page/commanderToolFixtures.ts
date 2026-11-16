import type { CommanderToWebview } from '../../../../../tools/commander/shared/protocol';
import {
  inTool,
  type ShownTool,
  type Tool,
} from '../../../../helpers/toolFixtures';

export const commanderSettings: CommanderToWebview = {
  type: 'settings',
  showHidden: true,
  sort: {
    left: { column: 'extension', descending: false, groupByColor: false },
    right: { column: 'extension', descending: false, groupByColor: false },
  },
  columns: { extension: 10, size: 15, date: 16 },
  defaultColumns: { extension: 10, size: 15, date: 16 },
  canElevate: false,
  platform: 'win32',
  thumbnailSize: 144,
  fileColors: [],
  bookmarks: [],
};

export function listingOf(
  tab: string,
  side: 'left' | 'right',
  folder: string,
  names: readonly string[],
): CommanderToWebview {
  return {
    type: 'listing',
    tab,
    side,
    folder,
    hidden: [],
    entries: names.map((name) => ({
      name,
      folder: false,
      link: false,
      hidden: false,
      size: 1,
      modified: 0,
    })),
    parent: true,
    back: false,
    forward: false,
    elevated: false,
    selected: names[0],
  };
}

export function inCommanderTool(
  shownTool: Tool<'commander'>,
  run: (tool: ShownTool<'commander'>) => Promise<void>,
): Promise<void> {
  return inTool('commander', shownTool, run);
}
