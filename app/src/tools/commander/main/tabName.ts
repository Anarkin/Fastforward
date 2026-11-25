import * as path from 'node:path';
import { strings } from '../../../lib/shared/strings';
import type {
  ShellAccess,
  Tab,
  TabName,
} from '../../../shell/main/toolContract';
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
  return strings.tabs.sides(folderName(left, paths), folderName(right, paths));
}

export class TabNames {
  private readonly told = new Map<string, string>();

  constructor(
    private readonly sides: Sides,
    private readonly saved: SavedSides,
    private readonly shell: () => ShellAccess,
    private readonly root: string,
  ) {}

  of({ id, root }: Tab): TabName {
    const panes = this.sides.panes.get(id);
    const saved = this.saved.of(id);
    const left = panes?.left.folder ?? saved.left ?? this.root;
    const right = panes?.right.folder ?? saved.right ?? root ?? this.root;
    const named = { name: sidesName(left, right), sides: { left, right } };
    this.told.set(id, JSON.stringify(named));
    return named;
  }

  changed(tab: string): void {
    const shown = this.shell()
      .tabs()
      .find((each) => each.id === tab) ?? { id: tab, tool: 'commander' };
    const told = this.told.get(tab);
    if (told === JSON.stringify(this.of(shown))) {
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
