import type { Sentence } from '../../lib/shared/sentences';
import type { PathLooks } from '../../lib/shared/partLooks';
import type { PathFacts } from '../../lib/shared/pathFacts';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AboutInfo, UpdateStatus } from '../../shell/shared/protocol';
import type { FolderPurpose, GitHost } from '../../tools/git/main/tool';
import type {
  CommandInstall,
  CommandState,
} from '../../shell/main/commandOffer';
import type { DragEvent } from '../../shell/main/dragEvents';
import type { ShellHost } from '../../shell/main/shell';
import type { TaskbarBadge } from '../../shell/main/taskbarBadge';

export class FakeHost implements ShellHost, GitHost {
  readonly viewedFiles = path.join(os.tmpdir(), 'fastforward-viewed-files');
  folders: readonly string[] = [];
  folder: string | undefined;
  readonly foldersAsked: [FolderPurpose, string | undefined][] = [];
  clipboard = '';
  problems: readonly string[] = [];
  unsavedState: Sentence[] = [];
  update: UpdateStatus = { kind: 'idle' };
  commandPlace = false;
  command: CommandState = 'missing';
  installs: CommandInstall | Error = {
    kind: 'installed',
    path: '/usr/local/bin/ff',
    onPath: true,
  };
  readonly opened: string[] = [];
  canInstallCommand(): boolean {
    return this.commandPlace;
  }

  commandState(): Promise<CommandState> {
    return Promise.resolve(this.command);
  }

  installCommand(): Promise<CommandInstall> {
    this.opened.push('install command');
    return this.installs instanceof Error
      ? Promise.reject(this.installs)
      : Promise.resolve(this.installs);
  }

  chooseFolders(): Promise<readonly string[]> {
    return Promise.resolve(this.folders);
  }

  chooseFolder(
    purpose: FolderPurpose,
    from?: string,
  ): Promise<string | undefined> {
    this.foldersAsked.push([purpose, from]);
    return Promise.resolve(this.folder);
  }

  clipboardText(): Promise<string> {
    return Promise.resolve(this.clipboard);
  }

  userSettingsFile(): Promise<string> {
    this.opened.push('settings');
    return Promise.resolve(path.resolve('settings.user.json'));
  }

  defaultSettingsFile(): Promise<string> {
    this.opened.push('defaults');
    return Promise.resolve(path.resolve('settings.defaults.json'));
  }

  settingsProblems(): readonly Sentence[] {
    return this.problems;
  }

  stateProblems(): readonly Sentence[] {
    return this.unsavedState.splice(0);
  }

  checkForUpdates(): void {
    this.opened.push('update check');
  }

  installUpdate(): void {
    this.opened.push('update install');
  }

  quit(): void {
    this.opened.push('quit');
  }

  quitWithoutGpu(): void {
    this.opened.push('no GPU');
  }

  openWindow(window: string, near: string | undefined): void {
    this.opened.push(`open window ${window} near ${near ?? 'none'}`);
  }

  closeWindow(window: string): void {
    this.opened.push(`close window ${window}`);
  }

  showWindow(window: string): void {
    this.opened.push(`show window ${window}`);
  }

  readonly badges: (readonly [string, TaskbarBadge | undefined])[] = [];

  badgeTaskbar(window: string, badge: TaskbarBadge | undefined): void {
    this.badges.push([window, badge]);
  }

  tearsOff(): boolean {
    return true;
  }

  readonly dragged: (readonly [string, DragEvent])[] = [];

  drag(window: string, event: DragEvent): void {
    this.dragged.push([window, event]);
  }

  readonly facts = new Map<string, PathFacts>();
  readonly factsAsked: string[] = [];

  pathFacts(file: string): Promise<PathFacts> {
    this.factsAsked.push(file);
    return Promise.resolve(
      this.facts.get(file) ?? {
        kind: 'missing',
        inRepository: false,
        gitMissing: false,
      },
    );
  }

  readonly refusals = new Map<string, Sentence>();

  editRefusal(file: string): Promise<Sentence | undefined> {
    return Promise.resolve(this.refusals.get(file));
  }

  readonly cloned: string[] = [];
  readonly inited: string[] = [];
  readonly shellMenus: [
    readonly string[],
    { readonly x: number; readonly y: number },
    boolean,
  ][] = [];

  readonly openedWithSystem: string[] = [];

  openWithSystem(file: string): Promise<string> {
    this.openedWithSystem.push(file);
    return Promise.resolve(
      file.endsWith('locked.txt') ? 'Access is denied.' : '',
    );
  }

  cloneInto(folder: string): Promise<void> {
    this.cloned.push(folder);
    return Promise.resolve();
  }

  initRepository(folder: string): Promise<void> {
    this.inited.push(folder);
    return Promise.resolve();
  }

  shellMenu(
    files: readonly string[],
    at: { readonly x: number; readonly y: number },
    extended: boolean,
  ): Promise<void> {
    this.shellMenus.push([files, at, extended]);
    return Promise.resolve();
  }

  readonly looked: (readonly string[])[] = [];

  partLooks(paths: readonly string[]): Promise<readonly PathLooks[]> {
    this.looked.push(paths);
    return Promise.resolve(
      paths.map((looked) => ({
        path: looked,
        parts: [
          { hidden: looked.includes('.hidden'), file: true, executable: false },
        ],
      })),
    );
  }

  updateStatus(): UpdateStatus {
    return this.update;
  }

  about(): AboutInfo {
    return {
      version: '1.2.3',
      development: true,
      git: '2.52.0',
      system: 'Windows 11, build 26300, x64',
    };
  }

  copyText(text: string): void {
    this.opened.push(`copy ${text}`);
  }
}
