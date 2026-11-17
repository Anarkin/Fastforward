import { viewVersion } from '../shared/protocol';
import * as path from 'node:path';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/toolContract';
import type { ViewedVersion, ViewerToHost } from '../shared/protocol';
import { viewerIconUrl } from './icons';
import type { WatchFolder } from '../../../lib/main/watch';
import { post } from './post';
import { ViewerPages } from './pages';
import { Viewers } from './viewers';
import { ViewerFind } from './find';
import { ViewedPdfPlaces } from './viewedPdfPlaces';
import type { PdfPlaceStore } from './pdfPlaces';
import { ViewerMessages } from './messages';
import { Serving } from './serving';
import { strings } from '../../../lib/shared/strings';
import { shortHash } from '../../../lib/shared/hashes';
import type { FileVersion } from '../../../shell/main/savedTabs';
import * as fs from 'node:fs';

interface Versions {
  readonly versions: readonly ViewedVersion[];
  readonly staged: boolean;
  readonly changed: boolean;
}

type VersionCopy =
  | { readonly kind: 'file'; readonly file: string }
  | { readonly kind: 'missing' | 'tooLarge' };

export interface ViewerAccess {
  readonly codePage: () => Promise<TextEncoding>;
  readonly watch: WatchFolder;
  readonly pdfPlaces: PdfPlaceStore;
  readonly hiddenParts: (file: string) => Promise<readonly boolean[]>;
  readonly fileIcon: (file: string) => Promise<Uint8Array>;
  readonly editViewed: (
    page: Page,
    tab: string,
    file: string,
    at: { readonly byte: number; readonly encoding?: TextEncoding },
  ) => Promise<void>;
  readonly closed: (file: string) => void;
  readonly versionCopy: (file: string, rev: string) => Promise<VersionCopy>;
  readonly fileHistory: (file: string) => Promise<Versions | undefined>;
}

export class ViewerTool implements Tool<'viewer'> {
  readonly viewVersion = viewVersion;
  private shell: ShellAccess = unattachedShell;
  private readonly pages = new ViewerPages();
  private readonly viewers: Viewers;
  private readonly messages: ViewerMessages;
  private readonly serving: Serving;
  private readonly copies = new Map<string, string>();
  private readonly listed = new Map<string, Versions>();

  constructor(private readonly access: ViewerAccess) {
    const pdfPlaces = new ViewedPdfPlaces(access, this.pages);
    this.viewers = new Viewers(
      access,
      this.pages,
      (file) => access.hiddenParts(file),
      (tab, file) => pdfPlaces.viewed(tab, file),
    );
    this.messages = new ViewerMessages(
      this.pages,
      this.viewers,
      new ViewerFind(this.pages),
      pdfPlaces,
      (page, tab, at) => this.editViewed(page, tab, at),
      (page, tab, rev) => this.chooseVersion(page, tab, rev),
    );
    this.serving = new Serving(
      access,
      () => this.shell.tabs(),
      (tab) => this.copies.get(tab.id),
    );
  }

  attach(shell: ShellAccess): void {
    this.shell = shell;
  }

  ready(): void {}

  async show(page: Page, tab: Tab): Promise<void> {
    this.pages.stopShowing(page);
    for (const [other, showing] of this.pages.shown) {
      if (showing.tab === tab.id) {
        this.pages.stopShowing(other);
        post(other, { type: 'hide' });
      }
    }
    if (tab.root === undefined) {
      return;
    }
    this.pages.shown.set(page, { tab: tab.id, viewingsAsked: 0 });
    post(page, {
      type: 'show',
      tab: tab.id,
      file: tab.root,
      ...(tab.version !== undefined && { version: tab.version.rev }),
    });
    const read =
      tab.version === undefined
        ? tab.root
        : await this.copyOf(page, tab.id, tab.root, tab.version);
    if (read !== undefined) {
      await this.viewers.startViewing(page, tab.id, tab.root, read);
    }
    await this.listVersions(page, tab.id, tab.version?.file ?? tab.root);
  }

