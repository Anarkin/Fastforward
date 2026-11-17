import { viewVersion } from '../shared/protocol';
import * as path from 'node:path';
import { strings } from '../../../lib/shared/strings';
import { sameRoot } from '../../../lib/main/paths';
import { fileTabIcon } from '../../../lib/main/fileTabIcons';
import type { Sentence } from '../../../lib/shared/sentences';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/toolContract';
import type { EditorToHost } from '../shared/protocol';
import { Editing, type ViewedStart } from './editing';
import { editingFiles, type EditingFilesAccess } from './editingFiles';
import { editorIconRoute, editorIconUrl } from './icons';
import { post } from './post';

export interface EditorAccess extends EditingFilesAccess {
  readonly closesBrackets: () => boolean;
  readonly fileIcon: (file: string) => Promise<Uint8Array>;
  readonly viewedCopy: (file: string) => boolean;
}

export class EditorTool implements Tool<'editor'> {
  readonly viewVersion = viewVersion;
  private shell: ShellAccess = unattachedShell;
  private readonly shown = new Map<Page, string>();
  private readonly editing: Editing;

  constructor(private readonly access: EditorAccess) {
    this.editing = new Editing(editingFiles(access), {
      post: (page, message) => post(page, message),
      notice: (page, notice) => this.shell.notice(page, notice),
      namesChanged: (page) => this.shell.postTabs(page),
      pagesShowing: (tab) =>
        [...this.shown].flatMap(([page, shown]) =>
          shown === tab ? [page] : [],
        ),
      holds: (page, tab) => this.shell.holds(page, tab),
      openEdit: (page, file) => this.shell.openEdit(page, file),
    });
  }

  attach(shell: ShellAccess): void {
    this.shell = shell;
  }

  ready(page: Page): void {
    this.postSettings(page);
  }

  async show(page: Page, tab: Tab): Promise<void> {
    for (const [other, shown] of this.shown) {
      if (shown === tab.id && other !== page) {
        this.shown.delete(other);
        post(other, { type: 'hide' });
      }
    }
    if (tab.root === undefined) {
      return;
    }
    this.shown.set(page, tab.id);
    post(page, { type: 'show', tab: tab.id, file: tab.root });
    await this.editing.show(page, tab.id, tab.root);
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
    this.editing.closed(tab.id);
  }

  receive(page: Page, message: EditorToHost): Promise<void> {
    return this.editing.receive(page, message);
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
                  icon: editorIconUrl(tab.id, tab.root),
                  ...(this.editing.unsaved(tab.id) && { unsaved: true }),
                },
              ],
            ],
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

  open(): Promise<void> {
    return Promise.resolve();
  }

  newTab(): Promise<void> {
    return Promise.resolve();
  }

  reloadSettings(): void {
    for (const page of this.shell.pages()) {
      this.postSettings(page);
    }
  }

  unsaved(tab: Tab): boolean {
    return this.editing.unsaved(tab.id);
  }

  saveUnsaved(page: Page, tab: Tab): Promise<boolean> {
    return this.editing.save(page, tab.id);
  }

  quit(): void {
    this.shown.clear();
  }

  icon(url: URL): Promise<Response> {
    return fileTabIcon(
      editorIconRoute,
      url,
      this.shell.tabs().filter((tab) => tab.tool === 'editor'),
      this.access.fileIcon,
    );
  }

  refusal(file: string, named = file): Promise<Sentence | undefined> {
    return this.editing.refusal(file, named);
  }

  async editViewed(
    page: Page,
    tab: string,
    file: string,
    at: ViewedStart,
  ): Promise<void> {
    const refusal = this.access.viewedCopy(file)
      ? strings.editor.viewedCopy(path.basename(file))
      : await this.editing.refusal(file);
    if (refusal !== undefined) {
      this.shell.notice(page, { level: 'error', message: refusal });
      return;
    }
    const edited = this.shell
      .tabs()
      .some(
        (each) =>
          each.tool === 'editor' &&
          each.root !== undefined &&
          sameRoot(each.root, file),
      );
    if (edited) {
      await this.shell.openEdit(page, file);
      return;
    }
    this.editing.startAt(tab, at);
    await this.shell.editViewed(page, tab);
  }

  private postSettings(page: Page): void {
    post(page, {
      type: 'settings',
      closeBrackets: this.access.closesBrackets(),
    });
  }
}
