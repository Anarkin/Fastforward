import * as path from 'node:path';
import { reasonOf } from '../../../lib/main/reasons';
import type { Sentence } from '../../../lib/shared/sentences';
import { strings } from '../../../lib/shared/strings';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/toolContract';
import type { Board } from '../shared/board';
import { viewVersion } from '../shared/protocol';
import { post } from './post';
import { boardOf } from './reading';

export interface CanvasAccess {
  readonly sizeOf: (file: string) => Promise<number>;
  readonly readFile: (file: string) => Promise<Buffer>;
}

export const maxBoardBytes = 50 * 1024 * 1024;

interface BoardShown {
  readonly board?: Board;
  readonly error?: Sentence;
  readonly skipped?: number;
}

export class CanvasTool implements Tool<'canvas'> {
  readonly viewVersion = viewVersion;
  private shell: ShellAccess = unattachedShell;
  private readonly shown = new Map<Page, string>();
  private readonly toldSkipped = new Set<string>();

  constructor(private readonly access: CanvasAccess) {}

  attach(shell: ShellAccess): void {
    this.shell = shell;
  }

  ready(): void {}

  async show(page: Page, tab: Tab): Promise<void> {
    for (const [other, shown] of this.shown) {
      if (shown === tab.id && other !== page) {
        this.shown.delete(other);
        post(other, { type: 'hide' });
      }
    }
    const file = tab.root;
    if (file === undefined) {
      return;
    }
    this.shown.set(page, tab.id);
    post(page, { type: 'show', tab: tab.id, file });
    const { skipped = 0, ...read } = await this.read(file);
    if (this.shown.get(page) !== tab.id) {
      return;
    }
    post(page, { type: 'board', tab: tab.id, file, ...read });
    if (skipped > 0 && !this.toldSkipped.has(tab.id)) {
      this.toldSkipped.add(tab.id);
      this.shell.notice(page, {
        level: 'info',
        message: strings.canvas.skipped(file, skipped),
      });
    }
  }

  private async read(file: string): Promise<BoardShown> {
    try {
      if ((await this.access.sizeOf(file)) > maxBoardBytes) {
        return { error: strings.canvas.tooLarge(file) };
      }
      const read = boardOf((await this.access.readFile(file)).toString());
      switch (read.kind) {
        case 'board':
          return { board: read.board, skipped: read.skipped };
        case 'notJson':
          return { error: strings.canvas.notJson(file) };
        case 'notBoard':
          return { error: strings.canvas.notBoard(file) };
        default:
          return read satisfies never;
      }
    } catch (error) {
      return { error: strings.textFile.couldNotRead(file, reasonOf(error)) };
    }
  }

  shows(page: Page, tab: Tab): boolean {
    return this.shown.get(page) === tab.id;
  }

  hide(page: Page): void {
    if (this.shown.delete(page)) {
      post(page, { type: 'hide' });
    }
  }

  preload(): Promise<void> {
    return Promise.resolve();
  }

  closed(page: Page, tab: Tab): void {
    post(page, { type: 'closed', tab: tab.id });
    for (const [shownIn, shown] of this.shown) {
      if (shown === tab.id) {
        this.shown.delete(shownIn);
      }
    }
    this.toldSkipped.delete(tab.id);
  }

  receive(): Promise<void> {
    return Promise.resolve();
  }

  refreshShown(): Promise<void> {
    return Promise.resolve();
  }

  names(tabs: readonly Tab[]): ReadonlyMap<string, TabName> {
    return new Map(
      tabs.flatMap((tab): [string, TabName][] =>
        tab.root === undefined
          ? []
          : [[tab.id, { name: path.basename(tab.root) }]],
      ),
    );
  }

  fits(): Promise<boolean> {
    return Promise.resolve(false);
  }

  folderOf(tab: Tab): string | undefined {
    return tab.root === undefined ? undefined : path.dirname(tab.root);
  }

  visited(): void {}

  open(page: Page, files: readonly string[]): Promise<void> {
    const [file] = files;
    return file === undefined
      ? Promise.resolve()
      : this.shell.open(page, 'canvas', [file], true);
  }

  newTab(): Promise<void> {
    return Promise.resolve();
  }

  reloadSettings(): void {}

  quit(): void {
    this.shown.clear();
  }
}
