import type { DiffLayout, GitToWebviewOf } from '../shared/protocol';
import type { GitSettings } from '../shared/settings';
import type { UserSettings } from '../../../shell/main/userSettings';

const maxAutoFetchMinutes = Math.floor((2 ** 31 - 1) / 60_000);

export class GitPreferences {
  constructor(private readonly userSettings: UserSettings) {}

  private get settings(): GitSettings {
    return this.userSettings.settings.tools.git;
  }

  get layout(): GitToWebviewOf<'layout'> {
    const { settings } = this;
    return {
      type: 'layout',
      columnWidths: settings.columnWidths,
      defaultColumnWidths: this.userSettings.defaults.tools.git.columnWidths,
      collapseMerges: settings.collapseMerges,
      showEntireFile: settings.showEntireFile,
      ignoreWhitespace: settings.ignoreWhitespace,
      diffLayout: settings.diffLayout,
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
    return this.settings.showEntireFile;
  }

  async setShowEntireFile(show: boolean): Promise<void> {
    await this.userSettings.setIn('git', 'showEntireFile', show);
  }

  get ignoreWhitespace(): boolean {
    return this.settings.ignoreWhitespace;
  }

  async setIgnoreWhitespace(ignore: boolean): Promise<void> {
    await this.userSettings.setIn('git', 'ignoreWhitespace', ignore);
  }

  async setDiffLayout(layout: DiffLayout): Promise<void> {
    await this.userSettings.setIn('git', 'diffLayout', layout);
  }

  async setShowAllFiles(show: boolean): Promise<void> {
    await this.userSettings.setIn('git', 'showAllFiles', show);
  }
}
