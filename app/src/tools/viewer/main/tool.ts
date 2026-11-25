import type { FileTabSize } from '../../../lib/shared/tabSize';
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
import type { CopiedAs, ViewerToHost } from '../shared/protocol';
import type { FileHistoryListed } from '../../../components/versions/shared/versions';
import type { WatchFolder } from '../../../lib/main/watch';
import { post } from './post';
import { ViewerPages } from './pages';
import { Viewers } from './viewers';
import { ViewerFind } from './find';
import { ViewedPdfPlaces } from './viewedPdfPlaces';
import type { PdfPlaceStore } from './pdfPlaces';
import { ViewerMessages } from './messages';
import { wholeCopy } from './wholeCopies';
import { Serving } from './serving';
import { strings } from '../../../lib/shared/strings';
import { shortHash } from '../../../lib/shared/hashes';
import type { FileVersion } from '../../../shell/main/savedTabs';
import { fs } from '../../../lib/main/files';
import { reasonOf } from '../../../lib/main/reasons';

type VersionCopy =
  | { readonly kind: 'file'; readonly file: string }
  | { readonly kind: 'missing' | 'tooLarge' };

export interface ViewerAccess {
  readonly copy: (text: string) => void;
  readonly codePage: () => Promise<TextEncoding>;
  readonly fileTabSize: (file: string) => Promise<FileTabSize | undefined>;
  readonly watch: WatchFolder;
  readonly pdfPlaces: PdfPlaceStore;
  readonly hiddenParts: (file: string) => Promise<readonly boolean[]>;
  readonly editViewed: (
    page: Page,
    file: string,
    at: { readonly byte: number; readonly encoding?: TextEncoding },
  ) => Promise<void>;
  readonly closed: (file: string) => void;
  readonly versionCopy: (file: string, rev: string) => Promise<VersionCopy>;
  readonly fileHistory: (
    file: string,
  ) => Promise<FileHistoryListed | undefined>;
  readonly compareHistory: (
    page: Page,
    file: string,
    rev: string | undefined,
  ) => Promise<void>;
}

export class ViewerTool implements Tool<'viewer'> {
  readonly viewVersion = viewVersion;
  private shell: ShellAccess = unattachedShell;
  private readonly pages = new ViewerPages();
  private readonly viewers: Viewers;
  private readonly messages: ViewerMessages;
  private readonly serving: Serving;
  private readonly copies = new Map<string, string>();
  private readonly listed = new Map<string, FileHistoryListed>();
  private readonly starts = new Map<
    string,
    { readonly byte: number; readonly encoding?: TextEncoding }
  >();

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
      (page, tab) => this.editTabSizeSource(page, tab),
      (page, tab, rev) => this.chooseVersion(page, tab, rev),
      (page, tab) => this.compareVersions(page, tab),
      (page, as, encoding) => this.copyWhole(page, as, encoding),
    );
    this.serving = new Serving(
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
    const start =
      tab.version === undefined ? this.starts.get(tab.root) : undefined;
    if (tab.version === undefined) {
      this.starts.delete(tab.root);
    }
    post(page, {
      type: 'show',
      tab: tab.id,
      file: tab.root,
      ...(tab.version !== undefined && { version: tab.version.rev }),
      ...(start !== undefined && { at: start.byte }),
      ...(start?.encoding !== undefined && { encoding: start.encoding }),
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

  async viewEdited(
    page: Page,
    file: string,
    start: { readonly byte: number; readonly encoding?: TextEncoding },
  ): Promise<void> {
    if (!this.shell.shows('viewer', file)) {
      this.starts.set(file, start);
    }
    await this.shell.open(page, 'viewer', [file], true);
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

  private compareVersions(page: Page, id: string): Promise<void> {
    const tab = this.shell.tabs().find((each) => each.id === id);
    return tab?.root === undefined
      ? Promise.resolve()
      : this.access.compareHistory(
          page,
          tab.version?.file ?? tab.root,
          tab.version?.rev,
        );
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
                        ? strings.versions.staged
                        : shortHash(tab.version.rev),
                  }),
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
    await this.access.editViewed(page, viewed.root, at);
  }

  private async editTabSizeSource(page: Page, tab: string): Promise<void> {
    const viewed = this.shell
      .tabs()
      .find((each) => each.id === tab && each.tool === 'viewer');
    if (viewed?.root === undefined) {
      return;
    }
    const source = (await this.access.fileTabSize(viewed.root))?.file;
    if (source !== undefined) {
      await this.access.editViewed(page, source, { byte: 0 });
    }
  }

  private async copyWhole(
    page: Page,
    as: CopiedAs,
    encoding: TextEncoding,
  ): Promise<void> {
    const viewing = this.pages.shown.get(page)?.viewing;
    if (viewing === undefined) {
      return;
    }
    let copied: Awaited<ReturnType<typeof wholeCopy>>;
    try {
      copied = await wholeCopy(viewing.file, viewing.size, as, encoding);
    } catch (error) {
      this.shell.notice(page, {
        level: 'error',
        message: strings.textFile.couldNotRead(viewing.file, reasonOf(error)),
      });
      return;
    }
    if (copied.kind === 'copied') {
      this.access.copy(copied.text);
      return;
    }
    this.shell.notice(page, {
      level: 'error',
      message: strings.viewer.tooLargeToCopy(
        copied.megabytes,
        copied.most,
        copied.as,
      ),
    });
  }
}
