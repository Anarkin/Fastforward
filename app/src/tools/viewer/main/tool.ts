import * as path from 'node:path';
import type { TextEncoding } from '../../../lib/shared/textEncodings';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/toolContract';
import type { ViewerToHost } from '../shared/protocol';
import { viewerIconUrl } from './icons';
import type { WatchFolder } from '../../../lib/main/watch';
import { post } from './post';
import { ViewerPages } from './viewerPages';
import { Viewers } from './viewers';
import { ViewerFind } from './viewerFind';
import { ViewedPdfPlaces } from './viewedPdfPlaces';
import type { PdfPlaceStore } from './pdfPlaces';
import { ViewerMessages } from './viewerMessages';
import { Serving } from './serving';

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
}

export class ViewerTool implements Tool<'viewer'> {
  private shell: ShellAccess = unattachedShell;
  private readonly pages = new ViewerPages();
  private readonly viewers: Viewers;
  private readonly messages: ViewerMessages;
  private readonly serving: Serving;

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
    );
    this.serving = new Serving(access, () => this.shell.tabs());
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
    post(page, { type: 'show', tab: tab.id, file: tab.root });
    await this.viewers.startViewing(page, tab.id, tab.root);
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
    if (viewed?.root !== undefined) {
      await this.access.editViewed(page, tab, viewed.root, at);
    }
  }
}
