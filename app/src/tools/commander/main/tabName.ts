import * as path from 'node:path';
import { strings } from '../../../lib/shared/strings';
import type { ShellAccess, Tab } from '../../../shell/main/toolContract';
import type { SavedSides } from './savedSides';
import type { Sides } from './sides';

const folderName = (folder: string, paths: path.PlatformPath) =>
  paths.basename(folder) || folder;

export function sidesName(
  left: string | undefined,
  right: string | undefined,
  paths: path.PlatformPath = path,
): string {
  if (left === undefined || right === undefined) {
    const either = left ?? right;
    return either === undefined
      ? strings.tools.commander
      : folderName(either, paths);
  }
  return paths.relative(left, right) === ''
    ? folderName(left, paths)
    : strings.tabs.sides(folderName(left, paths), folderName(right, paths));
}

export class TabNames {
  private readonly told = new Map<string, string>();

  constructor(
    private readonly sides: Sides,
    private readonly saved: SavedSides,
    private readonly shell: () => ShellAccess,
    private readonly root: string,
  ) {}

  of({ id, root }: Tab): string {
    const panes = this.sides.panes.get(id);
    const saved = this.saved.of(id);
    const name = sidesName(
      panes?.left.folder ?? saved.left ?? this.root,
      panes?.right.folder ?? saved.right ?? root ?? this.root,
    );
    this.told.set(id, name);
    return name;
  }

  changed(tab: string): void {
    const shown = this.shell()
      .tabs()
      .find((each) => each.id === tab) ?? { id: tab, tool: 'commander' };
    if (this.told.get(tab) === this.of(shown)) {
      return;
    }
    const shell = this.shell();
    for (const page of shell.pages()) {
      if (shell.holds(page, tab)) {
        shell.postTabs(page);
      }
    }
  }

  forget(tab: string): void {
    this.told.delete(tab);
  }
}
