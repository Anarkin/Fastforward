import type { DiffLayout, GitToWebviewOf } from '../shared/protocol';
import type { GitSettings } from '../shared/settings';
import type { DiffSettings } from '../../../lib/shared/diffSettings';
import type { UserSettings } from '../../../shell/main/userSettings';

const maxAutoFetchMinutes = Math.floor((2 ** 31 - 1) / 60_000);

export class GitPreferences {
  constructor(private readonly userSettings: UserSettings) {}

  private get settings(): GitSettings {
    return this.userSettings.settings.tools.git;
  }

  private get diff(): DiffSettings {
    return this.userSettings.settings.tools.diff;
  }

  get layout(): GitToWebviewOf<'layout'> {
    const { settings, diff } = this;
    return {
      type: 'layout',
      columnWidths: settings.columnWidths,
      defaultColumnWidths: this.userSettings.defaults.tools.git.columnWidths,
      collapseMerges: settings.collapseMerges,
      showEntireFile: diff.showEntireFile,
      ignoreWhitespace: diff.ignoreWhitespace,
      diffLayout: diff.diffLayout,
      showAllFiles: settings.showAllFiles,
      autoFetch: settings.autoFetch,
      autoFetchMinutes: this.fetchMinutes,
      hideDimmedButtons: settings.hideDimmedButtons,
    };
  }

  private get fetchMinutes(): number {
    return Math.min(
      Math.max(0, this.settings.autoFetchMinutes),
      maxAutoFetchMinutes,
    );
  }

  get autoFetchMinutes(): number {
    return this.settings.autoFetch ? this.fetchMinutes : 0;
  }

  async setAutoFetch(on: boolean): Promise<void> {
    await this.userSettings.setIn('git', 'autoFetch', on);
  }

  get collapseMerges(): boolean {
    return this.settings.collapseMerges;
  }

  async setCollapseMerges(collapse: boolean): Promise<void> {
    await this.userSettings.setIn('git', 'collapseMerges', collapse);
  }

  async setColumnWidths(widths: readonly number[]): Promise<void> {
    await this.userSettings.setIn('git', 'columnWidths', widths);
  }

  get showEntireFile(): boolean {
    return this.diff.showEntireFile;
  }

  async setShowEntireFile(show: boolean): Promise<void> {
    await this.userSettings.setIn('diff', 'showEntireFile', show);
  }

  get ignoreWhitespace(): boolean {
    return this.diff.ignoreWhitespace;
  }

  async setIgnoreWhitespace(ignore: boolean): Promise<void> {
    await this.userSettings.setIn('diff', 'ignoreWhitespace', ignore);
  }

  async setDiffLayout(layout: DiffLayout): Promise<void> {
    await this.userSettings.setIn('diff', 'diffLayout', layout);
  }

  async setShowAllFiles(show: boolean): Promise<void> {
    await this.userSettings.setIn('git', 'showAllFiles', show);
  }
}
