import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { isObject } from '../../../lib/main/json';
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
import { viewVersion, type CanvasToHost } from '../shared/protocol';
import { EditedBoard } from './edited';
import { editOf } from './edits';
import { post } from './post';
import { boardOf } from './reading';

export interface CanvasAccess {
  readonly sizeOf: (file: string) => Promise<number>;
  readonly readFile: (file: string) => Promise<Buffer>;
  readonly saveFile: (file: string, bytes: Uint8Array) => Promise<unknown>;
  readonly readOnly?: (error: unknown) => boolean;
  readonly newId?: () => string;
}

export const maxBoardBytes = 50 * 1024 * 1024;

interface Held {
  readonly file: string;
  readonly board: EditedBoard;
}

type Read =
  | { readonly held: Held; readonly skipped: number }
  | { readonly error: Sentence };

const hexId = () => randomBytes(8).toString('hex');

export class CanvasTool implements Tool<'canvas'> {
  readonly viewVersion = viewVersion;
  private shell: ShellAccess = unattachedShell;
  private readonly shown = new Map<Page, string>();
  private readonly toldSkipped = new Set<string>();
  private readonly held = new Map<string, Held>();

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
    const kept = this.held.get(tab.id);
    if (kept?.file === file && kept.board.changed()) {
      this.postBoard(page, tab.id);
      return;
    }
    const read = await this.read(file);
    if (this.shown.get(page) !== tab.id) {
      return;
    }
    if ('error' in read) {
      this.held.delete(tab.id);
      post(page, { type: 'board', tab: tab.id, file, error: read.error });
      return;
    }
    this.held.set(tab.id, read.held);
    this.postBoard(page, tab.id);
    if (read.skipped > 0 && !this.toldSkipped.has(tab.id)) {
      this.toldSkipped.add(tab.id);
      this.shell.notice(page, {
        level: 'info',
        message: strings.canvas.skipped(file, read.skipped),
      });
    }
  }

  private async read(file: string): Promise<Read> {
    try {
      if ((await this.access.sizeOf(file)) > maxBoardBytes) {
        return { error: strings.canvas.tooLarge(file) };
      }
      const text = (await this.access.readFile(file)).toString();
      const read = boardOf(text);
      switch (read.kind) {
        case 'board':
          return {
            held: { file, board: new EditedBoard(text) },
            skipped: read.skipped,
          };
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

  private postBoard(page: Page, tab: string, made?: string): void {
    const held = this.held.get(tab);
    const read = held?.board.read();
    if (held === undefined || read?.kind !== 'board') {
      return;
    }
    post(page, {
      type: 'board',
      tab,
      file: held.file,
      board: read.board,
      ...(held.board.changed() && { changed: true }),
      ...(made !== undefined && { made }),
    });
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
    this.held.delete(tab.id);
  }

  async receive(page: Page, message: CanvasToHost): Promise<void> {
    const sent: unknown = message;
    if (
      !isObject(sent) ||
      typeof sent.tab !== 'string' ||
      !this.shell.holds(page, sent.tab)
    ) {
      return;
    }
    const { tab } = sent;
    const held = this.held.get(tab);
    if (held === undefined) {
      return;
    }
    const wasChanged = held.board.changed();
    switch (sent.type) {
      case 'edit': {
        const edit = editOf(sent.edit);
        const done =
          edit === undefined
            ? undefined
            : held.board.apply(edit, this.access.newId ?? hexId);
        if (done !== undefined) {
          this.postBoard(page, tab, done.made);
        }
        break;
      }
      case 'undo':
        if (held.board.undo()) {
          this.postBoard(page, tab);
        }
        break;
      case 'redo':
        if (held.board.redo()) {
          this.postBoard(page, tab);
        }
        break;
      case 'save':
        await this.save(page, tab);
        return;
      default:
        return;
    }
    if (held.board.changed() !== wasChanged) {
      this.shell.postTabs(page);
    }
  }

  private async save(page: Page, tab: string): Promise<boolean> {
    const held = this.held.get(tab);
    if (held === undefined) {
      return false;
    }
    if (!held.board.changed()) {
      return true;
    }
    try {
      await this.access.saveFile(
        held.file,
        new TextEncoder().encode(held.board.text()),
      );
    } catch (error) {
      this.shell.notice(page, {
        level: 'error',
        message:
          this.access.readOnly?.(error) === true
            ? strings.canvas.readOnly(held.file)
            : strings.canvas.couldNotSave(held.file, reasonOf(error)),
      });
      return false;
    }
    held.board.saved();
    this.postBoard(page, tab);
    this.shell.postTabs(page);
    return true;
  }

  refreshShown(): Promise<void> {
    return Promise.resolve();
  }

  names(tabs: readonly Tab[]): ReadonlyMap<string, TabName> {
    return new Map(
      tabs.flatMap((tab): [string, TabName][] =>
        tab.root === undefined
          ? []
          : [
              [
                tab.id,
                {
                  name: path.basename(tab.root),
                  ...(this.unsaved(tab) && { unsaved: true }),
                },
              ],
            ],
      ),
    );
  }

  unsaved(tab: Tab): boolean {
    return this.held.get(tab.id)?.board.changed() === true;
  }

  saveUnsaved(page: Page, tab: Tab): Promise<boolean> {
    return this.save(page, tab.id);
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
