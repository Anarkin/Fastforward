import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { app, type BrowserWindow, nativeImage, screen, shell } from 'electron';
import type { Log } from '../shell/main/log';
import type { UserSettings } from '../shell/main/userSettings';
import type { JsonFileStore } from '../shell/main/stateFile';
import { toolState } from '../shell/main/storage';
import type { GitTool } from '../tools/git/main/tool';
import type { GitLocator } from '../tools/git/main/gitLocator';
import { fileSystemFor } from '../tools/commander/main/fileSystem';
import { systemCodePage } from '../tools/commander/main/codePages';
import { renameUnlessTaken } from '../tools/commander/main/renaming';
import {
  inRepository,
  isRepository,
} from '../tools/commander/main/repositories';
import { folderStamp, watchFolder } from '../lib/main/watch';
import { watchTree } from '../tools/commander/main/watchTree';
import { elevatedFileSystem } from '../tools/commander/main/elevated';
import { transferProcess } from '../tools/commander/main/transferProcess';
import {
  sizeWorkers,
  unpackedKoffi,
} from '../tools/commander/main/sizeWorkers';
import { hashWorkers } from '../tools/commander/main/hashWorkers';
import { sevenZipProgram } from '../tools/commander/main/sevenZip';
import { sevenZipReaderAt } from '../tools/commander/main/sevenZipReader';
import {
  readClipboardFiles,
  writeClipboardFiles,
} from '../tools/commander/main/clipboardFiles';
import { ThumbnailStore } from '../tools/commander/main/thumbnailStore';
import { editorConfigOf } from '../tools/commander/main/editorConfig';
import { saveFile } from '../tools/commander/main/fileSaving';
import { gitEndingOf } from '../tools/commander/main/gitEnding';
import {
  textDefaultsOf,
  endingSourcesOf,
  type TextDefaultSources,
} from '../tools/commander/main/textDefaults';
import { Archives } from '../tools/commander/main/archives';
import { CommanderTool } from '../tools/commander/main/tool';
import { rootFolder } from '../tools/commander/main/folderPaths';
import { thumbnailFolder } from './profile';

const smallestThumbnailCache = 16;

export interface CommanderHostDeps {
  readonly log: Log;
  readonly dist: string;
  readonly development: boolean;
  readonly userSettings: UserSettings;
  readonly state: JsonFileStore;
  readonly git: GitLocator;
  readonly gitTool: GitTool;
  readonly windows: {
    focusedWindow(): BrowserWindow | undefined;
  };
  readonly defaultSettingsCopy: string;
  readonly archiveWork: { readonly next: () => Promise<string> };
  readonly viewedFiles: string;
}

