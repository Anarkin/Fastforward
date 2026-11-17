import { viewVersion } from '../shared/protocol';
import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';
import type { DiffSettings } from '../../../components/diff/shared/settings';
import type { Log } from '../../../shell/main/log';
import type { UserSettings } from '../../../shell/main/userSettings';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/toolContract';
import type { DiffToHost } from '../shared/protocol';
import { comparedNames, type GitRun } from './compare';
import { ComparedImages } from './comparedImages';
import { Comparisons } from './comparisons';
import { isWellFormed } from './messageChecks';
import { post } from './post';

export interface DiffAccess {
  readonly log: Log;
  readonly userSettings: UserSettings;
  readonly run: GitRun;
  readonly missingGit: () => Promise<Sentence | undefined>;
}

export class DiffTool implements Tool<'diff'> {
  readonly viewVersion = viewVersion;
  private shell: ShellAccess = unattachedShell;
  private readonly comparisons: Comparisons;
  private readonly images: ComparedImages;

  constructor(private readonly access: DiffAccess) {
    this.comparisons = new Comparisons(
      access.log,
      access.run,
      () => this.settings,
      () => this.shell,
    );
    this.images = new ComparedImages(
      access.log,
      (tab) => this.comparisons.of(tab)?.compared,
    );
  }

  private get settings(): DiffSettings {
    return this.access.userSettings.settings.tools.diff;
  }

  attach(shell: ShellAccess): void {
    this.shell = shell;
  }

  ready(): void {}

  async show(page: Page, tab: Tab): Promise<void> {
    if (tab.compare === undefined) {
      return;
    }
    post(page, { type: 'show', tab: tab.id, settings: this.settings });
    const missing = await this.access.missingGit();
    if (missing !== undefined) {
      this.shell.notice(page, { level: 'error', message: missing });
    }
    await this.comparisons.show(page, tab.id, tab.compare);
  }

  shows(page: Page, tab: Tab): boolean {
    return this.comparisons.shown.get(page)?.tab === tab.id;
  }

  hide(page: Page): void {
    if (this.comparisons.shown.has(page)) {
      this.comparisons.stop(page);
      post(page, { type: 'hide' });
    }
  }

  preload(): Promise<void> {
    return Promise.resolve();
  }

  closed(page: Page, tab: Tab): void {
    post(page, { type: 'closed', tab: tab.id });
    for (const [shownIn, comparing] of this.comparisons.shown) {
      if (comparing.tab === tab.id) {
        this.comparisons.stop(shownIn);
      }
    }
  }

  async receive(page: Page, message: DiffToHost): Promise<void> {
    if (!isWellFormed(message)) {
      return;
    }
    switch (message.type) {
      case 'loadTexts':
        await this.comparisons.sendTexts(page, message.requests);
        return;
      case 'setShowEntireFile':
        this.save(this.setting('showEntireFile', message.show));
        await this.comparisons.send(page);
        return;
      case 'setIgnoreWhitespace':
        this.save(this.setting('ignoreWhitespace', message.ignore));
        await this.comparisons.send(page);
        return;
      case 'setDiffLayout':
        this.save(this.setting('diffLayout', message.layout));
        return;
      default:
        message satisfies never;
    }
  }

  refreshShown(page: Page): Promise<void> {
    return this.comparisons.send(page);
  }

  names(tabs: readonly Tab[]): ReadonlyMap<string, TabName> {
    return new Map(
      tabs.flatMap((tab): [string, TabName][] =>
        tab.compare === undefined
          ? []
          : [
              [
                tab.id,
                {
                  name: strings.messages.compareTab(
                    ...comparedNames(tab.compare),
                  ),
                },
              ],
            ],
      ),
    );
  }

  fits(): Promise<boolean> {
    return Promise.resolve(false);
  }

  folderOf(): string | undefined {
    return undefined;
  }

  visited(): void {}

  open(): Promise<void> {
    return Promise.resolve();
  }

  newTab(): Promise<void> {
    return Promise.resolve();
  }

  reloadSettings(): void {
    for (const page of this.comparisons.shown.keys()) {
      void this.comparisons.send(page);
    }
  }

  quit(): void {
    for (const page of this.comparisons.shown.keys()) {
      this.comparisons.stop(page);
    }
  }

  image(url: URL): Promise<Response> {
    return this.shell.track(this.images.image(url));
  }

  private setting<K extends keyof DiffSettings>(
    key: K,
    value: DiffSettings[K],
  ): Promise<void> {
    return this.access.userSettings.setIn('diff', key, value);
  }

  private save(saving: Promise<void>): void {
    void saving.catch((error: unknown) => {
      this.access.log.error(strings.log.savingFailed);
      this.access.log.error(error);
    });
  }
}
