import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import type { UserSettings } from '../shell/main/userSettings';
import type { GitLocator } from '../tools/git/main/gitLocator';
import { watchFolder } from '../lib/main/watch';
import { systemCodePage } from '../components/encodings/main/codePages';
import type { CommanderTool } from '../tools/commander/main/tool';
import { editorConfigOf } from '../tools/editor/main/config';
import { saveFile } from '../tools/editor/main/fileSaving';
import { gitEndingOf } from '../tools/editor/main/gitEnding';
import {
  endingSourcesOf,
  textDefaultsOf,
  type TextDefaultSources,
} from '../tools/editor/main/textDefaults';
import { EditorTool } from '../tools/editor/main/tool';

export interface EditorHostDeps {
  readonly userSettings: UserSettings;
  readonly git: GitLocator;
  readonly defaultSettingsCopy: string;
  readonly commanderTool: CommanderTool;
}

export function editorToolOf({
  userSettings,
  git,
  defaultSettingsCopy,
  commanderTool,
}: EditorHostDeps): EditorTool {
  const sources = (): TextDefaultSources => ({
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
  return new EditorTool({
    watch: (file, onChange) => watchFolder(file, onChange),
    codePage: () => systemCodePage(process.platform),
    saveEdited: async (file, bytes, overwriteReadOnly) =>
      saveFile(file, bytes, {
        overwriteReadOnly,
        ...(process.platform === 'win32' && {
          replaceFile: (
            await import('../tools/editor/main/windowsReplaceFile.js')
          ).windowsReplaceFile(),
        }),
      }),
    readOnlyFile: (file) => path.relative(file, defaultSettingsCopy) === '',
    editorDefaults: (file, asksGit) => textDefaultsOf(file, asksGit, sources()),
    editorSources: (file) => endingSourcesOf(file, sources()),
    closesBrackets: () => userSettings.settings.tools.editor.closeBrackets,
    fileIcon: async (file) =>
      (await app.getFileIcon(file, { size: 'normal' })).toPNG(),
    viewedCopy: (file) => commanderTool.viewedCopy(file),
    readOnlyCopy: (file) => commanderTool.readOnlyCopy(file),
    copySaved: (file) => commanderTool.copySaved(file),
  });
}