  private async listVersions(
    page: Page,
    tab: string,
    file: string,
  ): Promise<void> {
    const [history, onDisk] = await Promise.all([
      this.access.fileHistory(file).catch(() => undefined),
      fs.promises.stat(file).then(
        (stats) => stats.isFile(),
        () => false,
      ),
    ]);
    if (history === undefined || history.versions.length === 0) {
      this.listed.delete(tab);
      return;
    }
    this.listed.set(tab, history);
    if (this.pages.shown.get(page)?.tab === tab) {
      post(page, {
        type: 'versions',
        tab,
        versions: history.versions,
        staged: history.staged,
        changed: history.changed,
        onDisk,
      });
    }
  }

  private async chooseVersion(
    page: Page,
    id: string,
    rev: string | undefined,
  ): Promise<void> {
    const tab = this.shell.tabs().find((each) => each.id === id);
    const listed = this.listed.get(id);
    if (tab?.root === undefined || listed === undefined) {
      return;
    }
    const file = tab.version?.file ?? tab.root;
    const chosen =
      rev === undefined
        ? { root: file, version: undefined }
        : rev === 'index'
          ? listed.staged
            ? { root: file, version: { rev, file } }
            : undefined
          : listed.versions
              .filter((each) => each.rev === rev && !each.gone)
              .map((each) => ({ root: each.path, version: { rev, file } }))
              .at(0);
    if (chosen === undefined) {
      return;
    }
    this.shell.setVersion(id, chosen.root, chosen.version);
    const { version: _was, ...kept } = tab;
    await this.show(page, {
      ...kept,
      root: chosen.root,
      ...(chosen.version !== undefined && { version: chosen.version }),
    });
  }

  private async copyOf(
    page: Page,
    tab: string,
    file: string,
    version: FileVersion,
  ): Promise<string | undefined> {
    const copy = await this.access
      .versionCopy(file, version.rev)
      .catch((): VersionCopy => ({ kind: 'missing' }));
    if (copy.kind === 'file') {
      this.copies.set(tab, copy.file);
      return copy.file;
    }
    if (this.pages.shown.get(page)?.tab === tab) {
      post(page, {
        type: 'viewing',
        tab,
        size: undefined,
        error:
          copy.kind === 'tooLarge'
            ? strings.diff.viewTooLarge(file)
            : strings.diff.viewMissing(file),
      });
    }
    return undefined;
  }

  shows(page: Page, tab: Tab): boolean {
    return this.pages.shown.get(page)?.tab === tab.id;
  }

  hide(page: Page): void {
    if (this.pages.shown.has(page)) {
      this.pages.stopShowing(page);
      post(page, { type: 'hide' });
    }
  }

  preload(): Promise<void> {
    return Promise.resolve();
  }

  closed(page: Page, tab: Tab): void {
    post(page, { type: 'closed', tab: tab.id });
    for (const [shownIn, showing] of this.pages.shown) {
      if (showing.tab === tab.id) {
        this.pages.stopShowing(shownIn);
      }
    }
    this.copies.delete(tab.id);
    this.listed.delete(tab.id);
    if (tab.root !== undefined) {
      this.access.closed(tab.root);
    }
  }

  receive(page: Page, message: ViewerToHost): Promise<void> {
    return this.messages.receive(page, message);
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
                  ...(tab.version !== undefined && {
                    folder:
                      tab.version.rev === 'index'
                        ? strings.viewer.staged
                        : shortHash(tab.version.rev),
                  }),
                  icon: viewerIconUrl(tab.id, tab.root),
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

  reloadSettings(): void {}

  quit(): void {
    for (const page of this.pages.shown.keys()) {
      this.pages.stopShowing(page);
    }
  }

  file(url: URL, range: string | null): Promise<Response> {
    return this.serving.file(url, range);
  }

  icon(url: URL): Promise<Response> {
    return this.serving.icon(url);
  }

  private async editViewed(
    page: Page,
    tab: string,
    at: { readonly byte: number; readonly encoding?: TextEncoding },
  ): Promise<void> {
    const viewed = this.shell
      .tabs()
      .find((each) => each.id === tab && each.tool === 'viewer');
    if (viewed?.root === undefined) {
      return;
    }
    if (viewed.version !== undefined) {
      this.shell.notice(page, {
        level: 'error',
        message: strings.viewer.versionNotEdited(viewed.root),
      });
      return;
    }
    await this.access.editViewed(page, tab, viewed.root, at);
  }
}
