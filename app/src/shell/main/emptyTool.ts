import * as fs from 'node:fs';
import { strings } from '../../shared/strings';
import type { ToolId } from '../shared/tools';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from './shell';

export class EmptyTool<K extends ToolId> implements Tool<K> {
  private shell: ShellAccess = unattachedShell;

  constructor(private readonly id: K) {}

  attach(shell: ShellAccess): void {
    this.shell = shell;
  }

  ready(): void {}

  show(): Promise<void> {
    return Promise.resolve();
  }

  shows(): boolean {
    return true;
  }

  hide(): void {}

  preload(): Promise<void> {
    return Promise.resolve();
  }

  closed(): void {}

  receive(): Promise<void> {
    return Promise.resolve();
  }

  refreshShown(): Promise<void> {
    return Promise.resolve();
  }

  names(tabs: readonly Tab[]): ReadonlyMap<string, TabName> {
    return new Map(
      tabs.map((tab) => [tab.id, { name: strings.tools[this.id] }]),
    );
  }

  async fits(folder: string): Promise<boolean> {
    try {
      return (await fs.promises.stat(folder)).isDirectory();
    } catch {
      return false;
    }
  }

  folderOf(tab: Tab): string | undefined {
    return tab.root;
  }

  open(page: Page, folders: readonly string[]): Promise<void> {
    return this.shell.open(page, this.id, folders, false);
  }

  newTab(page: Page): Promise<void> {
    return this.shell.open(page, this.id, [undefined], false);
  }

  reloadSettings(): void {}

  quit(): void {}
}
