import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { isObject } from '../../../lib/main/json';
import { hasCode } from '../../../lib/shared/errors';
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
import {
  isWebLink,
  viewVersion,
  type CanvasDrop,
  type CanvasToHost,
} from '../shared/protocol';
import { EditedBoard } from './edited';
import { dropOf, editOf } from './edits';
import { fileIn, nodeFilesOf, vaultOf, type FileAccess } from './nodeFiles';
import { post } from './post';
import { boardOf } from './reading';

export interface CanvasAccess {
  readonly sizeOf: (file: string) => Promise<number>;
  readonly readFile: (file: string) => Promise<Buffer>;
  readonly saveFile: (file: string, bytes: Uint8Array) => Promise<unknown>;
  readonly readOnly?: (error: unknown) => boolean;
  readonly newId?: () => string;
  readonly watch?: (file: string, onChange: () => void) => () => void;
  readonly titleOf?: (url: string) => Promise<string | undefined>;
  readonly files?: FileAccess;
}

export const maxBoardBytes = 50 * 1024 * 1024;

interface Held {
  readonly file: string;
  readonly board: EditedBoard;
  made: boolean;
  written?: string;
}

const newBoard = '{}';

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
  private readonly titles = new Map<string, Promise<string | undefined>>();
  private readonly turns = new Map<string, Promise<unknown>>();
  private readonly watching = new Map<
    string,
    { readonly file: string; readonly stop: () => void }
  >();

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
    const before = this.shown.get(page);
    this.shown.set(page, tab.id);
    if (before !== undefined && before !== tab.id) {
      this.unwatchHidden(before);
    }
    this.watched(tab.id, file);
    post(page, { type: 'show', tab: tab.id, file });
    const kept = this.held.get(tab.id);
    if (kept?.file === file && kept.board.changed()) {
      this.postBoard(page, tab.id);
      this.postNodes(page, tab.id);
      return;
    }
    const read = await this.read(file);
    if (this.shown.get(page) !== tab.id) {
      return;
    }
    const current = this.held.get(tab.id);
    if (current?.file === file && current.board.changed()) {
      this.postBoard(page, tab.id);
      this.postNodes(page, tab.id);
      return;
    }
    if ('error' in read) {
      this.held.delete(tab.id);
      post(page, { type: 'board', tab: tab.id, file, error: read.error });
      return;
    }
    this.held.set(tab.id, read.held);
    this.postBoard(page, tab.id);
    this.postNodes(page, tab.id);
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
      const size = await this.access.sizeOf(file).catch((error: unknown) => {
        if (hasCode(error, 'ENOENT')) {
          return undefined;
        }
        throw error;
      });
      if (size === undefined) {
        return {
          held: { file, board: new EditedBoard(newBoard), made: true },
          skipped: 0,
        };
      }
      if (size > maxBoardBytes) {
        return { error: strings.canvas.tooLarge(file) };
      }
      const text = (await this.access.readFile(file)).toString();
      const read = boardOf(text);
      switch (read.kind) {
        case 'board':
          return {
            held: { file, board: new EditedBoard(text), made: false },
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

  private postNodes(page: Page, tab: string): void {
    this.postTitles(page, tab);
    void this.postFiles(page, tab);
  }

  private async postFiles(page: Page, tab: string): Promise<void> {
    const held = this.held.get(tab);
    const read = held?.board.read();
    const access = this.access.files;
    if (held === undefined || access === undefined || read?.kind !== 'board') {
      return;
    }
    const files = await nodeFilesOf(held.file, read.board, access);
    if (this.held.get(tab) === held && Object.keys(files).length > 0) {
      post(page, { type: 'files', tab, files });
    }
  }

  private postTitles(page: Page, tab: string): void {
    const titleOf = this.access.titleOf;
    const read = this.held.get(tab)?.board.read();
    if (titleOf === undefined || read?.kind !== 'board') {
      return;
    }
    const urls = new Set(
      read.board.nodes.flatMap((node) =>
        node.type === 'link' && isWebLink(node.url) ? [node.url] : [],
      ),
    );
    for (const url of urls) {
      const asked = this.titles.get(url) ?? titleOf(url);
      this.titles.set(url, asked);
      void asked.then((title) => {
        if (title !== undefined) {
          post(page, { type: 'titles', titles: { [url]: title } });
        }
      });
    }
  }

  private watched(tab: string, file: string): void {
    const watch = this.access.watch;
    if (watch === undefined || this.watching.get(tab)?.file === file) {
      return;
    }
    this.watching.get(tab)?.stop();
    this.watching.set(tab, {
      file,
      stop: watch(file, () => void this.changedOutside(tab, file)),
    });
  }

  private unwatchHidden(tab: string): void {
    if (![...this.shown.values()].includes(tab)) {
      this.watching.get(tab)?.stop();
      this.watching.delete(tab);
    }
  }

  private async changedOutside(tab: string, file: string): Promise<void> {
    const held = this.held.get(tab);
    if (held?.file !== file) {
      return;
    }
    const pages = [...this.shown]
      .filter(([, shown]) => shown === tab)
      .map(([page]) => page);
    const read = await this.read(file);
    const onDisk = 'error' in read ? undefined : read.held.board.text();
    if (
      'error' in read ||
      onDisk === held.board.text() ||
      onDisk === held.written
    ) {
      return;
    }
    if (this.held.get(tab) !== held) {
      return;
    }
    if (held.board.changed()) {
      for (const page of pages) {
        this.shell.notice(page, {
          level: 'info',
          message: strings.editor.changedOutside(file),
        });
      }
      return;
    }
    this.held.set(tab, read.held);
    for (const page of pages) {
      this.postBoard(page, tab);
      this.postNodes(page, tab);
    }
  }

  shows(page: Page, tab: Tab): boolean {
    return this.shown.get(page) === tab.id;
  }

  hide(page: Page): void {
    const tab = this.shown.get(page);
    if (this.shown.delete(page)) {
      post(page, { type: 'hide' });
    }
    if (tab !== undefined) {
      this.unwatchHidden(tab);
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
    this.unwatchHidden(tab.id);
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
        if (done !== undefined && edit?.kind === 'link') {
          this.postNodes(page, tab);
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
      case 'placeFiles':
        await this.dropped(page, sent.files, { tab, box: sent.box });
        return;
      default:
        return;
    }
    if (held.board.changed() !== wasChanged) {
      this.shell.postTabs(page);
    }
  }

  async dropped(page: Page, files: unknown, message: unknown): Promise<void> {
    const drop = dropOf(files, message);
    const held = drop === undefined ? undefined : this.held.get(drop.tab);
    const access = this.access.files;
    if (
      drop === undefined ||
      held === undefined ||
      access === undefined ||
      !this.shell.holds(page, drop.tab)
    ) {
      return;
    }
    await this.inTurn(drop.tab, () =>
      this.droppedNow(page, drop, held, access),
    );
  }

  private async droppedNow(
    page: Page,
    drop: CanvasDrop & { readonly files: readonly string[] },
    held: Held,
    access: FileAccess,
  ): Promise<void> {
    const root = await vaultOf(held.file, access.isFolder);
    const inside = drop.files.flatMap((file) => fileIn(root, file) ?? []);
    const outside = drop.files.filter(
      (file) => fileIn(root, file) === undefined,
    );
    if (outside.length > 0) {
      this.shell.notice(page, {
        level: 'info',
        message: strings.canvas.outsideVault(outside, root),
      });
    }
    if (inside.length === 0 || this.held.get(drop.tab) !== held) {
      return;
    }
    const wasChanged = held.board.changed();
    const { box } = drop;
    const done = held.board.apply(
      {
        kind: 'files',
        files: inside.map((file, at) => ({
          file,
          box: { ...box, y: box.y + at * box.height },
        })),
      },
      this.access.newId ?? hexId,
    );
    if (done === undefined) {
      return;
    }
    this.postBoard(page, drop.tab, done.made);
    this.postNodes(page, drop.tab);
    if (held.board.changed() !== wasChanged) {
      this.shell.postTabs(page);
    }
  }

  private inTurn<T>(tab: string, work: () => Promise<T>): Promise<T> {
    const before = this.turns.get(tab) ?? Promise.resolve();
    const next = before.then(work, work);
    this.turns.set(tab, next);
    const done = () => {
      if (this.turns.get(tab) === next) {
        this.turns.delete(tab);
      }
    };
    void next.then(done, done);
    return next;
  }

  private save(page: Page, tab: string): Promise<boolean> {
    return this.inTurn(tab, () => this.saveNow(page, tab));
  }

  private async saveNow(page: Page, tab: string): Promise<boolean> {
    const held = this.held.get(tab);
    if (held === undefined) {
      return false;
    }
    if (!held.board.changed() && !held.made) {
      return true;
    }
    const checkpoint = held.board.checkpoint();
    try {
      await this.access.saveFile(
        held.file,
        new TextEncoder().encode(checkpoint.text),
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
    held.written = checkpoint.text;
    held.board.saved(checkpoint);
    held.made = false;
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
    for (const { stop } of this.watching.values()) {
      stop();
    }
    this.watching.clear();
  }
}