export function commanderToolOf({
  log,
  dist,
  development,
  userSettings,
  state,
  git,
  gitTool,
  windows,
  defaultSettingsCopy,
  archiveWork,
  viewedFiles,
}: CommanderHostDeps): CommanderTool {
  const editorSourcesOf = (): TextDefaultSources => ({
    settings: userSettings.settings.tools.editor,
    editorConfig: (edited) =>
      editorConfigOf(edited, (config) =>
        fs.promises.readFile(config, 'utf8').catch(() => undefined),
      ),
    gitEnding: (edited) =>
      git.path === undefined
        ? Promise.resolve(undefined)
        : gitEndingOf(git.path, edited),
  });
  return new CommanderTool({
    fileSystem: () => fileSystemFor(process.platform),
    codePage: () => systemCodePage(process.platform),
    saveEdited: async (file, bytes, overwriteReadOnly) =>
      saveFile(file, bytes, {
        overwriteReadOnly,
        ...(process.platform === 'win32' && {
          replaceFile: (
            await import('../tools/commander/main/windowsReplaceFile.js')
          ).windowsReplaceFile(),
        }),
      }),
    readOnlyFile: (file) => path.relative(file, defaultSettingsCopy) === '',
    editorDefaults: (file, asksGit) =>
      textDefaultsOf(file, asksGit, editorSourcesOf()),
    editorSources: (file) => endingSourcesOf(file, editorSourcesOf()),
    settings: () => userSettings.settings.tools.commander,
    closesBrackets: () => userSettings.settings.tools.editor.closeBrackets,
    defaultColumns: () => userSettings.defaults.tools.commander.columns,
    saveShowHidden: (shown) =>
      userSettings.setIn('commander', 'showHidden', shown),
    saveColumns: (columns) =>
      userSettings.setIn('commander', 'columns', columns),
    saveSorts: (sorts) => userSettings.setIn('commander', 'sort', sorts),
    saveBookmarks: (bookmarks) =>
      userSettings.setIn('commander', 'bookmarks', bookmarks),
    store: toolState(state, 'commander'),
    thumbnails: new ThumbnailStore(
      thumbnailFolder(
        process.platform,
        development,
        app.commandLine.getSwitchValue('user-data-dir'),
        os.homedir(),
        process.env,
      ),
      () =>
        Math.max(
          smallestThumbnailCache,
          userSettings.settings.tools.commander.thumbnailCacheMegabytes,
        ) *
        1024 *
        1024,
    ),
    ...(process.platform === 'win32' && {
      streamed: async (file: string) =>
        (
          await import('../tools/commander/main/windowsCloudFiles.js')
        ).streamsFromGoogleDrive(file),
      binOff: async (folder: string) =>
        (
          await import('../tools/commander/main/windowsRecycleBin.js')
        ).windowsRecycleBinOff(folder),
    }),
    isRepository,
    inRepository: (folder) => inRepository(folder),
    initRepository: (folder) => gitTool.initRepositoryIn(folder),
    cloneInto: (folder) => gitTool.cloneInto(folder),
    gitMissing: () => git.path === undefined,
    whenGitFound: (found) => git.whenFound(found),
    stamp: folderStamp,
    watch: watchFolder,
    ...(process.platform !== 'linux' && { watchTree }),
    fileIcon: async (file) =>
      (await app.getFileIcon(file, { size: 'normal' })).toPNG(),
    platform: process.platform,
    ...(process.platform === 'win32' && {
      elevate: async () => {
        const { windowsLauncher } =
          await import('../tools/commander/main/windowsElevation.js');
        return elevatedFileSystem(
          windowsLauncher(
            process.execPath,
            process.defaultApp ? path.resolve(process.argv[1]) : undefined,
            () => {
              const window = windows.focusedWindow();
              return window === undefined || window.isDestroyed()
                ? undefined
                : window.getNativeWindowHandle();
            },
          ),
          process.platform,
        );
      },
      shellMenu: async (files, at, extended) => {
        const { showShellMenu } =
          await import('../tools/commander/main/windowsShellMenu.js');
        const window = windows.focusedWindow();
        if (window === undefined || window.isDestroyed()) {
          return;
        }
        const content = window.getContentBounds();
        const zoom = window.webContents.getZoomFactor();
        showShellMenu(
          window.getNativeWindowHandle(),
          files,
          screen.dipToScreenPoint({
            x: content.x + at.x * zoom,
            y: content.y + at.y * zoom,
          }),
          extended,
        );
      },
    }),
    archives: new Archives(
      sevenZipReaderAt(
        sevenZipProgram({
          packaged: app.isPackaged,
          resourcesPath: process.resourcesPath,
          appPath: app.getAppPath(),
          platform: process.platform,
          arch: process.arch,
        }),
      ),
      process.platform,
      archiveWork.next,
    ),
    viewedCopies: viewedFiles,
    realPath: (link) => fs.promises.realpath(link),
    openFile: (file) => shell.openPath(file),
    trash: (file) => shell.trashItem(file),
    remove: (file) => fs.promises.rm(file, { recursive: true }),
    makeFolder: (folder) => fs.promises.mkdir(folder),
    renameItem: renameUnlessTaken,
    clipboardFiles: { write: writeClipboardFiles, read: readClipboardFiles },
    startDrag: async ([file, ...more]) => {
      if (file === undefined) {
        return;
      }
      const icon = await app
        .getFileIcon(file, { size: 'normal' })
        .catch(() => nativeImage.createEmpty());
      const window = windows.focusedWindow();
      if (window !== undefined && !window.isDestroyed()) {
        window.webContents.startDrag({ file, files: [file, ...more], icon });
      }
    },
    connectTransfer: transferProcess(path.join(dist, 'transferHost.js'), log),
    contentReader: hashWorkers(dist),
    sizeWalker: sizeWorkers(
      dist,
      process.platform === 'win32' ? unpackedKoffi() : undefined,
    ),
    root: rootFolder(process.platform, process.env),
    home: os.homedir(),
    variable: (name) => process.env[name],
    ...(process.platform === 'win32' && {
      knownFolder: async (name: string) =>
        (
          await import('../tools/commander/main/windowsKnownFolders.js')
        ).windowsKnownFolder(name),
    }),
  });
}
