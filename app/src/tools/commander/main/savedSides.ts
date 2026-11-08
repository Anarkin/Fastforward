import * as path from 'node:path';
import { isObject } from '../../../shell/main/settings';
import type { Store } from '../../../shell/main/storage';
import { sides, type Side } from '../shared/protocol';

const sidesKey = 'sides';

type SideFolders = Partial<Record<Side, string>>;

export class SavedSides {
  constructor(private readonly state: Store) {}

  of(tab: string): SideFolders {
    const saved = this.all[tab];
    const folders: SideFolders = {};
    if (!isObject(saved)) {
      return folders;
    }
    for (const side of sides) {
      const folder = saved[side];
      if (typeof folder === 'string' && path.isAbsolute(folder)) {
        folders[side] = folder;
      }
    }
    return folders;
  }

  async save(tab: string, side: Side, folder: string): Promise<void> {
    const folders = this.of(tab);
    if (folders[side] === folder) {
      return;
    }
    await this.state.update(sidesKey, {
      ...this.all,
      [tab]: { ...folders, [side]: folder },
    });
  }

  async keep(kept: (tab: string) => boolean): Promise<void> {
    const all = this.all;
    const entries = Object.entries(all).filter(([tab]) => kept(tab));
    if (entries.length < Object.keys(all).length) {
      await this.state.update(sidesKey, Object.fromEntries(entries));
    }
  }

  private get all(): Record<string, unknown> {
    const saved = this.state.get(sidesKey);
    return isObject(saved) ? saved : {};
  }
}
